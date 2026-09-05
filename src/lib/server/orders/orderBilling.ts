import { ObjectId } from "mongodb";
import { fiscalInvoices, orders } from "$lib/server/db/collections";
import { splitEvenly } from "$lib/money";
import { createInvoice, cancelInvoicesForOrder } from "$lib/server/finance/invoiceService";
import { getActiveFiscalYear } from "$lib/server/finance/yearService";
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
    orderId: ObjectId;
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

    const shares = splitEvenly(input.total, input.members.length);
    const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const invoiceIds: string[] = [];

    for (const [index, member] of input.members.entries()) {
        const invoice = await createInvoice({
            fiscalYearId: new ObjectId(year.id),
            memberId: member.id,
            member: member.name,
            kind: KIND_ORDER,
            amount: shares[index],
            dueDate,
            note: `Bestellung ${input.orderNumber}: ${input.itemSummary}`,
            orderId: input.orderId,
            createdBy: input.createdBy
        });

        invoiceIds.push(invoice.id);
    }

    return invoiceIds;
}

/**
 * Gleicht den Zahlungsstatus einer Bestellung mit ihren Rechnungen ab.
 *
 * Wichtig: der Lieferstatus (status) wird NICHT mehr angefasst. Vorher wurde
 * bei vollständiger Bezahlung status auf "paid" gesetzt und damit die
 * Information "geliefert" überschrieben. Lieferung und Bezahlung sind zwei
 * unabhängige Merkmale.
 */
export async function syncOrderPayment(orderId: ObjectId): Promise<PaymentStatus | null> {
    const invoices = await fiscalInvoices().find({ orderId }).toArray();
    if (invoices.length === 0) return null;

    const relevant = invoices.filter((invoice) => invoice.status !== "cancelled");
    if (relevant.length === 0) return null;

    const allPaid = relevant.every((invoice) => invoice.status === "paid");
    const anyPaid = relevant.some((invoice) => invoice.paidAmount > 0);

    const paymentStatus: PaymentStatus = allPaid ? "paid" : anyPaid ? "partial" : "open";

    await orders().updateOne(
        { _id: orderId },
        { $set: { paymentStatus, updatedAt: new Date() } }
    );

    return paymentStatus;
}

/** Wird beim Stornieren einer Bestellung aufgerufen. */
export async function cancelOrderBilling(orderId: ObjectId, user: string): Promise<number> {
    const cancelled = await cancelInvoicesForOrder(orderId, user);
    await orders().updateOne(
        { _id: orderId },
        { $set: { paymentStatus: "open" as PaymentStatus, updatedAt: new Date() } }
    );
    return cancelled;
}

/** Bestellungen, deren Rechnungen zu einem Geschäftsjahr gehören. */
export async function getOrdersForFiscalYear(fiscalYearId: ObjectId) {
    const invoices = await fiscalInvoices()
        .find({ fiscalYearId, orderId: { $ne: null } })
        .toArray();

    const orderIds = Array.from(
        new Set(invoices.map((invoice) => invoice.orderId!.toString()))
    ).map((id) => new ObjectId(id));

    if (orderIds.length === 0) return [];

    return orders().find({ _id: { $in: orderIds } }).sort({ createdAt: -1 }).toArray();
}
