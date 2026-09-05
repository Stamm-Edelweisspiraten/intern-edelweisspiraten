import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "$lib/server/db";
import { isUuid } from "$lib/server/db/ids";
import { invoices, orderInvoices, orders } from "$lib/server/db/schema";
import { splitEvenly } from "$lib/money";
import { cancelInvoicesForOrder, createInvoice } from "$lib/server/finance/invoiceService";
import { getActiveFiscalYear } from "$lib/server/finance/yearService";
import { getCategoryByName } from "$lib/server/finance/categoryService";
import { KIND_ORDER, NoActiveFiscalYearError } from "$lib/server/finance/types";
import type { PaymentStatus } from "$lib/kaemmerer/orderStatus";

/**
 * Verbindungsschicht zwischen Bestellungen und Kasse.
 *
 * Dies ist das EINZIGE Modul, das beide Seiten kennt. Vorher importierte der
 * Kämmerer-Service die Kasse und die Kasse rief den Kämmerer über ein
 * dynamisches import() innerhalb eines try/catch auf, um genau diesen Zirkel
 * zu umgehen -- mit der Folge, dass Fehler beim Abgleich nur auf der Konsole
 * landeten und der Zahlungsstatus einer Bestellung unbemerkt auseinanderlief.
 */

export interface OrderInvoiceInput {
    orderId: string;
    orderNumber: string;
    members: { id: string; name: string }[];
    total: number;
    createdBy: string;
    itemSummary: string;
}

/**
 * Legt je Mitglied eine Rechnung an. Der Gesamtbetrag wird centgenau
 * aufgeteilt -- vorher wurde pro Kopf auf zwei Nachkommastellen gerundet,
 * sodass bei 10,00 EUR auf drei Mitglieder nur 9,99 EUR berechnet wurden.
 */
export async function createInvoicesForOrder(input: OrderInvoiceInput): Promise<string[]> {
    if (input.members.length === 0) return [];

    const year = await getActiveFiscalYear();
    if (!year) {
        // Vorher wurde hier still ein leeres Ergebnis zurückgegeben: die
        // Bestellung existierte, aber niemand wurde je belastet.
        throw new NoActiveFiscalYearError();
    }

    const category = await getCategoryByName(KIND_ORDER);
    const shares = splitEvenly(input.total, input.members.length);
    const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const invoiceIds: string[] = [];

    for (const [index, member] of input.members.entries()) {
        const invoice = await createInvoice({
            fiscalYearId: year.id,
            memberId: member.id,
            member: member.name,
            // Die Bestellnummer gehoert in die Art, sonst verhindert der
            // eindeutige Index (Jahr, Mitglied, Art) eine zweite Bestellung
            // desselben Mitglieds im selben Jahr.
            kind: `${KIND_ORDER} ${input.orderNumber}`,
            categoryId: category?.id ?? null,
            revenueAccountId: category?.accountId ?? null,
            amount: shares[index],
            dueDate,
            note: `Bestellung ${input.orderNumber}: ${input.itemSummary}`,
            orderId: input.orderId,
            createdBy: input.createdBy
        });

        await db
            .insert(orderInvoices)
            .values({ orderId: input.orderId, invoiceId: invoice.id })
            .onConflictDoNothing();

        invoiceIds.push(invoice.id);
    }

    return invoiceIds;
}

/**
 * Gleicht den Zahlungsstatus einer Bestellung mit ihren Rechnungen ab.
 *
 * Wichtig: der Lieferstatus (status) wird NICHT angefasst. Vorher wurde bei
 * vollständiger Bezahlung status auf "paid" gesetzt und damit die Information
 * "geliefert" überschrieben. Lieferung und Bezahlung sind zwei unabhängige
 * Merkmale.
 */
export async function syncOrderPayment(orderId: string): Promise<PaymentStatus | null> {
    if (!isUuid(orderId)) return null;

    const rows = await db.select().from(invoices).where(eq(invoices.orderId, orderId));
    if (rows.length === 0) return null;

    const relevant = rows.filter((invoice) => invoice.status !== "cancelled");
    if (relevant.length === 0) return null;

    const allPaid = relevant.every((invoice) => invoice.status === "paid");
    const anyPaid = relevant.some((invoice) => invoice.paidAmount > 0);

    const paymentStatus: PaymentStatus = allPaid ? "paid" : anyPaid ? "partial" : "open";

    await db
        .update(orders)
        .set({ paymentStatus, updatedAt: new Date() })
        .where(eq(orders.id, orderId));

    return paymentStatus;
}

/** Wird beim Stornieren einer Bestellung aufgerufen. */
export async function cancelOrderBilling(orderId: string, user: string): Promise<number> {
    if (!isUuid(orderId)) return 0;

    const cancelled = await cancelInvoicesForOrder(orderId, user);
    await db
        .update(orders)
        .set({ paymentStatus: "open", updatedAt: new Date() })
        .where(eq(orders.id, orderId));
    return cancelled;
}

/** Bestellungen, deren Rechnungen zu einem Geschäftsjahr gehören. */
export async function getOrdersForFiscalYear(fiscalYearId: string) {
    if (!isUuid(fiscalYearId)) return [];

    const rows = await db
        .selectDistinct({ order: orders })
        .from(orders)
        .innerJoin(invoices, eq(invoices.orderId, orders.id))
        .where(eq(invoices.fiscalYearId, fiscalYearId))
        .orderBy(desc(orders.createdAt));

    return rows.map((row) => row.order);
}

/** Offene Rechnungsbetraege je Bestellung -- fuer die Bestelluebersicht. */
export async function outstandingByOrder(orderIds: string[]): Promise<Map<string, number>> {
    const valid = orderIds.filter(isUuid);
    if (valid.length === 0) return new Map();

    const rows = await db
        .select({
            orderId: invoices.orderId,
            amount: invoices.amount,
            paidAmount: invoices.paidAmount
        })
        .from(invoices)
        .where(and(inArray(invoices.orderId, valid), ne(invoices.status, "cancelled")));

    const map = new Map<string, number>();
    for (const row of rows) {
        if (!row.orderId) continue;
        map.set(row.orderId, (map.get(row.orderId) ?? 0) + (row.amount - row.paidAmount));
    }
    return map;
}
