import { ObjectId } from "mongodb";
import {
    fiscalInvoices,
    fiscalTransactions,
    financeLogs,
    type FiscalInvoiceDoc
} from "$lib/server/db/collections";
import type { Cents } from "$lib/money";
import type { InvoiceStatus, InvoiceView } from "./types";

/**
 * Rechnungen und Zahlungen.
 *
 * Der offene Betrag wird als paidAmount auf der Rechnung mitgeführt. Vorher
 * wurde er an vier Stellen aus den Buchungen neu berechnet -- und zwar nach
 * ZWEI unterschiedlichen Regeln: die Übersicht ordnete Buchungen unscharf über
 * Mitglied und Art zu, die Detailseiten strikt über die Rechnungskennung.
 * Da manuelle Buchungen nie eine Rechnungskennung setzten, widersprachen sich
 * die angezeigten Summen zwangsläufig.
 */

export function toInvoiceView(doc: FiscalInvoiceDoc): InvoiceView {
    const outstanding = Math.max(0, doc.amount - doc.paidAmount);
    const dueDate = doc.dueDate ?? null;

    return {
        id: doc._id!.toString(),
        fiscalYearId: doc.fiscalYearId.toString(),
        memberId: doc.memberId ?? null,
        member: doc.member ?? "Unbekannt",
        kind: doc.kind,
        amount: doc.amount,
        paidAmount: doc.paidAmount,
        outstanding,
        date: doc.date.toISOString(),
        dueDate: dueDate ? dueDate.toISOString() : null,
        note: doc.note ?? "",
        orderId: doc.orderId ? doc.orderId.toString() : null,
        status: doc.status,
        overdue:
            outstanding > 0 &&
            doc.status !== "cancelled" &&
            dueDate !== null &&
            dueDate < new Date()
    };
}

export interface CreateInvoiceInput {
    fiscalYearId: ObjectId;
    memberId?: string | null;
    member: string;
    kind: string;
    amount: Cents;
    date?: Date;
    dueDate?: Date | null;
    note?: string;
    orderId?: ObjectId | null;
    createdBy: string;
}

export async function createInvoice(input: CreateInvoiceInput): Promise<InvoiceView> {
    const doc: FiscalInvoiceDoc = {
        fiscalYearId: input.fiscalYearId,
        memberId: input.memberId ?? null,
        member: input.member,
        kind: input.kind,
        amount: input.amount,
        paidAmount: 0,
        date: input.date ?? new Date(),
        dueDate: input.dueDate ?? null,
        note: input.note ?? "",
        orderId: input.orderId ?? null,
        status: "open",
        createdBy: input.createdBy,
        createdAt: new Date()
    };

    const result = await fiscalInvoices().insertOne(doc);
    return toInvoiceView({ ...doc, _id: result.insertedId });
}

export interface OutstandingFilter {
    fiscalYearId?: ObjectId;
    /** Nur nicht archivierte Jahre berücksichtigen. */
    fiscalYearIds?: ObjectId[];
    memberId?: string;
}

/**
 * Die EINZIGE Berechnung offener Posten. Ersetzt die vier kopierten Varianten.
 */
export async function computeOutstanding(filter: OutstandingFilter = {}): Promise<InvoiceView[]> {
    const query: Record<string, unknown> = { status: { $in: ["open", "partial"] } };

    if (filter.fiscalYearId) query.fiscalYearId = filter.fiscalYearId;
    else if (filter.fiscalYearIds) query.fiscalYearId = { $in: filter.fiscalYearIds };
    if (filter.memberId) query.memberId = filter.memberId;

    const docs = await fiscalInvoices()
        .find(query as never)
        .sort({ dueDate: 1, date: 1 })
        .toArray();

    return docs.map(toInvoiceView).filter((invoice) => invoice.outstanding > 0);
}

export async function listInvoices(fiscalYearId: ObjectId): Promise<InvoiceView[]> {
    const docs = await fiscalInvoices().find({ fiscalYearId }).sort({ date: -1 }).toArray();
    return docs.map(toInvoiceView);
}

export async function getInvoice(id: string): Promise<InvoiceView | null> {
    if (!ObjectId.isValid(id)) return null;
    const doc = await fiscalInvoices().findOne({ _id: new ObjectId(id) });
    return doc ? toInvoiceView(doc) : null;
}

export interface PayInvoiceInput {
    invoiceId: string;
    amount: Cents;
    date?: Date;
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
}

/**
 * Verbucht eine Zahlung.
 *
 * Der Betrag wird in EINEM bedingten Schreibvorgang gutgeschrieben. Die
 * $expr-Bedingung ist zugleich der Schutz vor Überzahlung, den beide bisherige
 * Umsetzungen nicht hatten: sie lasen den Stand, rechneten im Speicher und
 * schrieben zurück, sodass zwei gleichzeitige Zahlungen einander überschreiben
 * konnten.
 */
export async function payInvoice(input: PayInvoiceInput): Promise<PayInvoiceResult> {
    if (!ObjectId.isValid(input.invoiceId)) {
        return { ok: false, error: "Ungültige Rechnungskennung." };
    }
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
        return { ok: false, error: "Bitte einen Betrag größer als 0 angeben." };
    }

    const invoiceId = new ObjectId(input.invoiceId);
    const before = await fiscalInvoices().findOne({ _id: invoiceId });
    if (!before) return { ok: false, error: "Rechnung nicht gefunden." };
    if (before.status === "cancelled") {
        return { ok: false, error: "Diese Rechnung wurde storniert." };
    }
    if (before.status === "paid") {
        return { ok: false, error: "Diese Rechnung ist bereits vollständig bezahlt." };
    }

    const updated = await fiscalInvoices().findOneAndUpdate(
        {
            _id: invoiceId,
            status: { $in: ["open", "partial"] },
            $expr: { $lte: [{ $add: ["$paidAmount", input.amount] }, "$amount"] }
        },
        [
            {
                $set: {
                    paidAmount: { $add: ["$paidAmount", input.amount] },
                    status: {
                        $cond: [
                            { $eq: [{ $add: ["$paidAmount", input.amount] }, "$amount"] },
                            "paid",
                            "partial"
                        ]
                    },
                    updatedAt: "$$NOW"
                }
            }
        ],
        { returnDocument: "after" }
    );

    if (!updated) {
        const rest = before.amount - before.paidAmount;
        return {
            ok: false,
            error: `Der Betrag übersteigt den offenen Rest. Offen sind noch ${(rest / 100).toFixed(2).replace(".", ",")} EUR.`
        };
    }

    // Zugehörige Buchung anlegen. Schlägt das fehl, wird die Gutschrift
    // zurückgenommen, damit kein Geld ohne Beleg verbucht bleibt.
    try {
        await fiscalTransactions().insertOne({
            fiscalYearId: before.fiscalYearId,
            invoiceId,
            memberId: before.memberId ?? null,
            member: before.member,
            date: input.date ?? new Date(),
            direction: "in",
            kind: before.kind,
            amount: input.amount,
            note: input.note ?? "",
            createdBy: input.user,
            createdAt: new Date()
        });
    } catch (err) {
        await fiscalInvoices().updateOne(
            { _id: invoiceId },
            { $set: { paidAmount: before.paidAmount, status: before.status } }
        );
        throw err;
    }

    await financeLogs().insertOne({
        fiscalYearId: before.fiscalYearId,
        entity: "invoice",
        entityId: input.invoiceId,
        action: "pay",
        changes: [{ field: "paidAmount", before: before.paidAmount, after: updated.paidAmount }],
        user: input.user,
        createdAt: new Date()
    });

    return {
        ok: true,
        invoice: toInvoiceView(updated),
        settled: updated.status === "paid",
        orderId: updated.orderId ? updated.orderId.toString() : null
    };
}

/**
 * Nimmt eine Zahlung zurueck. Bisher gab es keine Moeglichkeit, eine falsch
 * verbuchte Zahlung zu korrigieren.
 */
export async function reversePayment(
    transactionId: string,
    user: string
): Promise<{ ok: boolean; error?: string; orderId?: string | null }> {
    if (!ObjectId.isValid(transactionId)) {
        return { ok: false, error: "Ungültige Kennung." };
    }

    const transaction = await fiscalTransactions().findOne({ _id: new ObjectId(transactionId) });
    if (!transaction) return { ok: false, error: "Buchung nicht gefunden." };
    if (!transaction.invoiceId) {
        return { ok: false, error: "Diese Buchung gehört zu keiner Rechnung." };
    }

    const updated = await fiscalInvoices().findOneAndUpdate(
        { _id: transaction.invoiceId },
        [
            {
                $set: {
                    paidAmount: {
                        $max: [0, { $subtract: ["$paidAmount", transaction.amount] }]
                    },
                    updatedAt: "$$NOW"
                }
            },
            {
                $set: {
                    status: {
                        $cond: [
                            { $eq: ["$paidAmount", 0] },
                            "open",
                            { $cond: [{ $gte: ["$paidAmount", "$amount"] }, "paid", "partial"] }
                        ]
                    }
                }
            }
        ],
        { returnDocument: "after" }
    );

    await fiscalTransactions().deleteOne({ _id: transaction._id });

    await financeLogs().insertOne({
        fiscalYearId: transaction.fiscalYearId,
        entity: "invoice",
        entityId: transaction.invoiceId.toString(),
        action: "update",
        changes: [{ field: "paidAmount", before: "storniert", after: updated?.paidAmount ?? 0 }],
        user,
        createdAt: new Date()
    });

    return { ok: true, orderId: updated?.orderId ? updated.orderId.toString() : null };
}

export async function cancelInvoice(
    id: string,
    reason: string,
    user: string
): Promise<{ ok: boolean; error?: string }> {
    if (!ObjectId.isValid(id)) return { ok: false, error: "Ungültige Kennung." };

    const invoiceId = new ObjectId(id);
    const invoice = await fiscalInvoices().findOne({ _id: invoiceId });
    if (!invoice) return { ok: false, error: "Rechnung nicht gefunden." };
    if (invoice.paidAmount > 0) {
        return {
            ok: false,
            error: "Auf diese Rechnung wurden bereits Zahlungen gebucht. Bitte diese zuerst stornieren."
        };
    }

    await fiscalInvoices().updateOne(
        { _id: invoiceId },
        {
            $set: {
                status: "cancelled" as InvoiceStatus,
                note: reason ? `${invoice.note ?? ""} ${reason}`.trim() : invoice.note,
                updatedAt: new Date()
            }
        }
    );

    await financeLogs().insertOne({
        fiscalYearId: invoice.fiscalYearId,
        entity: "invoice",
        entityId: id,
        action: "cancel",
        user,
        createdAt: new Date()
    });

    return { ok: true };
}

/** Storniert alle Rechnungen einer Bestellung (z.B. bei deren Stornierung). */
export async function cancelInvoicesForOrder(orderId: ObjectId, user: string): Promise<number> {
    const invoices = await fiscalInvoices().find({ orderId, status: { $ne: "cancelled" } }).toArray();

    let cancelled = 0;
    for (const invoice of invoices) {
        const result = await cancelInvoice(invoice._id!.toString(), "(Bestellung storniert)", user);
        if (result.ok) cancelled += 1;
    }
    return cancelled;
}
