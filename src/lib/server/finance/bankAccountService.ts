import { and, asc, eq, lte, sql } from "drizzle-orm";
import { db, withTransaction } from "$lib/server/db";
import { isUuid } from "$lib/server/db/ids";
import { accounts, bankAccounts, journalEntries, journalLines } from "$lib/server/db/schema";
import type { Cents } from "$lib/money";
import type { BankAccountView } from "./types";

/**
 * Kassen- und Bankkonten.
 *
 * Jedes zeigt auf genau ein Sachkonto der Klasse "asset". Der Kontostand wird
 * NICHT gespeichert, sondern aus den Buchungszeilen dieses Sachkontos
 * berechnet -- ein gespeicherter Saldo laeuft frueher oder spaeter aus dem
 * Ruder, sobald irgendwo eine Buchung an ihm vorbei entsteht.
 */

/** Salden aller Bankkonten in einer Abfrage. */
async function balances(at?: Date): Promise<Map<string, Cents>> {
    const conditions = at ? [lte(journalEntries.date, at)] : [];

    const rows = await db
        .select({
            accountId: journalLines.accountId,
            debit: sql<string>`coalesce(sum(${journalLines.debit})::bigint, 0)`,
            credit: sql<string>`coalesce(sum(${journalLines.credit})::bigint, 0)`
        })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .groupBy(journalLines.accountId);

    return new Map(
        rows.map((row) => [row.accountId, Number(row.debit) - Number(row.credit)])
    );
}

export async function listBankAccounts(
    options: { activeOnly?: boolean; at?: Date } = {}
): Promise<BankAccountView[]> {
    const rows = await db
        .select({ bank: bankAccounts, account: accounts })
        .from(bankAccounts)
        .innerJoin(accounts, eq(accounts.id, bankAccounts.accountId))
        .where(options.activeOnly ? eq(bankAccounts.active, true) : undefined)
        .orderBy(asc(bankAccounts.sortOrder), asc(bankAccounts.name));

    const byAccount = await balances(options.at);

    return rows.map((row) => ({
        id: row.bank.id,
        name: row.bank.name,
        accountId: row.bank.accountId,
        accountNumber: row.account.number,
        accountHolder: row.bank.accountHolder,
        iban: row.bank.iban,
        bic: row.bank.bic,
        bankName: row.bank.bankName,
        isCash: row.bank.isCash,
        openingBalance: row.bank.openingBalance,
        active: row.bank.active,
        balance: row.bank.openingBalance + (byAccount.get(row.bank.accountId) ?? 0)
    }));
}

export async function getBankAccount(id: string): Promise<BankAccountView | null> {
    if (!isUuid(id)) return null;
    const all = await listBankAccounts();
    return all.find((entry) => entry.id === id) ?? null;
}

/** Das voreingestellte Konto: das erste aktive in der Sortierreihenfolge. */
export async function getDefaultBankAccount(): Promise<BankAccountView | null> {
    const all = await listBankAccounts({ activeOnly: true });
    return all[0] ?? null;
}

export interface BankAccountInput {
    name: string;
    /** Bestehendes Sachkonto; ohne Angabe wird eines angelegt. */
    accountId?: string;
    accountNumber?: string;
    accountHolder?: string;
    iban?: string;
    bic?: string;
    bankName?: string;
    isCash?: boolean;
    openingBalance?: Cents;
}

export async function createBankAccount(
    input: BankAccountInput
): Promise<{ ok: boolean; error?: string; id?: string }> {
    const name = input.name.trim();
    if (!name) return { ok: false, error: "Bitte einen Namen angeben." };

    try {
        const id = await withTransaction(async (tx) => {
            let accountId = isUuid(input.accountId) ? input.accountId : null;

            if (!accountId) {
                // Ohne bestehendes Sachkonto wird eines angelegt. Die Nummer
                // waechst ab 1201 aufwaerts, damit 1000 (Kasse) und 1200
                // (Bank) aus dem Kontenrahmen frei bleiben.
                const number = input.accountNumber?.trim() || (await nextBankAccountNumber(tx));
                const [account] = await tx
                    .insert(accounts)
                    .values({
                        number,
                        name,
                        type: "asset",
                        sphere: "neutral",
                        isBank: true,
                        system: false
                    })
                    .returning({ id: accounts.id });
                accountId = account.id;
            }

            const [row] = await tx
                .insert(bankAccounts)
                .values({
                    name,
                    accountId,
                    accountHolder: input.accountHolder ?? "",
                    iban: (input.iban ?? "").replace(/\s+/g, "").toUpperCase(),
                    bic: input.bic ?? "",
                    bankName: input.bankName ?? "",
                    isCash: input.isCash ?? false,
                    openingBalance: input.openingBalance ?? 0
                })
                .returning({ id: bankAccounts.id });

            return row.id;
        });

        return { ok: true, id };
    } catch (err: unknown) {
        if ((err as { code?: string })?.code === "23505") {
            return {
                ok: false,
                error: "Für dieses Sachkonto ist bereits ein Bankkonto eingerichtet."
            };
        }
        throw err;
    }
}

async function nextBankAccountNumber(tx: typeof db): Promise<string> {
    const [row] = await tx
        .select({ max: sql<string>`coalesce(max(${accounts.number}), '1200')` })
        .from(accounts)
        .where(and(eq(accounts.isBank, true), eq(accounts.type, "asset")));

    const next = Number(row?.max ?? "1200") + 1;
    return String(next);
}

export async function updateBankAccount(
    id: string,
    input: Partial<BankAccountInput> & { active?: boolean; sortOrder?: number }
): Promise<{ ok: boolean; error?: string }> {
    if (!isUuid(id)) return { ok: false, error: "Ungültige Kennung." };

    const update: Partial<typeof bankAccounts.$inferInsert> = { updatedAt: new Date() };
    if (input.name !== undefined) update.name = input.name.trim();
    if (input.accountHolder !== undefined) update.accountHolder = input.accountHolder;
    if (input.iban !== undefined) update.iban = input.iban.replace(/\s+/g, "").toUpperCase();
    if (input.bic !== undefined) update.bic = input.bic;
    if (input.bankName !== undefined) update.bankName = input.bankName;
    if (input.openingBalance !== undefined) update.openingBalance = input.openingBalance;
    if (input.active !== undefined) update.active = input.active;
    if (input.sortOrder !== undefined) update.sortOrder = input.sortOrder;

    await db.update(bankAccounts).set(update).where(eq(bankAccounts.id, id));
    return { ok: true };
}

export async function deleteBankAccount(id: string): Promise<{ ok: boolean; error?: string }> {
    if (!isUuid(id)) return { ok: false, error: "Ungültige Kennung." };

    const account = await getBankAccount(id);
    if (!account) return { ok: false, error: "Konto nicht gefunden." };

    const [used] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(journalLines)
        .where(eq(journalLines.accountId, account.accountId));

    if (Number(used?.count ?? 0) > 0) {
        return {
            ok: false,
            error: "Auf dieses Konto wurde bereits gebucht. Es kann nur deaktiviert werden."
        };
    }

    await db.delete(bankAccounts).where(eq(bankAccounts.id, id));
    return { ok: true };
}
