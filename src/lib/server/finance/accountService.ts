import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "$lib/server/db";
import { isUuid } from "$lib/server/db/ids";
import { accounts, financeLogs, journalLines } from "$lib/server/db/schema";
import type { Cents } from "$lib/money";
import type { AccountSphere, AccountType, AccountView } from "./types";
import { isUniqueViolation } from "$lib/server/db/errors";

/**
 * Kontenplan.
 *
 * Die Konten aus dem mitgelieferten Kontenrahmen sind als Systemkonten
 * markiert und koennen nicht geloescht werden -- sie tragen die
 * Geschaeftslogik (Forderungen, Verbindlichkeiten, Eigenkapital). Bebuchte
 * Konten koennen ebenfalls nicht geloescht, nur deaktiviert werden.
 */

type AccountRow = typeof accounts.$inferSelect;

export function toAccountView(row: AccountRow): AccountView {
    return {
        id: row.id,
        number: row.number,
        name: row.name,
        type: row.type,
        sphere: row.sphere,
        parentId: row.parentId,
        description: row.description,
        active: row.active,
        isBank: row.isBank,
        system: row.system
    };
}

export async function listAccounts(
    options: { activeOnly?: boolean; type?: AccountType } = {}
): Promise<AccountView[]> {
    const conditions = [];
    if (options.activeOnly) conditions.push(eq(accounts.active, true));
    if (options.type) conditions.push(eq(accounts.type, options.type));

    const rows = await db
        .select()
        .from(accounts)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(accounts.number));

    return rows.map(toAccountView);
}

export async function getAccount(id: string): Promise<AccountView | null> {
    if (!isUuid(id)) return null;
    const [row] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
    return row ? toAccountView(row) : null;
}

export interface AccountInput {
    number: string;
    name: string;
    type: AccountType;
    sphere?: AccountSphere;
    parentId?: string | null;
    description?: string;
    isBank?: boolean;
}

export async function createAccount(
    input: AccountInput,
    user: string
): Promise<{ ok: boolean; error?: string; account?: AccountView }> {
    const number = input.number.trim();
    if (!/^\d{3,6}$/.test(number)) {
        return { ok: false, error: "Die Kontonummer muss aus 3 bis 6 Ziffern bestehen." };
    }
    if (!input.name.trim()) {
        return { ok: false, error: "Bitte einen Kontonamen angeben." };
    }

    try {
        const [row] = await db
            .insert(accounts)
            .values({
                number,
                name: input.name.trim(),
                type: input.type,
                sphere: input.sphere ?? "ideell",
                parentId: isUuid(input.parentId) ? input.parentId : null,
                description: input.description ?? "",
                isBank: input.isBank ?? false,
                system: false
            })
            .returning();

        await db.insert(financeLogs).values({
            entity: "account",
            entityId: row.id,
            action: "create",
            user
        });

        return { ok: true, account: toAccountView(row) };
    } catch (err: unknown) {
        if (isUniqueViolation(err)) {
            return { ok: false, error: `Das Konto ${number} existiert bereits.` };
        }
        throw err;
    }
}

export async function updateAccount(
    id: string,
    input: Partial<AccountInput> & { active?: boolean },
    user: string
): Promise<{ ok: boolean; error?: string }> {
    if (!isUuid(id)) return { ok: false, error: "Ungültige Kennung." };

    const before = await getAccount(id);
    if (!before) return { ok: false, error: "Konto nicht gefunden." };

    const update: Partial<typeof accounts.$inferInsert> = { updatedAt: new Date() };
    if (input.name !== undefined) update.name = input.name.trim();
    if (input.sphere !== undefined) update.sphere = input.sphere;
    if (input.description !== undefined) update.description = input.description;
    if (input.active !== undefined) update.active = input.active;
    if (input.parentId !== undefined) {
        update.parentId = isUuid(input.parentId) ? input.parentId : null;
    }

    // Nummer und Kontoart eines Systemkontos bleiben unangetastet: die
    // Geschaeftslogik sucht Konten ueber ihre Nummer.
    if (!before.system) {
        if (input.number !== undefined) update.number = input.number.trim();
        if (input.type !== undefined) update.type = input.type;
    }

    await db.update(accounts).set(update).where(eq(accounts.id, id));

    await db.insert(financeLogs).values({
        entity: "account",
        entityId: id,
        action: "update",
        changes: Object.entries(update)
            .filter(([field]) => field !== "updatedAt")
            .map(([field, after]) => ({
                field,
                before: (before as unknown as Record<string, unknown>)[field] ?? null,
                after
            })),
        user
    });

    return { ok: true };
}

export async function deleteAccount(
    id: string,
    user: string
): Promise<{ ok: boolean; error?: string }> {
    if (!isUuid(id)) return { ok: false, error: "Ungültige Kennung." };

    const account = await getAccount(id);
    if (!account) return { ok: false, error: "Konto nicht gefunden." };
    if (account.system) {
        return {
            ok: false,
            error: "Konten des Kontenrahmens können nicht gelöscht, nur deaktiviert werden."
        };
    }

    const [used] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(journalLines)
        .where(eq(journalLines.accountId, id));

    if (Number(used?.count ?? 0) > 0) {
        return {
            ok: false,
            error: "Auf dieses Konto wurde bereits gebucht. Es kann nur deaktiviert werden."
        };
    }

    await db.delete(accounts).where(eq(accounts.id, id));
    await db.insert(financeLogs).values({
        entity: "account",
        entityId: id,
        action: "delete",
        user
    });

    return { ok: true };
}

/**
 * Salden aller Konten in EINER Abfrage.
 *
 * Vorzeichenkonvention: Aktiv- und Aufwandskonten Soll minus Haben, Passiv-,
 * Eigenkapital- und Ertragskonten umgekehrt. So sind alle Salden positiv,
 * wenn sie sich "normal" verhalten -- das ist die Darstellung, die man in
 * GuV und Bilanz erwartet.
 */
export async function accountBalances(at?: Date): Promise<Map<string, Cents>> {
    const rows = await db.execute<{ account_id: string; balance: string }>(sql`
        select
            l.account_id,
            sum(
                case
                    when a.type in ('asset', 'expense') then l.debit - l.credit
                    else l.credit - l.debit
                end
            )::bigint as balance
        from journal_lines l
        join accounts a on a.id = l.account_id
        join journal_entries e on e.id = l.entry_id
        ${at ? sql`where e.date <= ${at.toISOString().slice(0, 10)}` : sql``}
        group by l.account_id
    `);

    return new Map(rows.map((row) => [row.account_id, Number(row.balance)]));
}
