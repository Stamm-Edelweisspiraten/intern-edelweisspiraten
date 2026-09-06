import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db, withTransaction } from "$lib/server/db";
import { isUuid } from "$lib/server/db/ids";
import {
    financeLogs,
    fiscalYears,
    invoices,
    journalEntries,
    journalLines,
    accounts
} from "$lib/server/db/schema";
import type { Cents } from "$lib/money";
import { nextNumber } from "./numbering";
import type { Dues, FiscalYearView, YearSummary } from "./types";
import { isUniqueViolation } from "$lib/server/db/errors";

/** Geschäftsjahre: anlegen, auflisten, abschließen, archivieren. */

type YearRow = typeof fiscalYears.$inferSelect;

export function toYearView(row: YearRow): FiscalYearView {
    return {
        id: row.id,
        year: row.year,
        dues: {
            stamm: row.duesStamm,
            gau: row.duesGau,
            landesmark: row.duesLandesmark,
            bund: row.duesBund
        },
        status: row.status,
        openingBalance: row.openingBalance,
        closedAt: row.closedAt ? row.closedAt.toISOString() : null,
        createdAt: row.createdAt.toISOString()
    };
}

export async function listFiscalYears(): Promise<FiscalYearView[]> {
    const rows = await db.select().from(fiscalYears).orderBy(desc(fiscalYears.year));
    return rows.map(toYearView);
}

export async function getFiscalYear(id: string): Promise<FiscalYearView | null> {
    if (!isUuid(id)) return null;
    const [row] = await db.select().from(fiscalYears).where(eq(fiscalYears.id, id)).limit(1);
    return row ? toYearView(row) : null;
}

export async function getFiscalYearByYear(year: number): Promise<FiscalYearView | null> {
    const [row] = await db.select().from(fiscalYears).where(eq(fiscalYears.year, year)).limit(1);
    return row ? toYearView(row) : null;
}

/**
 * Aktives Geschäftsjahr: bevorzugt das laufende Kalenderjahr, sonst das
 * jüngste aktive.
 */
export async function getActiveFiscalYear(): Promise<FiscalYearView | null> {
    const [current] = await db
        .select()
        .from(fiscalYears)
        .where(
            and(eq(fiscalYears.year, new Date().getFullYear()), eq(fiscalYears.status, "active"))
        )
        .limit(1);
    if (current) return toYearView(current);

    const [newest] = await db
        .select()
        .from(fiscalYears)
        .where(eq(fiscalYears.status, "active"))
        .orderBy(desc(fiscalYears.year))
        .limit(1);

    return newest ? toYearView(newest) : null;
}

export interface CreateYearInput {
    year: number;
    dues: Dues;
    openingBalance?: Cents;
    createdBy: string;
}

export async function createFiscalYear(
    input: CreateYearInput
): Promise<{ ok: boolean; year?: FiscalYearView; error?: string }> {
    try {
        const [row] = await db
            .insert(fiscalYears)
            .values({
                year: input.year,
                duesStamm: input.dues.stamm,
                duesGau: input.dues.gau,
                duesLandesmark: input.dues.landesmark,
                duesBund: input.dues.bund,
                status: "active",
                openingBalance: input.openingBalance ?? 0
            })
            .returning();

        await db.insert(financeLogs).values({
            fiscalYearId: row.id,
            entity: "fiscalYear",
            entityId: row.id,
            action: "create",
            user: input.createdBy
        });

        return { ok: true, year: toYearView(row) };
    } catch (err: unknown) {
        // Der eindeutige Index auf year verhindert Doppelanlagen, die vorher
        // moeglich waren -- inklusive widerspruechlicher Beitragssaetze.
        if (isUniqueViolation(err)) {
            return { ok: false, error: `Für ${input.year} existiert bereits ein Geschäftsjahr.` };
        }
        throw err;
    }
}

export async function updateDues(
    id: string,
    dues: Dues,
    user: string
): Promise<{ ok: boolean; error?: string }> {
    if (!isUuid(id)) return { ok: false, error: "Ungültige Kennung." };

    const year = await getFiscalYear(id);
    if (!year) return { ok: false, error: "Geschäftsjahr nicht gefunden." };
    if (year.status !== "active") {
        return { ok: false, error: "Abgeschlossene Geschäftsjahre können nicht geändert werden." };
    }

    await db
        .update(fiscalYears)
        .set({
            duesStamm: dues.stamm,
            duesGau: dues.gau,
            duesLandesmark: dues.landesmark,
            duesBund: dues.bund,
            updatedAt: new Date()
        })
        .where(eq(fiscalYears.id, id));

    await db.insert(financeLogs).values({
        fiscalYearId: id,
        entity: "fiscalYear",
        entityId: id,
        action: "update",
        changes: [{ field: "dues", before: year.dues, after: dues }],
        user
    });

    return { ok: true };
}

/**
 * Schließt ein Geschäftsjahr ab.
 *
 * Reihenfolge ist wesentlich: erst die Übertragsbuchungen, dann der Status.
 * Der Trigger journal_entries_year_open weist Buchungen in einem bereits
 * geschlossenen Jahr ab -- andersherum liefe der Abschluss in seine eigene
 * Sperre.
 *
 * Offene Posten müssen entweder ausgeglichen oder ausdrücklich ins Folgejahr
 * übernommen werden; vorher gab es weder einen Abschluss noch einen Übertrag.
 */
export async function closeFiscalYear(
    id: string,
    options: { user: string; carryOverOpenInvoices: boolean }
): Promise<{ ok: boolean; error?: string; carriedOver?: number }> {
    if (!isUuid(id)) return { ok: false, error: "Ungültige Kennung." };

    const year = await getFiscalYear(id);
    if (!year) return { ok: false, error: "Geschäftsjahr nicht gefunden." };
    if (year.status !== "active") {
        return { ok: false, error: "Dieses Geschäftsjahr ist bereits abgeschlossen." };
    }

    const open = await db
        .select()
        .from(invoices)
        .where(and(eq(invoices.fiscalYearId, id), inArray(invoices.status, ["open", "partial"])));

    let nextYear: FiscalYearView | null = null;

    if (open.length > 0) {
        if (!options.carryOverOpenInvoices) {
            return {
                ok: false,
                error: `Es gibt noch ${open.length} offene Posten. Übertrage sie ins Folgejahr oder gleiche sie aus.`
            };
        }

        nextYear = await getFiscalYearByYear(year.year + 1);
        if (!nextYear) {
            return {
                ok: false,
                error: `Für den Übertrag muss zuerst das Geschäftsjahr ${year.year + 1} angelegt werden.`
            };
        }
        if (nextYear.status !== "active") {
            return {
                ok: false,
                error: `Das Geschäftsjahr ${nextYear.year} ist nicht aktiv; der Übertrag ist dorthin nicht möglich.`
            };
        }
    } else {
        nextYear = await getFiscalYearByYear(year.year + 1);
    }

    const balance = await calculateBalance(id);
    let carriedOver = 0;

    await withTransaction(async (tx) => {
        // 1) Offene Restbeträge als neue Rechnung im Folgejahr anlegen.
        for (const invoice of open) {
            const rest = invoice.amount - invoice.paidAmount;
            if (rest <= 0) continue;

            const number = await nextNumber("invoice", nextYear!.year, tx);

            await tx.insert(invoices).values({
                number,
                fiscalYearId: nextYear!.id,
                memberId: invoice.memberId,
                memberName: invoice.memberName,
                // Die Art wird umbenannt, damit der eindeutige Index auf
                // (Jahr, Mitglied, Art) den Übertrag nicht mit dem regulären
                // Jahresbeitrag des Folgejahres kollidieren lässt.
                kind: `${invoice.kind} (Übertrag ${year.year})`,
                categoryId: invoice.categoryId,
                amount: rest,
                paidAmount: 0,
                date: new Date(),
                dueDate: null,
                note: `Übertrag aus ${year.year}`,
                orderId: invoice.orderId,
                status: "open",
                createdBy: options.user
            });

            await tx
                .update(invoices)
                .set({
                    status: "cancelled",
                    note: `${invoice.note} (übertragen nach ${year.year + 1})`.trim(),
                    updatedAt: new Date()
                })
                .where(eq(invoices.id, invoice.id));

            carriedOver += 1;
        }

        // 2) Status setzen -- erst jetzt, siehe Anmerkung oben.
        await tx
            .update(fiscalYears)
            .set({ status: "closed", closedAt: new Date(), updatedAt: new Date() })
            .where(eq(fiscalYears.id, id));

        // 3) Saldo als Anfangsbestand ins Folgejahr übernehmen.
        if (nextYear) {
            await tx
                .update(fiscalYears)
                .set({ openingBalance: year.openingBalance + balance })
                .where(eq(fiscalYears.id, nextYear.id));
        }

        await tx.insert(financeLogs).values({
            fiscalYearId: id,
            entity: "fiscalYear",
            entityId: id,
            action: "close",
            changes: [{ field: "balance", before: null, after: balance }],
            user: options.user
        });
    });

    return { ok: true, carriedOver };
}

export async function archiveFiscalYear(id: string, user: string): Promise<boolean> {
    if (!isUuid(id)) return false;

    const rows = await db
        .update(fiscalYears)
        .set({ status: "archived", updatedAt: new Date() })
        .where(eq(fiscalYears.id, id))
        .returning({ id: fiscalYears.id });

    if (rows.length > 0) {
        await db.insert(financeLogs).values({
            fiscalYearId: id,
            entity: "fiscalYear",
            entityId: id,
            action: "archive",
            user
        });
    }

    return rows.length > 0;
}

/**
 * Einnahmen minus Ausgaben eines Jahres.
 *
 * Grundlage sind jetzt die Erfolgskonten, nicht mehr ein Richtungsfeld an der
 * Buchung: Ertraege stehen im Haben, Aufwendungen im Soll.
 */
export async function calculateBalance(fiscalYearId: string): Promise<Cents> {
    const { income, expense } = await incomeAndExpense(fiscalYearId);
    return income - expense;
}

async function incomeAndExpense(
    fiscalYearId: string
): Promise<{ income: Cents; expense: Cents; entryCount: number }> {
    const [row] = await db
        .select({
            income: sql<string>`coalesce(sum(case when ${accounts.type} = 'income' then ${journalLines.credit} - ${journalLines.debit} else 0 end)::bigint, 0)`,
            expense: sql<string>`coalesce(sum(case when ${accounts.type} = 'expense' then ${journalLines.debit} - ${journalLines.credit} else 0 end)::bigint, 0)`,
            entryCount: sql<number>`count(distinct ${journalEntries.id})::int`
        })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
        .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
        .where(eq(journalEntries.fiscalYearId, fiscalYearId));

    return {
        income: Number(row?.income ?? 0),
        expense: Number(row?.expense ?? 0),
        entryCount: Number(row?.entryCount ?? 0)
    };
}

/**
 * Kennzahlen aller Jahre in EINER Abfrage je Tabelle.
 *
 * Vorher wurde erst die Liste geladen und anschließend für JEDES Jahr das
 * vollständige Dokument ein zweites Mal geholt -- inklusive aller Buchungen
 * und Rechnungen, nur um vier Zahlen anzuzeigen.
 */
export async function getYearSummaries(): Promise<YearSummary[]> {
    const [years, resultRows, outstandingRows] = await Promise.all([
        db.select().from(fiscalYears).orderBy(desc(fiscalYears.year)),
        db
            .select({
                fiscalYearId: journalEntries.fiscalYearId,
                income: sql<string>`coalesce(sum(case when ${accounts.type} = 'income' then ${journalLines.credit} - ${journalLines.debit} else 0 end)::bigint, 0)`,
                expense: sql<string>`coalesce(sum(case when ${accounts.type} = 'expense' then ${journalLines.debit} - ${journalLines.credit} else 0 end)::bigint, 0)`,
                entryCount: sql<number>`count(distinct ${journalEntries.id})::int`
            })
            .from(journalEntries)
            .innerJoin(journalLines, eq(journalLines.entryId, journalEntries.id))
            .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
            .groupBy(journalEntries.fiscalYearId),
        db
            .select({
                fiscalYearId: invoices.fiscalYearId,
                total: sql<string>`coalesce(sum(${invoices.amount} - ${invoices.paidAmount})::bigint, 0)`,
                count: sql<number>`count(*)::int`
            })
            .from(invoices)
            .where(inArray(invoices.status, ["open", "partial"]))
            .groupBy(invoices.fiscalYearId)
    ]);

    const results = new Map(resultRows.map((row) => [row.fiscalYearId, row]));
    const outstanding = new Map(outstandingRows.map((row) => [row.fiscalYearId, row]));

    return years.map((year) => {
        const result = results.get(year.id);
        const open = outstanding.get(year.id);
        const income = Number(result?.income ?? 0);
        const expense = Number(result?.expense ?? 0);

        return {
            id: year.id,
            year: year.year,
            status: year.status,
            income,
            expense,
            balance: income - expense,
            outstanding: Number(open?.total ?? 0),
            outstandingCount: Number(open?.count ?? 0),
            transactionCount: Number(result?.entryCount ?? 0)
        };
    });
}

/** Kennzahlen eines einzelnen Jahres. */
export async function getYearSummary(id: string): Promise<YearSummary | null> {
    const year = await getFiscalYear(id);
    if (!year) return null;

    const [{ income, expense, entryCount }, openRows] = await Promise.all([
        incomeAndExpense(id),
        db
            .select({
                total: sql<string>`coalesce(sum(${invoices.amount} - ${invoices.paidAmount})::bigint, 0)`,
                count: sql<number>`count(*)::int`
            })
            .from(invoices)
            .where(
                and(eq(invoices.fiscalYearId, id), inArray(invoices.status, ["open", "partial"]))
            )
    ]);

    return {
        id: year.id,
        year: year.year,
        status: year.status,
        income,
        expense,
        balance: income - expense,
        outstanding: Number(openRows[0]?.total ?? 0),
        outstandingCount: Number(openRows[0]?.count ?? 0),
        transactionCount: entryCount
    };
}

/** Jahre, die nicht archiviert sind -- Grundlage der Ansicht offener Posten. */
export async function listUnarchivedYearIds(): Promise<string[]> {
    const rows = await db
        .select({ id: fiscalYears.id })
        .from(fiscalYears)
        .where(ne(fiscalYears.status, "archived"));
    return rows.map((row) => row.id);
}
