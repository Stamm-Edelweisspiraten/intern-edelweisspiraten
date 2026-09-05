import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "$lib/server/db";
import { isUuid } from "$lib/server/db/ids";
import {
    accounts,
    bankAccounts,
    bookingCategories,
    journalEntries,
    journalLines
} from "$lib/server/db/schema";
import type { Cents } from "$lib/money";
import { postEntry, reverseEntry } from "./journalService";
import { getBankAccount, getDefaultBankAccount } from "./bankAccountService";
import { getCategory } from "./categoryService";
import type { JournalSource, TransactionDirection, TransactionView } from "./types";

/**
 * Die einfache Erfassungsmaske.
 *
 * Der Kassenwart gibt Einnahme oder Ausgabe, Buchungsart, Konto und Betrag
 * ein; daraus entsteht ein ausgeglichener Buchungssatz mit zwei Zeilen:
 *
 *   Einnahme: Soll  Bankkonto      / Haben Ertragskonto
 *   Ausgabe:  Soll  Aufwandskonto  / Haben Bankkonto
 *
 * Soll und Haben tauchen in dieser Maske bewusst nicht auf. Wer sie braucht,
 * nutzt die Expertenmaske ueber postEntry().
 *
 * Geloescht wird nicht mehr: eine falsche Buchung wird storniert. Das ist
 * die einzige Aenderung an der bisherigen Bedienung -- und der Grund, warum
 * updateTransaction hier fehlt.
 */

export interface CreateTransactionInput {
    fiscalYearId: string;
    categoryId: string;
    bankAccountId?: string | null;
    memberId?: string | null;
    member?: string;
    date: Date;
    amount: Cents;
    note?: string;
    /**
     * Herkunft des Belegs. Ohne Angabe "manual"; wiederkehrende Buchungen und
     * der Kontoauszug-Import setzen sie, damit sie sich im Journal filtern
     * lassen.
     */
    source?: JournalSource;
    user: string;
}

export interface CreateTransactionResult {
    ok: boolean;
    error?: string;
    entryId?: string;
    entryNo?: string;
}

export async function createTransaction(
    input: CreateTransactionInput
): Promise<CreateTransactionResult> {
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
        return { ok: false, error: "Bitte einen Betrag größer als 0 angeben." };
    }

    const category = await getCategory(input.categoryId);
    if (!category) return { ok: false, error: "Bitte eine Buchungsart auswählen." };

    const bank = input.bankAccountId
        ? await getBankAccount(input.bankAccountId)
        : await getDefaultBankAccount();
    if (!bank) {
        return {
            ok: false,
            error: "Es ist kein Kassen- oder Bankkonto eingerichtet. Bitte zuerst eines anlegen."
        };
    }

    const shared = {
        memberId: input.memberId ?? null,
        memberName: input.member ?? null,
        bankAccountId: bank.id,
        categoryId: category.id,
        note: input.note ?? ""
    };

    const lines =
        category.direction === "in"
            ? [
                  { accountId: bank.accountId, debit: input.amount, ...shared },
                  { accountId: category.accountId, credit: input.amount, ...shared }
              ]
            : [
                  { accountId: category.accountId, debit: input.amount, ...shared },
                  { accountId: bank.accountId, credit: input.amount, ...shared }
              ];

    return postEntry({
        fiscalYearId: input.fiscalYearId,
        date: input.date,
        description: input.note?.trim() || category.name,
        source: input.source ?? "manual",
        lines,
        user: input.user
    });
}

/**
 * Storniert eine Buchung.
 *
 * Ersetzt deleteTransaction und updateTransaction: eine Korrektur ist ein
 * Storno plus eine neue Buchung, damit der urspruengliche Beleg auffindbar
 * bleibt.
 */
export async function reverseTransaction(
    entryId: string,
    user: string,
    reason = ""
): Promise<{ ok: boolean; error?: string }> {
    const result = await reverseEntry(entryId, user, reason);
    return { ok: result.ok, error: result.error };
}

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

export interface TransactionFilter {
    fiscalYearId?: string;
    bankAccountId?: string;
    memberId?: string;
    categoryId?: string;
    limit?: number;
    offset?: number;
}

/**
 * Buchungen als flache Liste, wie sie die Kassenansicht zeigt.
 *
 * Grundlage ist die Bankzeile jedes Buchungssatzes: sie traegt Richtung
 * (Soll = Einnahme, Haben = Ausgabe) und Betrag. Saetze ohne Bankzeile --
 * etwa die Entstehung einer Forderung -- erscheinen hier nicht; sie stehen
 * im Journal.
 */
export async function listTransactions(
    filter: TransactionFilter = {}
): Promise<TransactionView[]> {
    const rows = await db
        .select({
            entry: journalEntries,
            line: journalLines,
            bankName: bankAccounts.name,
            categoryName: bookingCategories.name
        })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
        .innerJoin(bankAccounts, eq(bankAccounts.id, journalLines.bankAccountId))
        .leftJoin(bookingCategories, eq(bookingCategories.id, journalLines.categoryId))
        .where(buildFilter(filter))
        .orderBy(desc(journalEntries.date), desc(journalEntries.entryNo))
        .limit(filter.limit ?? 100)
        .offset(filter.offset ?? 0);

    return rows.map(({ entry, line, bankName, categoryName }) => ({
        id: entry.id,
        entryNo: entry.entryNo,
        fiscalYearId: entry.fiscalYearId,
        invoiceId: null,
        memberId: line.memberId,
        member: line.memberName ?? "",
        date: entry.date.toISOString(),
        direction: (line.debit > 0 ? "in" : "out") as TransactionDirection,
        kind: categoryName ?? entry.description,
        categoryId: line.categoryId,
        bankAccountId: line.bankAccountId,
        bankAccountName: bankName,
        amount: line.debit > 0 ? line.debit : line.credit,
        note: line.note || entry.description,
        source: entry.source,
        reversed: Boolean(entry.reversedById || entry.reversesId),
        createdBy: entry.createdBy,
        createdAt: entry.createdAt.toISOString()
    }));
}

export async function countTransactions(filter: TransactionFilter = {}): Promise<number> {
    const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
        .innerJoin(bankAccounts, eq(bankAccounts.id, journalLines.bankAccountId))
        .where(buildFilter(filter));
    return Number(row?.count ?? 0);
}

function buildFilter(filter: TransactionFilter): SQL | undefined {
    const conditions: SQL[] = [];
    if (isUuid(filter.fiscalYearId)) {
        conditions.push(eq(journalEntries.fiscalYearId, filter.fiscalYearId));
    }
    if (isUuid(filter.bankAccountId)) {
        conditions.push(eq(journalLines.bankAccountId, filter.bankAccountId));
    }
    if (isUuid(filter.memberId)) {
        conditions.push(eq(journalLines.memberId, filter.memberId));
    }
    if (isUuid(filter.categoryId)) {
        conditions.push(eq(journalLines.categoryId, filter.categoryId));
    }
    return conditions.length > 0 ? and(...conditions) : undefined;
}

/** Einnahmen und Ausgaben eines Jahres, fuer die Kennzahlen der Jahresseite. */
export async function sumByDirection(
    fiscalYearId: string
): Promise<{ income: Cents; expense: Cents }> {
    const [row] = await db
        .select({
            income: sql<string>`coalesce(sum(case when ${accounts.type} = 'income' then ${journalLines.credit} - ${journalLines.debit} else 0 end)::bigint, 0)`,
            expense: sql<string>`coalesce(sum(case when ${accounts.type} = 'expense' then ${journalLines.debit} - ${journalLines.credit} else 0 end)::bigint, 0)`
        })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
        .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
        .where(eq(journalEntries.fiscalYearId, fiscalYearId));

    return { income: Number(row?.income ?? 0), expense: Number(row?.expense ?? 0) };
}

/**
 * Loest ein geloeschtes Mitglied aus den Buchungen.
 *
 * Die Buchungen selbst bleiben bestehen -- sie zu loeschen, wie es die
 * Altfassung tat, wuerde die Jahressummen ruecknwirkend veraendern. Der
 * denormalisierte Name bleibt stehen, damit der Beleg lesbar bleibt.
 */
export async function removeMemberTransactions(memberId: string): Promise<void> {
    if (!isUuid(memberId)) return;
    await db
        .update(journalLines)
        .set({ memberId: null })
        .where(eq(journalLines.memberId, memberId));
}

/** Buchungssaetze, die zu einer Liste von Jahren gehoeren. */
export async function listEntryIdsForYears(fiscalYearIds: string[]): Promise<string[]> {
    const valid = fiscalYearIds.filter(isUuid);
    if (valid.length === 0) return [];
    const rows = await db
        .select({ id: journalEntries.id })
        .from(journalEntries)
        .where(inArray(journalEntries.fiscalYearId, valid));
    return rows.map((row) => row.id);
}
