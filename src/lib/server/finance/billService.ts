import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, withTransaction, type Executor } from "$lib/server/db";
import { isUuid } from "$lib/server/db/ids";
import {
    calendarDate,
    calendarYear,
    toCalendarDate,
    todayCalendar
} from "$lib/server/db/dates";
import {
    accounts,
    bankAccounts,
    bills,
    financeLogs,
    fiscalYears,
    payments
} from "$lib/server/db/schema";
import { formatEuro, type Cents } from "$lib/money";
import { SYSTEM_ACCOUNTS } from "./chartOfAccounts";
import { getDefaultBankAccount } from "./bankAccountService";
import { getCategory } from "./categoryService";
import { postEntry, reverseEntry } from "./journalService";
import { nextNumber } from "./numbering";
import type { InvoiceStatus } from "./types";

/**
 * Eingangsrechnungen (Verbindlichkeiten).
 *
 * In der Altfassung gab es diese Seite nicht: eine Rechnung, die noch nicht
 * bezahlt war, tauchte in der Kasse ueberhaupt nicht auf -- der Aufwand
 * entstand erst mit der Zahlung und landete damit im falschen Zeitraum.
 *
 * Jetzt entsteht mit der Rechnung der Buchungssatz "Aufwand an
 * Verbindlichkeiten"; die Zahlung bucht spaeter nur noch
 * "Verbindlichkeiten an Bank".
 */

export interface BillView {
    id: string;
    number: string;
    fiscalYearId: string;
    vendor: string;
    kind: string;
    amount: Cents;
    paidAmount: Cents;
    outstanding: Cents;
    date: string;
    dueDate: string | null;
    note: string;
    status: InvoiceStatus;
    overdue: boolean;
    createdBy: string;
}

type BillRow = typeof bills.$inferSelect;

function startOfToday(): Date {
    return todayCalendar();
}

export function toBillView(row: BillRow): BillView {
    const outstanding = Math.max(0, row.amount - row.paidAmount);
    return {
        id: row.id,
        number: row.number,
        fiscalYearId: row.fiscalYearId,
        vendor: row.vendor,
        kind: row.kind,
        amount: row.amount,
        paidAmount: row.paidAmount,
        outstanding,
        date: row.date.toISOString(),
        dueDate: row.dueDate?.toISOString() ?? null,
        note: row.note,
        status: row.status,
        overdue:
            outstanding > 0 &&
            row.status !== "cancelled" &&
            row.dueDate !== null &&
            row.dueDate < startOfToday(),
        createdBy: row.createdBy
    };
}

export async function listBills(fiscalYearId?: string): Promise<BillView[]> {
    const rows = await db
        .select()
        .from(bills)
        .where(isUuid(fiscalYearId) ? eq(bills.fiscalYearId, fiscalYearId) : undefined)
        .orderBy(desc(bills.date));
    return rows.map(toBillView);
}

export async function getBill(id: string): Promise<BillView | null> {
    if (!isUuid(id)) return null;
    const [row] = await db.select().from(bills).where(eq(bills.id, id)).limit(1);
    return row ? toBillView(row) : null;
}

async function accountIdByNumber(tx: Executor, number: string): Promise<string | null> {
    const [row] = await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.number, number))
        .limit(1);
    return row?.id ?? null;
}

/** Haelt ein Datum innerhalb des Geschaeftsjahres. */
function clampToYear(date: Date, year: number): Date {
    const calendar = toCalendarDate(date);
    if (calendarYear(calendar) === year) return calendar;

    const today = todayCalendar();
    return calendarYear(today) === year ? today : calendarDate(year, 11, 31);
}

export interface CreateBillInput {
    fiscalYearId: string;
    vendor: string;
    categoryId: string;
    amount: Cents;
    date: Date;
    dueDate?: Date | null;
    note?: string;
    createdBy: string;
}

export async function createBill(
    input: CreateBillInput
): Promise<{ ok: boolean; error?: string; id?: string }> {
    if (!isUuid(input.fiscalYearId)) return { ok: false, error: "Ungültiges Geschäftsjahr." };
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
        return { ok: false, error: "Bitte einen Betrag größer als 0 angeben." };
    }
    if (!input.vendor.trim()) return { ok: false, error: "Bitte einen Lieferanten angeben." };

    const category = await getCategory(input.categoryId);
    if (!category) return { ok: false, error: "Bitte eine Buchungsart auswählen." };
    if (category.direction !== "out") {
        return { ok: false, error: "Für Eingangsrechnungen ist eine Ausgabe-Buchungsart nötig." };
    }

    try {
        const id = await withTransaction(async (tx) => {
            const [year] = await tx
                .select()
                .from(fiscalYears)
                .where(eq(fiscalYears.id, input.fiscalYearId))
                .limit(1);
            if (!year) throw new Error("Geschäftsjahr nicht gefunden.");

            const number = await nextNumber("bill", year.year, tx);

            const [row] = await tx
                .insert(bills)
                .values({
                    number,
                    fiscalYearId: input.fiscalYearId,
                    vendor: input.vendor.trim(),
                    kind: category.name,
                    categoryId: category.id,
                    amount: input.amount,
                    paidAmount: 0,
                    date: toCalendarDate(input.date),
                    dueDate: input.dueDate ? toCalendarDate(input.dueDate) : null,
                    note: input.note ?? "",
                    status: "open",
                    createdBy: input.createdBy
                })
                .returning({ id: bills.id });

            const payableId = await accountIdByNumber(tx, SYSTEM_ACCOUNTS.payables);
            if (!payableId) throw new Error("Das Verbindlichkeitskonto fehlt im Kontenrahmen.");

            const entry = await postEntry(
                {
                    fiscalYearId: input.fiscalYearId,
                    date: clampToYear(input.date, year.year),
                    description: `${category.name} ${number} – ${input.vendor.trim()}`,
                    source: "invoice",
                    lines: [
                        { accountId: category.accountId, debit: input.amount, note: input.note ?? "" },
                        { accountId: payableId, credit: input.amount, note: input.note ?? "" }
                    ],
                    user: input.createdBy
                },
                tx
            );

            if (!entry.ok) throw new Error(entry.error ?? "Buchung fehlgeschlagen.");

            await tx.update(bills).set({ entryId: entry.entryId }).where(eq(bills.id, row.id));

            await tx.insert(financeLogs).values({
                fiscalYearId: input.fiscalYearId,
                entity: "bill",
                entityId: row.id,
                action: "create",
                user: input.createdBy
            });

            return row.id;
        });

        return { ok: true, id };
    } catch (err) {
        const message = err instanceof Error ? err.message : "Die Rechnung konnte nicht angelegt werden.";
        return { ok: false, error: message };
    }
}

export interface PayBillInput {
    billId: string;
    amount: Cents;
    date?: Date;
    bankAccountId?: string | null;
    note?: string;
    user: string;
}

/** Zahlung auf eine Eingangsrechnung: Verbindlichkeiten an Bank. */
export async function payBill(
    input: PayBillInput
): Promise<{ ok: boolean; error?: string; settled?: boolean }> {
    if (!isUuid(input.billId)) return { ok: false, error: "Ungültige Kennung." };
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
        return { ok: false, error: "Bitte einen Betrag größer als 0 angeben." };
    }

    const before = await getBill(input.billId);
    if (!before) return { ok: false, error: "Rechnung nicht gefunden." };
    if (before.status === "cancelled") return { ok: false, error: "Diese Rechnung wurde storniert." };
    if (before.status === "paid") return { ok: false, error: "Diese Rechnung ist bereits bezahlt." };
    if (input.amount > before.outstanding) {
        return {
            ok: false,
            error: `Der Betrag übersteigt den offenen Rest. Offen sind noch ${formatEuro(before.outstanding)}.`
        };
    }

    const bank = isUuid(input.bankAccountId)
        ? await db
              .select()
              .from(bankAccounts)
              .where(eq(bankAccounts.id, input.bankAccountId))
              .limit(1)
              .then((rows) => rows[0] ?? null)
        : null;
    const target = bank ?? (await getDefaultBankAccount());
    if (!target) return { ok: false, error: "Es ist kein Kassen- oder Bankkonto eingerichtet." };

    try {
        return await withTransaction(async (tx) => {
            const updated = await tx
                .update(bills)
                .set({
                    paidAmount: sql`${bills.paidAmount} + ${input.amount}`,
                    status: sql`case when ${bills.paidAmount} + ${input.amount} >= ${bills.amount} then 'paid'::invoice_status else 'partial'::invoice_status end`,
                    updatedAt: new Date()
                })
                .where(
                    and(
                        eq(bills.id, input.billId),
                        inArray(bills.status, ["open", "partial"]),
                        sql`${bills.paidAmount} + ${input.amount} <= ${bills.amount}`
                    )
                )
                .returning();

            if (updated.length === 0) {
                return { ok: false, error: "Der Betrag übersteigt den offenen Rest." };
            }

            const bill = updated[0];
            const date = input.date ? toCalendarDate(input.date) : todayCalendar();

            const [year] = await tx
                .select()
                .from(fiscalYears)
                .where(eq(fiscalYears.id, bill.fiscalYearId))
                .limit(1);

            const payableId = await accountIdByNumber(tx, SYSTEM_ACCOUNTS.payables);
            if (!payableId) throw new Error("Das Verbindlichkeitskonto fehlt im Kontenrahmen.");

            const entry = await postEntry(
                {
                    fiscalYearId: bill.fiscalYearId,
                    date: clampToYear(date, year?.year ?? date.getFullYear()),
                    description: `Zahlung ${bill.number} – ${bill.vendor}`,
                    source: "payment",
                    lines: [
                        { accountId: payableId, debit: input.amount, note: input.note ?? "" },
                        {
                            accountId: target.accountId,
                            credit: input.amount,
                            bankAccountId: target.id,
                            note: input.note ?? ""
                        }
                    ],
                    user: input.user
                },
                tx
            );

            if (!entry.ok) throw new Error(entry.error ?? "Buchung fehlgeschlagen.");

            await tx.insert(payments).values({
                billId: bill.id,
                bankAccountId: target.id,
                entryId: entry.entryId ?? null,
                amount: input.amount,
                date,
                note: input.note ?? "",
                createdBy: input.user
            });

            await tx.insert(financeLogs).values({
                fiscalYearId: bill.fiscalYearId,
                entity: "bill",
                entityId: bill.id,
                action: "pay",
                changes: [
                    { field: "paidAmount", before: before.paidAmount, after: bill.paidAmount }
                ],
                user: input.user
            });

            return { ok: true, settled: bill.status === "paid" };
        });
    } catch (err) {
        console.error("Zahlung fehlgeschlagen:", err);
        return { ok: false, error: "Die Zahlung konnte nicht verbucht werden." };
    }
}

export async function cancelBill(
    id: string,
    reason: string,
    user: string
): Promise<{ ok: boolean; error?: string }> {
    if (!isUuid(id)) return { ok: false, error: "Ungültige Kennung." };

    const [bill] = await db.select().from(bills).where(eq(bills.id, id)).limit(1);
    if (!bill) return { ok: false, error: "Rechnung nicht gefunden." };
    if (bill.status === "cancelled") return { ok: true };
    if (bill.paidAmount > 0) {
        return {
            ok: false,
            error: "Auf diese Rechnung wurden bereits Zahlungen gebucht."
        };
    }

    if (bill.entryId) {
        const reversal = await reverseEntry(bill.entryId, user, reason || "Rechnung storniert");
        if (!reversal.ok) return { ok: false, error: reversal.error };
    }

    await db
        .update(bills)
        .set({
            status: "cancelled",
            note: reason ? `${bill.note} ${reason}`.trim() : bill.note,
            updatedAt: new Date()
        })
        .where(eq(bills.id, id));

    await db.insert(financeLogs).values({
        fiscalYearId: bill.fiscalYearId,
        entity: "bill",
        entityId: id,
        action: "cancel",
        user
    });

    return { ok: true };
}

/** Summe der offenen Verbindlichkeiten. */
export async function outstandingBills(fiscalYearId?: string): Promise<Cents> {
    const [row] = await db
        .select({
            total: sql<string>`coalesce(sum(${bills.amount} - ${bills.paidAmount})::bigint, 0)`
        })
        .from(bills)
        .where(
            isUuid(fiscalYearId)
                ? and(eq(bills.fiscalYearId, fiscalYearId), inArray(bills.status, ["open", "partial"]))
                : inArray(bills.status, ["open", "partial"])
        );
    return Number(row?.total ?? 0);
}
