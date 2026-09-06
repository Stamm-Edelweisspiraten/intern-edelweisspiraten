import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { db, withTransaction, type Executor } from "$lib/server/db";
import { isUuid } from "$lib/server/db/ids";
import { calendarYear, toCalendarDate, todayCalendar } from "$lib/server/db/dates";
import {
    accounts,
    financeLogs,
    fiscalYears,
    journalEntries,
    journalLines
} from "$lib/server/db/schema";
import type { Cents } from "$lib/money";
import { nextNumber } from "./numbering";
import type { JournalEntryView, JournalLineView, JournalSource } from "./types";
import { errorMessageChain } from "$lib/server/db/errors";

/**
 * Buchungssaetze -- die EINE Stelle, an der gebucht wird.
 *
 * Alles, was Geld bewegt, laeuft ueber postEntry(): die einfache Maske, die
 * Zahlung auf eine Rechnung, die Abrechnung einer Bestellung, wiederkehrende
 * Buchungen, der Kontoauszug-Import und die REST-API. Damit gibt es genau
 * einen Ort, an dem Ausgeglichenheit, Belegnummer und Protokoll entstehen.
 *
 * Korrigiert wird ausschliesslich per Storno (reverseEntry). Ein Loeschen
 * gibt es nicht: eine Buchhaltung, aus der Belege verschwinden koennen, ist
 * keine.
 */

export interface JournalLineInput {
    accountId: string;
    /** Genau eines von beiden ist groesser als 0. */
    debit?: Cents;
    credit?: Cents;
    memberId?: string | null;
    memberName?: string | null;
    bankAccountId?: string | null;
    categoryId?: string | null;
    note?: string;
}

export interface PostEntryInput {
    fiscalYearId: string;
    date: Date;
    description: string;
    source?: JournalSource;
    lines: JournalLineInput[];
    user: string;
}

export interface PostEntryResult {
    ok: boolean;
    error?: string;
    entryId?: string;
    entryNo?: string;
}

// ---------------------------------------------------------------------------
// Pruefung
// ---------------------------------------------------------------------------

/**
 * Prueft einen Buchungssatz, bevor er die Datenbank erreicht.
 *
 * Die Datenbank prueft dasselbe noch einmal (Trigger journal_lines_balanced).
 * Diese Vorpruefung existiert nur, damit die Oberflaeche eine verstaendliche
 * Meldung zeigen kann statt einer Datenbankausnahme.
 */
export function validateLines(lines: JournalLineInput[]): { ok: boolean; error?: string } {
    if (lines.length < 2) {
        return { ok: false, error: "Ein Buchungssatz braucht mindestens zwei Zeilen." };
    }

    let debit = 0;
    let credit = 0;

    for (const [index, line] of lines.entries()) {
        const d = line.debit ?? 0;
        const c = line.credit ?? 0;

        if (!isUuid(line.accountId)) {
            return { ok: false, error: `Zeile ${index + 1}: Es wurde kein Konto ausgewählt.` };
        }
        if (!Number.isInteger(d) || !Number.isInteger(c) || d < 0 || c < 0) {
            return { ok: false, error: `Zeile ${index + 1}: Ungültiger Betrag.` };
        }
        if ((d === 0) === (c === 0)) {
            return {
                ok: false,
                error: `Zeile ${index + 1}: Bitte entweder einen Soll- oder einen Habenbetrag angeben.`
            };
        }

        debit += d;
        credit += c;
    }

    if (debit !== credit) {
        const diff = Math.abs(debit - credit);
        return {
            ok: false,
            error: `Der Buchungssatz ist nicht ausgeglichen. Differenz: ${(diff / 100)
                .toFixed(2)
                .replace(".", ",")} EUR.`
        };
    }

    return { ok: true };
}

// ---------------------------------------------------------------------------
// Buchen
// ---------------------------------------------------------------------------

export async function postEntry(
    input: PostEntryInput,
    executor?: Executor
): Promise<PostEntryResult> {
    if (!isUuid(input.fiscalYearId)) {
        return { ok: false, error: "Ungültiges Geschäftsjahr." };
    }

    const validation = validateLines(input.lines);
    if (!validation.ok) return { ok: false, error: validation.error };

    const run = async (tx: Executor): Promise<PostEntryResult> => {
        const [year] = await tx
            .select()
            .from(fiscalYears)
            .where(eq(fiscalYears.id, input.fiscalYearId))
            .limit(1);

        if (!year) return { ok: false, error: "Geschäftsjahr nicht gefunden." };
        if (year.status !== "active") {
            return {
                ok: false,
                error: "In abgeschlossenen Geschäftsjahren kann nicht gebucht werden."
            };
        }

        /*
         * Das Buchungsdatum muss ins Geschaeftsjahr fallen. Vorher war das
         * Datum eine freie Zeichenkette, die nie geprueft wurde.
         *
         * Verglichen wird der Kalendertag, nicht der Zeitpunkt: sonst haengt
         * das Ergebnis an der Zeitzone des Servers.
         */
        const date = toCalendarDate(input.date);
        if (calendarYear(date) !== year.year) {
            return { ok: false, error: `Das Datum muss im Geschäftsjahr ${year.year} liegen.` };
        }

        const entryNo = await nextNumber("entry", year.year, tx);

        const [entry] = await tx
            .insert(journalEntries)
            .values({
                entryNo,
                fiscalYearId: input.fiscalYearId,
                date,
                description: input.description.trim(),
                source: input.source ?? "manual",
                createdBy: input.user
            })
            .returning({ id: journalEntries.id });

        await tx.insert(journalLines).values(
            input.lines.map((line, index) => ({
                entryId: entry.id,
                lineNo: index + 1,
                accountId: line.accountId,
                debit: line.debit ?? 0,
                credit: line.credit ?? 0,
                memberId: isUuid(line.memberId) ? line.memberId : null,
                memberName: line.memberName ?? null,
                bankAccountId: isUuid(line.bankAccountId) ? line.bankAccountId : null,
                categoryId: isUuid(line.categoryId) ? line.categoryId : null,
                note: line.note ?? ""
            }))
        );

        await tx.insert(financeLogs).values({
            fiscalYearId: input.fiscalYearId,
            entity: "journalEntry",
            entityId: entry.id,
            action: "create",
            user: input.user
        });

        return { ok: true, entryId: entry.id, entryNo };
    };

    try {
        return executor ? await run(executor) : await withTransaction(run);
    } catch (err) {
        return { ok: false, error: describeDbError(err) };
    }
}

/**
 * Storniert einen Buchungssatz durch einen Gegensatz mit vertauschten
 * Seiten. Der urspruengliche Satz bleibt erhalten und wird als storniert
 * gekennzeichnet.
 */
export async function reverseEntry(
    entryId: string,
    user: string,
    reason = ""
): Promise<PostEntryResult> {
    if (!isUuid(entryId)) return { ok: false, error: "Ungültige Kennung." };

    try {
        return await withTransaction(async (tx) => {
            const [entry] = await tx
                .select()
                .from(journalEntries)
                .where(eq(journalEntries.id, entryId))
                .limit(1);

            if (!entry) return { ok: false, error: "Buchungssatz nicht gefunden." };
            if (entry.reversedById) {
                return { ok: false, error: "Dieser Buchungssatz wurde bereits storniert." };
            }
            if (entry.reversesId) {
                return { ok: false, error: "Ein Storno kann nicht selbst storniert werden." };
            }

            const [year] = await tx
                .select()
                .from(fiscalYears)
                .where(eq(fiscalYears.id, entry.fiscalYearId))
                .limit(1);

            if (year?.status !== "active") {
                return {
                    ok: false,
                    error: "In abgeschlossenen Geschäftsjahren kann nicht storniert werden."
                };
            }

            const lines = await tx
                .select()
                .from(journalLines)
                .where(eq(journalLines.entryId, entryId))
                .orderBy(asc(journalLines.lineNo));

            const entryNo = await nextNumber("entry", year.year, tx);

            const [reversal] = await tx
                .insert(journalEntries)
                .values({
                    entryNo,
                    fiscalYearId: entry.fiscalYearId,
                    // Storniert wird zum heutigen Tag, sofern der noch ins
                    // Geschaeftsjahr faellt -- sonst zum Datum des Originals.
                    date: reversalDate(year.year, entry.date),
                    description: `Storno zu ${entry.entryNo}${reason ? `: ${reason}` : ""}`,
                    source: entry.source,
                    reversesId: entry.id,
                    createdBy: user
                })
                .returning({ id: journalEntries.id });

            // Seiten vertauschen: aus Soll wird Haben und umgekehrt.
            await tx.insert(journalLines).values(
                lines.map((line, index) => ({
                    entryId: reversal.id,
                    lineNo: index + 1,
                    accountId: line.accountId,
                    debit: line.credit,
                    credit: line.debit,
                    memberId: line.memberId,
                    memberName: line.memberName,
                    bankAccountId: line.bankAccountId,
                    categoryId: line.categoryId,
                    note: line.note
                }))
            );

            await tx
                .update(journalEntries)
                .set({ reversedById: reversal.id, updatedAt: new Date() })
                .where(eq(journalEntries.id, entry.id));

            await tx.insert(financeLogs).values({
                fiscalYearId: entry.fiscalYearId,
                entity: "journalEntry",
                entityId: entry.id,
                action: "reverse",
                changes: [{ field: "reversedBy", before: null, after: entryNo }],
                user
            });

            return { ok: true, entryId: reversal.id, entryNo };
        });
    } catch (err) {
        return { ok: false, error: describeDbError(err) };
    }
}

function reversalDate(year: number, originalDate: Date): Date {
    const today = todayCalendar();
    return calendarYear(today) === year ? today : toCalendarDate(originalDate);
}

/**
 * Uebersetzt Datenbankfehler in eine Meldung, die man einem Kassenwart
 * zeigen kann. Die Trigger melden sich mit ERRCODE check_violation.
 */
function describeDbError(err: unknown): string {
    // Die gesamte Kette, nicht nur die aeussere Meldung: Drizzle verpackt den
    // Fehler, und der Text des Triggers steht an `cause`.
    const message = errorMessageChain(err);
    if (message.includes("nicht ausgeglichen")) {
        return "Der Buchungssatz ist nicht ausgeglichen.";
    }
    if (message.includes("kann nicht gebucht werden")) {
        return "In abgeschlossenen Geschäftsjahren kann nicht gebucht werden.";
    }
    if (message.includes("journal_lines_side_check")) {
        return "Jede Zeile braucht entweder einen Soll- oder einen Habenbetrag.";
    }
    console.error("Buchung fehlgeschlagen:", err);
    return "Die Buchung konnte nicht gespeichert werden.";
}

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

export interface JournalFilter {
    fiscalYearId?: string;
    accountId?: string;
    bankAccountId?: string;
    memberId?: string;
    source?: JournalSource;
    from?: Date;
    to?: Date;
    limit?: number;
    offset?: number;
}

function buildFilter(filter: JournalFilter): SQL | undefined {
    const conditions: SQL[] = [];

    if (isUuid(filter.fiscalYearId)) {
        conditions.push(eq(journalEntries.fiscalYearId, filter.fiscalYearId));
    }
    if (filter.source) conditions.push(eq(journalEntries.source, filter.source));
    if (filter.from) conditions.push(gte(journalEntries.date, filter.from));
    if (filter.to) conditions.push(lte(journalEntries.date, filter.to));

    // Filter auf Konto, Bankkonto oder Mitglied greifen auf die Zeilen zu;
    // gesucht wird ueber ein EXISTS, damit ein Satz nicht mehrfach erscheint.
    if (isUuid(filter.accountId)) {
        conditions.push(
            sql`exists (select 1 from ${journalLines} l where l.entry_id = ${journalEntries.id} and l.account_id = ${filter.accountId})`
        );
    }
    if (isUuid(filter.bankAccountId)) {
        conditions.push(
            sql`exists (select 1 from ${journalLines} l where l.entry_id = ${journalEntries.id} and l.bank_account_id = ${filter.bankAccountId})`
        );
    }
    if (isUuid(filter.memberId)) {
        conditions.push(
            sql`exists (select 1 from ${journalLines} l where l.entry_id = ${journalEntries.id} and l.member_id = ${filter.memberId})`
        );
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function countEntries(filter: JournalFilter = {}): Promise<number> {
    const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(journalEntries)
        .where(buildFilter(filter));
    return Number(row?.count ?? 0);
}

export async function listEntries(filter: JournalFilter = {}): Promise<JournalEntryView[]> {
    const rows = await db
        .select()
        .from(journalEntries)
        .where(buildFilter(filter))
        .orderBy(desc(journalEntries.date), desc(journalEntries.entryNo))
        .limit(filter.limit ?? 100)
        .offset(filter.offset ?? 0);

    return hydrateEntries(rows);
}

export async function getEntry(id: string): Promise<JournalEntryView | null> {
    if (!isUuid(id)) return null;
    const rows = await db.select().from(journalEntries).where(eq(journalEntries.id, id)).limit(1);
    const [entry] = await hydrateEntries(rows);
    return entry ?? null;
}

type EntryRow = typeof journalEntries.$inferSelect;

export async function hydrateEntries(rows: EntryRow[]): Promise<JournalEntryView[]> {
    if (rows.length === 0) return [];

    const lineRows = await db
        .select({
            line: journalLines,
            accountNumber: accounts.number,
            accountName: accounts.name
        })
        .from(journalLines)
        .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
        .where(
            inArray(
                journalLines.entryId,
                rows.map((row) => row.id)
            )
        )
        .orderBy(asc(journalLines.lineNo));

    const byEntry = new Map<string, JournalLineView[]>();
    for (const row of lineRows) {
        const list = byEntry.get(row.line.entryId) ?? [];
        list.push({
            id: row.line.id,
            lineNo: row.line.lineNo,
            accountId: row.line.accountId,
            accountNumber: row.accountNumber,
            accountName: row.accountName,
            debit: row.line.debit,
            credit: row.line.credit,
            memberId: row.line.memberId,
            memberName: row.line.memberName ?? "",
            bankAccountId: row.line.bankAccountId,
            categoryId: row.line.categoryId,
            note: row.line.note
        });
        byEntry.set(row.line.entryId, list);
    }

    return rows.map((row) => {
        const lines = byEntry.get(row.id) ?? [];
        return {
            id: row.id,
            entryNo: row.entryNo,
            fiscalYearId: row.fiscalYearId,
            date: row.date.toISOString(),
            description: row.description,
            source: row.source,
            reversesId: row.reversesId,
            reversedById: row.reversedById,
            total: lines.reduce((sum, line) => sum + line.debit, 0),
            createdBy: row.createdBy,
            createdAt: row.createdAt.toISOString(),
            lines
        };
    });
}

/** Saldo eines Kontos bis einschliesslich eines Stichtags. */
export async function accountBalance(accountId: string, at?: Date): Promise<Cents> {
    if (!isUuid(accountId)) return 0;

    const conditions: SQL[] = [eq(journalLines.accountId, accountId)];
    if (at) conditions.push(lte(journalEntries.date, at));

    const [row] = await db
        .select({
            debit: sql<string>`coalesce(sum(${journalLines.debit})::bigint, 0)`,
            credit: sql<string>`coalesce(sum(${journalLines.credit})::bigint, 0)`
        })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
        .where(and(...conditions));

    return Number(row?.debit ?? 0) - Number(row?.credit ?? 0);
}

// ---------------------------------------------------------------------------
// Protokoll
// ---------------------------------------------------------------------------

export interface FinanceLogView {
    id: string;
    entity: string;
    action: string;
    user: string;
    createdAt: Date;
}

/** Letzte Vorgaenge eines Geschaeftsjahres, fuer die Aktivitaetsliste. */
export async function listFinanceLogs(
    fiscalYearId: string,
    limit = 10
): Promise<FinanceLogView[]> {
    if (!isUuid(fiscalYearId)) return [];

    const rows = await db
        .select()
        .from(financeLogs)
        .where(eq(financeLogs.fiscalYearId, fiscalYearId))
        .orderBy(desc(financeLogs.createdAt))
        .limit(limit);

    return rows.map((row) => ({
        id: row.id,
        entity: row.entity,
        action: row.action,
        user: row.user,
        createdAt: row.createdAt
    }));
}
