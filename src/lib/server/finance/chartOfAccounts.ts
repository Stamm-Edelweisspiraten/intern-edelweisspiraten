import { eq, sql } from "drizzle-orm";
import { db } from "$lib/server/db";
import { accounts, bookingCategories } from "$lib/server/db/schema";
import {
    CHART_OF_ACCOUNTS,
    DEFAULT_CATEGORIES,
    SYSTEM_ACCOUNTS
} from "./chartData";

/**
 * Anlegen des mitgelieferten Kontenrahmens.
 *
 * Die Kontenliste selbst steht in chartData.ts -- ohne Datenbankzugriff,
 * damit das Seed-Skript ausserhalb von Vite dieselbe Liste benutzen kann.
 */

export { CHART_OF_ACCOUNTS, DEFAULT_CATEGORIES, SYSTEM_ACCOUNTS };
export type { SeedAccount } from "./chartData";

/**
 * Legt Kontenrahmen und Buchungsarten an, sofern sie fehlen.
 *
 * Idempotent: bestehende Konten werden nicht ueberschrieben, damit spaetere
 * Anpassungen eines Stamms erhalten bleiben.
 */
export async function ensureChartOfAccounts(): Promise<{
    accounts: number;
    categories: number;
}> {
    let createdAccounts = 0;

    for (const account of CHART_OF_ACCOUNTS) {
        const rows = await db
            .insert(accounts)
            .values({
                number: account.number,
                name: account.name,
                type: account.type,
                sphere: account.sphere ?? "ideell",
                isBank: account.isBank ?? false,
                description: account.description ?? "",
                system: true
            })
            .onConflictDoNothing({ target: accounts.number })
            .returning({ id: accounts.id });
        createdAccounts += rows.length;
    }

    const accountIdByNumber = new Map(
        (await db.select({ id: accounts.id, number: accounts.number }).from(accounts)).map(
            (row) => [row.number, row.id]
        )
    );

    let createdCategories = 0;

    for (const [index, category] of DEFAULT_CATEGORIES.entries()) {
        const accountId = accountIdByNumber.get(category.account);
        if (!accountId) continue;

        const rows = await db
            .insert(bookingCategories)
            .values({
                name: category.name,
                direction: category.direction,
                accountId,
                sortOrder: index,
                system: true
            })
            .onConflictDoNothing({ target: bookingCategories.name })
            .returning({ id: bookingCategories.id });
        createdCategories += rows.length;
    }

    return { accounts: createdAccounts, categories: createdCategories };
}

/** true, sobald mindestens ein Konto vorhanden ist. */
export async function hasChartOfAccounts(): Promise<boolean> {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(accounts);
    return Number(row?.count ?? 0) > 0;
}

/** Sucht ein Konto ueber seine Nummer. */
export async function getAccountIdByNumber(number: string): Promise<string | null> {
    const [row] = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.number, number))
        .limit(1);
    return row?.id ?? null;
}
