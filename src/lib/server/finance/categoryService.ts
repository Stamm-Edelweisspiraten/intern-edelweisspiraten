import { and, asc, eq } from "drizzle-orm";
import { db } from "$lib/server/db";
import { isUuid } from "$lib/server/db/ids";
import { accounts, bookingCategories } from "$lib/server/db/schema";
import type { BookingCategoryView, TransactionDirection } from "./types";
import { isUniqueViolation } from "$lib/server/db/errors";

/**
 * Buchungsarten der einfachen Erfassungsmaske.
 *
 * Ersetzt den festen Enum TRANSACTION_KINDS: jede Art zeigt auf ein
 * Erfolgskonto, daraus entsteht die Gegenbuchung. Frueher gab es zwei
 * Auswahllisten in der Oberflaeche, deren Inhalt voneinander abwich -- die
 * Liste kommt jetzt an jeder Stelle aus dieser Tabelle.
 */

export async function listCategories(
    options: { activeOnly?: boolean; direction?: TransactionDirection } = {}
): Promise<BookingCategoryView[]> {
    const conditions = [];
    if (options.activeOnly) conditions.push(eq(bookingCategories.active, true));
    if (options.direction) conditions.push(eq(bookingCategories.direction, options.direction));

    const rows = await db
        .select({ category: bookingCategories, account: accounts })
        .from(bookingCategories)
        .innerJoin(accounts, eq(accounts.id, bookingCategories.accountId))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(bookingCategories.direction), asc(bookingCategories.sortOrder));

    return rows.map((row) => ({
        id: row.category.id,
        name: row.category.name,
        direction: row.category.direction as TransactionDirection,
        accountId: row.category.accountId,
        accountNumber: row.account.number,
        accountName: row.account.name,
        active: row.category.active,
        system: row.category.system
    }));
}

export async function getCategory(id: string): Promise<BookingCategoryView | null> {
    if (!isUuid(id)) return null;
    const all = await listCategories();
    return all.find((entry) => entry.id === id) ?? null;
}

/** Sucht eine Buchungsart ueber ihren Namen -- fuer Beitraege und Bestellungen. */
export async function getCategoryByName(name: string): Promise<BookingCategoryView | null> {
    const all = await listCategories();
    return all.find((entry) => entry.name === name) ?? null;
}

export interface CategoryInput {
    name: string;
    direction: TransactionDirection;
    accountId: string;
}

export async function createCategory(
    input: CategoryInput
): Promise<{ ok: boolean; error?: string; id?: string }> {
    const name = input.name.trim();
    if (!name) return { ok: false, error: "Bitte einen Namen angeben." };
    if (!isUuid(input.accountId)) return { ok: false, error: "Bitte ein Konto auswählen." };

    try {
        const [row] = await db
            .insert(bookingCategories)
            .values({
                name,
                direction: input.direction,
                accountId: input.accountId,
                sortOrder: 999,
                system: false
            })
            .returning({ id: bookingCategories.id });
        return { ok: true, id: row.id };
    } catch (err: unknown) {
        if (isUniqueViolation(err)) {
            return { ok: false, error: `Die Buchungsart „${name}“ existiert bereits.` };
        }
        throw err;
    }
}

export async function updateCategory(
    id: string,
    input: Partial<CategoryInput> & { active?: boolean }
): Promise<{ ok: boolean; error?: string }> {
    if (!isUuid(id)) return { ok: false, error: "Ungültige Kennung." };

    const update: Partial<typeof bookingCategories.$inferInsert> = {};
    if (input.name !== undefined) update.name = input.name.trim();
    if (input.direction !== undefined) update.direction = input.direction;
    if (input.accountId !== undefined && isUuid(input.accountId)) {
        update.accountId = input.accountId;
    }
    if (input.active !== undefined) update.active = input.active;

    await db.update(bookingCategories).set(update).where(eq(bookingCategories.id, id));
    return { ok: true };
}

export async function deleteCategory(id: string): Promise<{ ok: boolean; error?: string }> {
    if (!isUuid(id)) return { ok: false, error: "Ungültige Kennung." };

    const [row] = await db
        .select()
        .from(bookingCategories)
        .where(eq(bookingCategories.id, id))
        .limit(1);

    if (!row) return { ok: false, error: "Buchungsart nicht gefunden." };
    if (row.system) {
        return {
            ok: false,
            error: "Mitgelieferte Buchungsarten können nur deaktiviert werden."
        };
    }

    // Buchungszeilen behalten ihre Kennung nicht -- der Fremdschluessel setzt
    // sie auf null. Die Buchung selbst bleibt erhalten.
    await db.delete(bookingCategories).where(eq(bookingCategories.id, id));
    return { ok: true };
}
