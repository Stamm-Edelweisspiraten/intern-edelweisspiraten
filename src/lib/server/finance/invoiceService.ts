import { and, asc, desc, eq, inArray, isNotNull, ne, sql, type SQL } from "drizzle-orm";
import { db, withTransaction, type Executor } from "$lib/server/db";
import { isUuid, onlyUuids } from "$lib/server/db/ids";
import {
    calendarDate,
    calendarYear,
    toCalendarDate,
    todayCalendar
} from "$lib/server/db/dates";
import {
    accounts,
    bankAccounts,
    financeLogs,
    fiscalYears,
    invoices,
    payments
} from "$lib/server/db/schema";
import { formatEuro, type Cents } from "$lib/money";
import { SYSTEM_ACCOUNTS } from "./chartOfAccounts";
import { getDefaultBankAccount } from "./bankAccountService";
import { postEntry, reverseEntry } from "./journalService";
import { nextNumber } from "./numbering";
import type { InvoiceStatus, InvoiceView, PaymentView } from "./types";

/**
 * Forderungen und Zahlungen.
 *
 * Der offene Betrag wird als paidAmount auf der Rechnung mitgefuehrt. Vorher
 * wurde er an vier Stellen aus den Buchungen neu berechnet -- und zwar nach
 * ZWEI unterschiedlichen Regeln, sodass Uebersicht und Detailansicht
 * zwangslaeufig verschiedene Summen zeigten.
 *
 * Der Ueberzahlungsschutz ist jetzt eine Pruefbedingung der Datenbank
 * (invoices_paid_check). Die frueher noetige manuelle Ruecknahme, wenn die
 * Folgebuchung fehlschlug, entfaellt: alles laeuft in einer Transaktion.
 */

type InvoiceRow = typeof invoices.$inferSelect;

export function toInvoiceView(row: InvoiceRow): InvoiceView {
    const outstanding = Math.max(0, row.amount - row.paidAmount);
    const dueDate = row.dueDate ?? null;

    return {
        id: row.id,
        number: row.number,
        fiscalYearId: row.fiscalYearId,
        memberId: row.memberId,
        member: row.memberName ?? "Unbekannt",
        kind: row.kind,
        amount: row.amount,
        paidAmount: row.paidAmount,
        outstanding,
        date: row.date.toISOString(),
        dueDate: dueDate ? dueDate.toISOString() : null,
        note: row.note,
        orderId: row.orderId,
        status: row.status,
        overdue:
            outstanding > 0 &&
            row.status !== "cancelled" &&
            dueDate !== null &&
            dueDate < startOfToday(),
        reminderLevel: row.reminderLevel
    };
}

function startOfToday(): Date {
    return todayCalendar();
}

// ---------------------------------------------------------------------------
// Anlegen
// ---------------------------------------------------------------------------

export interface CreateInvoiceInput {
    fiscalYearId: string;
    memberId?: string | null;
    member: string;
    kind: string;
    amount: Cents;
    date?: Date;
    dueDate?: Date | null;
    note?: string;
    orderId?: string | null;
    categoryId?: string | null;
    createdBy: string;
    /**
     * Wenn true, entsteht mit der Forderung auch der Buchungssatz
     * (Forderungen an Ertrag). Bei Jahresbeitraegen und Bestellungen ist das
     * gewuenscht; die Zahlung bucht spaeter nur noch Bank an Forderungen.
     */
    post?: boolean;
    /** Ertragskonto der Forderung; ohne Angabe das Beitragskonto. */
    revenueAccountId?: string | null;
}

export async function createInvoice(
    input: CreateInvoiceInput,
    executor?: Executor
): Promise<InvoiceView> {
    const run = async (tx: Executor): Promise<InvoiceView> => {
        const [year] = await tx
            .select()
            .from(fiscalYears)
            .where(eq(fiscalYears.id, input.fiscalYearId))
            .limit(1);
        if (!year) throw new Error("Geschäftsjahr nicht gefunden.");

        const number = await nextNumber("invoice", year.year, tx);
        const date = input.date ? toCalendarDate(input.date) : todayCalendar();

        const [row] = await tx
            .insert(invoices)
            .values({
                number,
                fiscalYearId: input.fiscalYearId,
                memberId: isUuid(input.memberId) ? input.memberId : null,
                memberName: input.member,
                kind: input.kind,
                categoryId: isUuid(input.categoryId) ? input.categoryId : null,
                amount: input.amount,
                paidAmount: 0,
                date,
                dueDate: input.dueDate ? toCalendarDate(input.dueDate) : null,
                note: input.note ?? "",
                orderId: isUuid(input.orderId) ? input.orderId : null,
                status: "open",
                createdBy: input.createdBy
            })
            .returning();

        if (input.post !== false) {
            const receivableId = await accountIdByNumber(tx, SYSTEM_ACCOUNTS.receivables);
            const revenueId =
                (isUuid(input.revenueAccountId) ? input.revenueAccountId : null) ??
                (await accountIdByNumber(tx, SYSTEM_ACCOUNTS.dues));

            if (receivableId && revenueId) {
                const result = await postEntry(
                    {
                        fiscalYearId: input.fiscalYearId,
                        date: clampToYear(date, year.year),
                        description: `${input.kind} ${number}${input.member ? ` – ${input.member}` : ""}`,
                        source: "invoice",
                        lines: [
                            {
                                accountId: receivableId,
                                debit: input.amount,
                                memberId: row.memberId,
                                memberName: row.memberName,
                                note: row.note
                            },
                            {
                                accountId: revenueId,
                                credit: input.amount,
                                memberId: row.memberId,
                                memberName: row.memberName,
                                note: row.note
                            }
                        ],
                        user: input.createdBy
                    },
                    tx
                );

                if (result.ok && result.entryId) {
                    await tx
                        .update(invoices)
                        .set({ entryId: result.entryId })
                        .where(eq(invoices.id, row.id));
                } else if (!result.ok) {
                    // Die Forderung ohne Buchung stehen zu lassen waere genau
                    // die Inkonsistenz, die dieses Modul verhindern soll.
                    throw new Error(result.error ?? "Buchung fehlgeschlagen.");
                }
            }
        }

        return toInvoiceView(row);
    };

    return executor ? run(executor) : withTransaction(run);
}

async function accountIdByNumber(tx: Executor, number: string): Promise<string | null> {
    const [row] = await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.number, number))
        .limit(1);
    return row?.id ?? null;
}

/** Haelt ein Datum innerhalb des Geschaeftsjahres, damit der Trigger greift. */
function clampToYear(date: Date, year: number): Date {
    const calendar = toCalendarDate(date);
    if (calendarYear(calendar) === year) return calendar;

    const today = todayCalendar();
    if (calendarYear(today) === year) return today;

    return calendarDate(year, 11, 31);
}

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

export interface OutstandingFilter {
    fiscalYearId?: string;
    /** Nur nicht archivierte Jahre berücksichtigen. */
    fiscalYearIds?: string[];
    memberId?: string;
}

/**
 * Die EINZIGE Berechnung offener Posten. Ersetzt die vier kopierten Varianten.
 */
export async function computeOutstanding(filter: OutstandingFilter = {}): Promise<InvoiceView[]> {
    const conditions: SQL[] = [inArray(invoices.status, ["open", "partial"])];

    if (isUuid(filter.fiscalYearId)) {
        conditions.push(eq(invoices.fiscalYearId, filter.fiscalYearId));
    } else if (filter.fiscalYearIds) {
        const valid = onlyUuids(filter.fiscalYearIds);
        if (valid.length === 0) return [];
        conditions.push(inArray(invoices.fiscalYearId, valid));
    }
    if (isUuid(filter.memberId)) conditions.push(eq(invoices.memberId, filter.memberId));

    const rows = await db
        .select()
        .from(invoices)
        .where(and(...conditions))
        .orderBy(asc(invoices.dueDate), asc(invoices.date));

    return rows.map(toInvoiceView).filter((invoice) => invoice.outstanding > 0);
}

export async function listInvoices(fiscalYearId: string): Promise<InvoiceView[]> {
    if (!isUuid(fiscalYearId)) return [];
    const rows = await db
        .select()
        .from(invoices)
        .where(eq(invoices.fiscalYearId, fiscalYearId))
        .orderBy(desc(invoices.date));
    return rows.map(toInvoiceView);
}

export async function getInvoice(id: string): Promise<InvoiceView | null> {
    if (!isUuid(id)) return null;
    const [row] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
    return row ? toInvoiceView(row) : null;
}

export async function listInvoicesForOrder(orderId: string): Promise<InvoiceView[]> {
    if (!isUuid(orderId)) return [];
    const rows = await db.select().from(invoices).where(eq(invoices.orderId, orderId));
    return rows.map(toInvoiceView);
}

/** Zahlungen einer Rechnung, fuer die Storno-Schaltflaeche in der Ansicht. */
export async function listPayments(invoiceId: string): Promise<PaymentView[]> {
    if (!isUuid(invoiceId)) return [];

    const rows = await db
        .select({ payment: payments, bankName: bankAccounts.name })
        .from(payments)
        .innerJoin(bankAccounts, eq(bankAccounts.id, payments.bankAccountId))
        .where(eq(payments.invoiceId, invoiceId))
        .orderBy(desc(payments.date));

    return rows.map(({ payment, bankName }) => ({
        id: payment.id,
        invoiceId: payment.invoiceId,
        billId: payment.billId,
        bankAccountId: payment.bankAccountId,
        bankAccountName: bankName,
        entryId: payment.entryId,
        amount: payment.amount,
        date: payment.date.toISOString(),
        note: payment.note,
        reversed: payment.reversedAt !== null,
        createdBy: payment.createdBy,
        createdAt: payment.createdAt.toISOString()
    }));
}

/** Zahlungen zu mehreren Rechnungen in einer Abfrage. */
export async function listPaymentsForInvoices(
    invoiceIds: string[]
): Promise<Map<string, PaymentView[]>> {
    const valid = onlyUuids(invoiceIds);
    if (valid.length === 0) return new Map();

    const rows = await db
        .select({ payment: payments, bankName: bankAccounts.name })
        .from(payments)
        .innerJoin(bankAccounts, eq(bankAccounts.id, payments.bankAccountId))
        .where(inArray(payments.invoiceId, valid))
        .orderBy(desc(payments.date));

    const map = new Map<string, PaymentView[]>();
    for (const { payment, bankName } of rows) {
        if (!payment.invoiceId) continue;
        const list = map.get(payment.invoiceId) ?? [];
        list.push({
            id: payment.id,
            invoiceId: payment.invoiceId,
            billId: payment.billId,
            bankAccountId: payment.bankAccountId,
            bankAccountName: bankName,
            entryId: payment.entryId,
            amount: payment.amount,
            date: payment.date.toISOString(),
            note: payment.note,
            reversed: payment.reversedAt !== null,
            createdBy: payment.createdBy,
            createdAt: payment.createdAt.toISOString()
        });
        map.set(payment.invoiceId, list);
    }
    return map;
}

// ---------------------------------------------------------------------------
// Zahlung
// ---------------------------------------------------------------------------

export interface PayInvoiceInput {
    invoiceId: string;
    amount: Cents;
    date?: Date;
    bankAccountId?: string | null;
    note?: string;
    user: string;
}

export interface PayInvoiceResult {
    ok: boolean;
    error?: string;
    invoice?: InvoiceView;
    /** Gesetzt, wenn die Rechnung dadurch vollständig beglichen ist. */
    settled?: boolean;
    orderId?: string | null;
    paymentId?: string;
}

/**
 * Verbucht eine Zahlung.
 *
 * Rechnung, Zahlung und Buchungssatz entstehen in EINER Transaktion. Die
 * Gutschrift laeuft als bedingtes UPDATE mit Pruefbedingung -- zwei
 * gleichzeitige Zahlungen koennen einander damit nicht ueberschreiben, und
 * eine Ueberzahlung wird von der Datenbank abgewiesen, nicht von der
 * Oberflaeche.
 */
export async function payInvoice(input: PayInvoiceInput): Promise<PayInvoiceResult> {
    if (!isUuid(input.invoiceId)) return { ok: false, error: "Ungültige Rechnungskennung." };
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
        return { ok: false, error: "Bitte einen Betrag größer als 0 angeben." };
    }

    const before = await getInvoice(input.invoiceId);
    if (!before) return { ok: false, error: "Rechnung nicht gefunden." };
    if (before.status === "cancelled") return { ok: false, error: "Diese Rechnung wurde storniert." };
    if (before.status === "paid") {
        return { ok: false, error: "Diese Rechnung ist bereits vollständig bezahlt." };
    }
    if (input.amount > before.outstanding) {
        return {
            ok: false,
            error: `Der Betrag übersteigt den offenen Rest. Offen sind noch ${formatEuro(before.outstanding)}.`
        };
    }

    const bank = input.bankAccountId
        ? await db
              .select()
              .from(bankAccounts)
              .where(eq(bankAccounts.id, input.bankAccountId))
              .limit(1)
              .then((rows) => rows[0] ?? null)
        : null;
    const target = bank ?? (await getDefaultBankAccount());
    if (!target) {
        return {
            ok: false,
            error: "Es ist kein Kassen- oder Bankkonto eingerichtet. Bitte zuerst eines anlegen."
        };
    }
    // Beide Quellen liefern Kennung und zugehoeriges Sachkonto.
    const bankAccountId = target.id;
    const bankLedgerAccountId = target.accountId;

    try {
        return await withTransaction(async (tx) => {
            // Bedingtes Hochzaehlen: nur wenn der Betrag noch hineinpasst.
            const updated = await tx
                .update(invoices)
                .set({
                    paidAmount: sql`${invoices.paidAmount} + ${input.amount}`,
                    status: sql`case when ${invoices.paidAmount} + ${input.amount} >= ${invoices.amount} then 'paid'::invoice_status else 'partial'::invoice_status end`,
                    updatedAt: new Date()
                })
                .where(
                    and(
                        eq(invoices.id, input.invoiceId),
                        inArray(invoices.status, ["open", "partial"]),
                        sql`${invoices.paidAmount} + ${input.amount} <= ${invoices.amount}`
                    )
                )
                .returning();

            if (updated.length === 0) {
                return {
                    ok: false,
                    error: `Der Betrag übersteigt den offenen Rest. Offen sind noch ${formatEuro(before.outstanding)}.`
                };
            }

            const invoice = updated[0];
            const date = input.date ? toCalendarDate(input.date) : todayCalendar();

            const [year] = await tx
                .select()
                .from(fiscalYears)
                .where(eq(fiscalYears.id, invoice.fiscalYearId))
                .limit(1);

            const receivableId = await accountIdByNumber(tx, SYSTEM_ACCOUNTS.receivables);
            if (!receivableId) throw new Error("Das Forderungskonto fehlt im Kontenrahmen.");

            const entry = await postEntry(
                {
                    fiscalYearId: invoice.fiscalYearId,
                    date: clampToYear(date, year?.year ?? date.getFullYear()),
                    description: `Zahlung ${invoice.number}${invoice.memberName ? ` – ${invoice.memberName}` : ""}`,
                    source: "payment",
                    lines: [
                        {
                            accountId: bankLedgerAccountId,
                            debit: input.amount,
                            memberId: invoice.memberId,
                            memberName: invoice.memberName,
                            bankAccountId,
                            note: input.note ?? ""
                        },
                        {
                            accountId: receivableId,
                            credit: input.amount,
                            memberId: invoice.memberId,
                            memberName: invoice.memberName,
                            note: input.note ?? ""
                        }
                    ],
                    user: input.user
                },
                tx
            );

            if (!entry.ok) throw new Error(entry.error ?? "Buchung fehlgeschlagen.");

            const [payment] = await tx
                .insert(payments)
                .values({
                    invoiceId: invoice.id,
                    bankAccountId,
                    entryId: entry.entryId ?? null,
                    amount: input.amount,
                    date,
                    note: input.note ?? "",
                    createdBy: input.user
                })
                .returning({ id: payments.id });

            await tx.insert(financeLogs).values({
                fiscalYearId: invoice.fiscalYearId,
                entity: "invoice",
                entityId: invoice.id,
                action: "pay",
                changes: [
                    { field: "paidAmount", before: before.paidAmount, after: invoice.paidAmount }
                ],
                user: input.user
            });

            return {
                ok: true,
                invoice: toInvoiceView(invoice),
                settled: invoice.status === "paid",
                orderId: invoice.orderId,
                paymentId: payment.id
            };
        });
    } catch (err) {
        console.error("Zahlung fehlgeschlagen:", err);
        return { ok: false, error: "Die Zahlung konnte nicht verbucht werden." };
    }
}

/**
 * Nimmt eine Zahlung zurueck.
 *
 * Der Buchungssatz wird storniert (nicht geloescht), die Zahlung als
 * storniert gekennzeichnet und der bezahlte Betrag der Rechnung reduziert.
 * Bisher gab es keine Moeglichkeit, eine falsch verbuchte Zahlung zu
 * korrigieren -- die Funktion existierte serverseitig, war aber an keine
 * Schaltflaeche angeschlossen.
 */
export async function reversePayment(
    paymentId: string,
    user: string
): Promise<{ ok: boolean; error?: string; orderId?: string | null }> {
    if (!isUuid(paymentId)) return { ok: false, error: "Ungültige Kennung." };

    const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
    if (!payment) return { ok: false, error: "Zahlung nicht gefunden." };
    if (payment.reversedAt) return { ok: false, error: "Diese Zahlung wurde bereits storniert." };
    if (!payment.invoiceId) return { ok: false, error: "Diese Zahlung gehört zu keiner Rechnung." };

    if (payment.entryId) {
        const reversal = await reverseEntry(payment.entryId, user, "Zahlung storniert");
        if (!reversal.ok) return { ok: false, error: reversal.error };
    }

    const invoiceId = payment.invoiceId;

    const [invoice] = await db
        .update(invoices)
        .set({
            paidAmount: sql`greatest(0, ${invoices.paidAmount} - ${payment.amount})`,
            status: sql`case
                when greatest(0, ${invoices.paidAmount} - ${payment.amount}) = 0 then 'open'::invoice_status
                when greatest(0, ${invoices.paidAmount} - ${payment.amount}) >= ${invoices.amount} then 'paid'::invoice_status
                else 'partial'::invoice_status
            end`,
            updatedAt: new Date()
        })
        .where(eq(invoices.id, invoiceId))
        .returning();

    await db.update(payments).set({ reversedAt: new Date() }).where(eq(payments.id, paymentId));

    await db.insert(financeLogs).values({
        fiscalYearId: invoice?.fiscalYearId ?? null,
        entity: "payment",
        entityId: paymentId,
        action: "reverse",
        changes: [{ field: "amount", before: payment.amount, after: 0 }],
        user
    });

    return { ok: true, orderId: invoice?.orderId ?? null };
}

// ---------------------------------------------------------------------------
// Storno und Mahnstufen
// ---------------------------------------------------------------------------

export async function cancelInvoice(
    id: string,
    reason: string,
    user: string
): Promise<{ ok: boolean; error?: string }> {
    if (!isUuid(id)) return { ok: false, error: "Ungültige Kennung." };

    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
    if (!invoice) return { ok: false, error: "Rechnung nicht gefunden." };
    if (invoice.status === "cancelled") return { ok: true };
    if (invoice.paidAmount > 0) {
        return {
            ok: false,
            error: "Auf diese Rechnung wurden bereits Zahlungen gebucht. Bitte diese zuerst stornieren."
        };
    }

    // Die Entstehungsbuchung wird mit storniert, sonst bliebe die Forderung
    // im Kontenplan stehen, obwohl sie fachlich nicht mehr existiert.
    if (invoice.entryId) {
        const reversal = await reverseEntry(invoice.entryId, user, reason || "Rechnung storniert");
        if (!reversal.ok) return { ok: false, error: reversal.error };
    }

    await db
        .update(invoices)
        .set({
            status: "cancelled" as InvoiceStatus,
            note: reason ? `${invoice.note} ${reason}`.trim() : invoice.note,
            updatedAt: new Date()
        })
        .where(eq(invoices.id, id));

    await db.insert(financeLogs).values({
        fiscalYearId: invoice.fiscalYearId,
        entity: "invoice",
        entityId: id,
        action: "cancel",
        user
    });

    return { ok: true };
}

/** Storniert alle Rechnungen einer Bestellung (z.B. bei deren Stornierung). */
export async function cancelInvoicesForOrder(orderId: string, user: string): Promise<number> {
    if (!isUuid(orderId)) return 0;

    const rows = await db
        .select({ id: invoices.id })
        .from(invoices)
        .where(and(eq(invoices.orderId, orderId), ne(invoices.status, "cancelled")));

    let cancelled = 0;
    for (const row of rows) {
        const result = await cancelInvoice(row.id, "(Bestellung storniert)", user);
        if (result.ok) cancelled += 1;
    }
    return cancelled;
}

/** Erhoeht die Mahnstufe und haelt den Zeitpunkt fest. */
export async function registerReminder(id: string, user: string): Promise<boolean> {
    if (!isUuid(id)) return false;

    const rows = await db
        .update(invoices)
        .set({
            remindedAt: new Date(),
            reminderLevel: sql`${invoices.reminderLevel} + 1`,
            updatedAt: new Date()
        })
        .where(and(eq(invoices.id, id), inArray(invoices.status, ["open", "partial"])))
        .returning({ id: invoices.id, fiscalYearId: invoices.fiscalYearId });

    if (rows.length === 0) return false;

    await db.insert(financeLogs).values({
        fiscalYearId: rows[0].fiscalYearId,
        entity: "invoice",
        entityId: id,
        action: "update",
        changes: [{ field: "reminderLevel", before: null, after: "erhöht" }],
        user
    });

    return true;
}

/** Rechnungen mit Bestellbezug eines Jahres -- fuer die Jahresansicht. */
export async function listOrderInvoiceIds(fiscalYearId: string): Promise<string[]> {
    if (!isUuid(fiscalYearId)) return [];
    const rows = await db
        .select({ orderId: invoices.orderId })
        .from(invoices)
        .where(and(eq(invoices.fiscalYearId, fiscalYearId), isNotNull(invoices.orderId)));
    return Array.from(new Set(rows.map((row) => row.orderId).filter((id): id is string => !!id)));
}
