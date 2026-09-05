import crypto from "node:crypto";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db, withTransaction } from "$lib/server/db";
import { isUuid } from "$lib/server/db/ids";
import { calendarDate } from "$lib/server/db/dates";
import {
    bankImportLines,
    bankImports,
    journalEntries,
    journalLines
} from "$lib/server/db/schema";
import type { Cents } from "$lib/money";
import { getBankAccount } from "./bankAccountService";

/**
 * Kontoauszug einlesen und mit den Buchungen abgleichen.
 *
 * Der Abgleich schlaegt nur vor; bestaetigt wird immer von Hand. Eine
 * Automatik, die Buchungen selbstaendig zuordnet, ist in einer Kasse mit
 * wenigen hundert Bewegungen im Jahr mehr Risiko als Gewinn.
 *
 * Gegen doppeltes Einlesen desselben Auszugs schuetzt ein Fingerabdruck je
 * Zeile (Konto, Datum, Betrag, Verwendungszweck) mit eindeutigem Index.
 */

export interface ParsedLine {
    date: Date;
    /** Vorzeichenbehaftet: positiv = Eingang, negativ = Ausgang. */
    amount: Cents;
    counterparty: string;
    reference: string;
}

export interface ImportResult {
    ok: boolean;
    error?: string;
    importId?: string;
    imported: number;
    duplicates: number;
}

function fingerprint(line: ParsedLine): string {
    return crypto
        .createHash("sha256")
        .update(
            [
                line.date.toISOString().slice(0, 10),
                String(line.amount),
                line.counterparty.trim().toLowerCase(),
                line.reference.trim().toLowerCase()
            ].join("|")
        )
        .digest("hex")
        .slice(0, 32);
}

// ---------------------------------------------------------------------------
// CSV einlesen
// ---------------------------------------------------------------------------

/**
 * Liest einen CSV-Kontoauszug.
 *
 * Deutsche Banken liefern Semikolon als Trennzeichen, Komma als Dezimalpunkt
 * und Datum als TT.MM.JJJJ. Die Spaltenzuordnung erfolgt ueber die Kopfzeile,
 * weil jede Bank andere Bezeichnungen verwendet.
 */
export function parseCsvStatement(content: string): { lines: ParsedLine[]; errors: string[] } {
    const errors: string[] = [];
    const rows = content
        .replace(/^﻿/, "")
        .split(/\r?\n/)
        .filter((row) => row.trim().length > 0);

    if (rows.length < 2) return { lines: [], errors: ["Die Datei enthält keine Buchungszeilen."] };

    const separator = rows[0].includes(";") ? ";" : ",";
    const header = splitRow(rows[0], separator).map((cell) => cell.trim().toLowerCase());

    const dateIndex = findColumn(header, ["buchungstag", "datum", "valuta", "date"]);
    const amountIndex = findColumn(header, ["betrag", "umsatz", "amount"]);
    const partyIndex = findColumn(header, [
        "beguenstigter",
        "begünstigter",
        "auftraggeber",
        "name",
        "empfänger",
        "zahlungspflichtiger"
    ]);
    const referenceIndex = findColumn(header, [
        "verwendungszweck",
        "buchungstext",
        "vwz",
        "reference"
    ]);

    if (dateIndex < 0 || amountIndex < 0) {
        return {
            lines: [],
            errors: [
                "In der Kopfzeile wurden keine Spalten für Datum und Betrag gefunden. Erwartet werden z. B. „Buchungstag“ und „Betrag“."
            ]
        };
    }

    const lines: ParsedLine[] = [];

    for (const [index, row] of rows.slice(1).entries()) {
        const cells = splitRow(row, separator);
        const date = parseGermanDate(cells[dateIndex]?.trim() ?? "");
        const amount = parseSignedAmount(cells[amountIndex]?.trim() ?? "");

        if (!date || amount === null) {
            errors.push(`Zeile ${index + 2} konnte nicht gelesen werden.`);
            continue;
        }
        if (amount === 0) continue;

        lines.push({
            date,
            amount,
            counterparty: partyIndex >= 0 ? (cells[partyIndex]?.trim() ?? "") : "",
            reference: referenceIndex >= 0 ? (cells[referenceIndex]?.trim() ?? "") : ""
        });
    }

    return { lines, errors };
}

function splitRow(row: string, separator: string): string[] {
    const cells: string[] = [];
    let current = "";
    let quoted = false;

    for (let i = 0; i < row.length; i++) {
        const char = row[i];
        if (char === '"') {
            // Zwei Anfuehrungszeichen hintereinander sind ein escaptes Zeichen.
            if (quoted && row[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                quoted = !quoted;
            }
        } else if (char === separator && !quoted) {
            cells.push(current);
            current = "";
        } else {
            current += char;
        }
    }
    cells.push(current);
    return cells;
}

function findColumn(header: string[], candidates: string[]): number {
    for (const candidate of candidates) {
        const index = header.findIndex((cell) => cell.includes(candidate));
        if (index >= 0) return index;
    }
    return -1;
}

function parseGermanDate(value: string): Date | null {
    const german = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
    if (german) {
        const year = Number(german[3].length === 2 ? `20${german[3]}` : german[3]);
        return calendarDate(year, Number(german[2]) - 1, Number(german[1]));
    }

    const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return calendarDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

    return null;
}

/** "-1.234,56" -> -123456 Cents. */
function parseSignedAmount(value: string): Cents | null {
    const cleaned = value.replace(/[^\d,.\-+]/g, "").replace(/\.(?=\d{3}\b)/g, "");
    const normalized = cleaned.replace(",", ".");
    if (!/^[-+]?\d+(\.\d{1,2})?$/.test(normalized)) return null;
    return Math.round(Number(normalized) * 100);
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export async function importStatement(input: {
    bankAccountId: string;
    filename: string;
    lines: ParsedLine[];
    user: string;
}): Promise<ImportResult> {
    if (!isUuid(input.bankAccountId)) {
        return { ok: false, error: "Ungültiges Konto.", imported: 0, duplicates: 0 };
    }
    if (input.lines.length === 0) {
        return { ok: false, error: "Die Datei enthält keine Buchungen.", imported: 0, duplicates: 0 };
    }

    return withTransaction(async (tx) => {
        const [importRow] = await tx
            .insert(bankImports)
            .values({
                bankAccountId: input.bankAccountId,
                filename: input.filename,
                format: "csv",
                lineCount: input.lines.length,
                importedBy: input.user
            })
            .returning({ id: bankImports.id });

        let imported = 0;

        for (const line of input.lines) {
            const rows = await tx
                .insert(bankImportLines)
                .values({
                    importId: importRow.id,
                    bankAccountId: input.bankAccountId,
                    date: line.date,
                    amount: line.amount,
                    counterparty: line.counterparty,
                    reference: line.reference,
                    fingerprint: fingerprint(line),
                    status: "open"
                })
                .onConflictDoNothing({
                    target: [bankImportLines.bankAccountId, bankImportLines.fingerprint]
                })
                .returning({ id: bankImportLines.id });

            if (rows.length > 0) imported += 1;
        }

        return {
            ok: true,
            importId: importRow.id,
            imported,
            duplicates: input.lines.length - imported
        };
    });
}

// ---------------------------------------------------------------------------
// Abgleich
// ---------------------------------------------------------------------------

export interface StatementLineView {
    id: string;
    date: string;
    amount: Cents;
    counterparty: string;
    reference: string;
    status: "open" | "matched" | "ignored";
    matchedEntryId: string | null;
    /** Vorschlaege, absteigend nach Passgenauigkeit. */
    suggestions: { entryId: string; entryNo: string; description: string; date: string; score: number }[];
}

export async function listStatementLines(
    bankAccountId: string,
    options: { status?: "open" | "matched" | "ignored" } = {}
): Promise<StatementLineView[]> {
    if (!isUuid(bankAccountId)) return [];

    const conditions = [eq(bankImportLines.bankAccountId, bankAccountId)];
    if (options.status) conditions.push(eq(bankImportLines.status, options.status));

    const rows = await db
        .select()
        .from(bankImportLines)
        .where(and(...conditions))
        .orderBy(desc(bankImportLines.date));

    const bank = await getBankAccount(bankAccountId);
    if (!bank) return [];

    const result: StatementLineView[] = [];

    for (const row of rows) {
        result.push({
            id: row.id,
            date: row.date.toISOString(),
            amount: row.amount,
            counterparty: row.counterparty,
            reference: row.reference,
            status: row.status,
            matchedEntryId: row.matchedEntryId,
            suggestions:
                row.status === "open"
                    ? await suggestMatches(bank.accountId, row.date, row.amount, row.reference)
                    : []
        });
    }

    return result;
}

/**
 * Sucht Buchungen, die zu einer Auszugszeile passen.
 *
 * Bewertet wird nach Betrag (Pflicht), Datumsnaehe und Uebereinstimmung im
 * Text. Der Betrag muss exakt stimmen -- eine Zuordnung "ungefaehr" waere in
 * einer Buchhaltung wertlos.
 */
async function suggestMatches(
    ledgerAccountId: string,
    date: Date,
    amount: Cents,
    reference: string
): Promise<StatementLineView["suggestions"]> {
    const windowDays = 14;
    const from = new Date(date.getTime() - windowDays * 24 * 60 * 60 * 1000);
    const to = new Date(date.getTime() + windowDays * 24 * 60 * 60 * 1000);

    // Eingang auf dem Auszug entspricht einer Sollbuchung auf dem Bankkonto.
    const column = amount > 0 ? journalLines.debit : journalLines.credit;

    const rows = await db
        .select({
            entryId: journalEntries.id,
            entryNo: journalEntries.entryNo,
            description: journalEntries.description,
            date: journalEntries.date
        })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
        .where(
            and(
                eq(journalLines.accountId, ledgerAccountId),
                eq(column, Math.abs(amount)),
                gte(journalEntries.date, from),
                lte(journalEntries.date, to),
                sql`not exists (select 1 from bank_import_lines b where b.matched_entry_id = ${journalEntries.id})`
            )
        )
        .orderBy(asc(journalEntries.date))
        .limit(10);

    const needle = reference.toLowerCase();

    return rows
        .map((row) => {
            const dayDiff = Math.abs(
                Math.round((row.date.getTime() - date.getTime()) / (24 * 60 * 60 * 1000))
            );
            // Betrag stimmt bereits; Datumsnaehe und Textueberschneidung
            // entscheiden ueber die Reihenfolge.
            let score = 60 + Math.max(0, 20 - dayDiff * 2);
            if (needle && row.description.toLowerCase().includes(needle.slice(0, 12))) score += 20;
            return {
                entryId: row.entryId,
                entryNo: row.entryNo,
                description: row.description,
                date: row.date.toISOString(),
                score: Math.min(100, score)
            };
        })
        .sort((a, b) => b.score - a.score);
}

export async function confirmMatch(
    lineId: string,
    entryId: string,
    user: string
): Promise<{ ok: boolean; error?: string }> {
    if (!isUuid(lineId) || !isUuid(entryId)) return { ok: false, error: "Ungültige Kennung." };

    const rows = await db
        .update(bankImportLines)
        .set({
            status: "matched",
            matchedEntryId: entryId,
            matchedAt: new Date(),
            matchedBy: user
        })
        .where(and(eq(bankImportLines.id, lineId), eq(bankImportLines.status, "open")))
        .returning({ id: bankImportLines.id });

    if (rows.length === 0) {
        return { ok: false, error: "Diese Zeile ist bereits zugeordnet." };
    }
    return { ok: true };
}

export async function ignoreLine(lineId: string): Promise<boolean> {
    if (!isUuid(lineId)) return false;
    const rows = await db
        .update(bankImportLines)
        .set({ status: "ignored" })
        .where(eq(bankImportLines.id, lineId))
        .returning({ id: bankImportLines.id });
    return rows.length > 0;
}

export async function resetLine(lineId: string): Promise<boolean> {
    if (!isUuid(lineId)) return false;
    const rows = await db
        .update(bankImportLines)
        .set({ status: "open", matchedEntryId: null, matchedAt: null, matchedBy: null })
        .where(eq(bankImportLines.id, lineId))
        .returning({ id: bankImportLines.id });
    return rows.length > 0;
}

/** Kennzahlen fuer die Abgleichsansicht. */
export async function reconciliationSummary(
    bankAccountId: string
): Promise<{ open: number; matched: number; ignored: number }> {
    if (!isUuid(bankAccountId)) return { open: 0, matched: 0, ignored: 0 };

    const rows = await db
        .select({ status: bankImportLines.status, count: sql<number>`count(*)::int` })
        .from(bankImportLines)
        .where(eq(bankImportLines.bankAccountId, bankAccountId))
        .groupBy(bankImportLines.status);

    const byStatus = new Map(rows.map((row) => [row.status, Number(row.count)]));
    return {
        open: byStatus.get("open") ?? 0,
        matched: byStatus.get("matched") ?? 0,
        ignored: byStatus.get("ignored") ?? 0
    };
}
