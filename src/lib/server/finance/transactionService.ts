import { ObjectId } from "mongodb";
import {
    fiscalTransactions,
    fiscalInvoices,
    fiscalYears,
    financeLogs,
    type FiscalTransactionDoc
} from "$lib/server/db/collections";
import type { Cents } from "$lib/money";
import type { TransactionDirection, TransactionView } from "./types";

/** Buchungen: anlegen, ändern, löschen, auflisten. */

export function toTransactionView(doc: FiscalTransactionDoc): TransactionView {
    return {
        id: doc._id!.toString(),
        fiscalYearId: doc.fiscalYearId.toString(),
        invoiceId: doc.invoiceId ? doc.invoiceId.toString() : null,
        memberId: doc.memberId ?? null,
        member: doc.member ?? "",
        date: doc.date.toISOString(),
        direction: doc.direction,
        kind: doc.kind,
        amount: doc.amount,
        note: doc.note ?? "",
        receiptFileId: doc.receiptFileId ?? null,
        createdBy: doc.createdBy ?? "",
        createdAt: doc.createdAt.toISOString()
    };
}

export async function listTransactions(
    fiscalYearId: ObjectId,
    options: { limit?: number; skip?: number } = {}
): Promise<TransactionView[]> {
    const cursor = fiscalTransactions().find({ fiscalYearId }).sort({ date: -1, createdAt: -1 });

    if (options.skip) cursor.skip(options.skip);
    if (options.limit) cursor.limit(options.limit);

    return (await cursor.toArray()).map(toTransactionView);
}

export async function countTransactions(fiscalYearId: ObjectId): Promise<number> {
    return fiscalTransactions().countDocuments({ fiscalYearId });
}

export interface CreateTransactionInput {
    fiscalYearId: string;
    invoiceId?: string | null;
    memberId?: string | null;
    member?: string;
    date: Date;
    direction: TransactionDirection;
    kind: string;
    amount: Cents;
    note?: string;
    receiptFileId?: string | null;
    user: string;
}

export async function createTransaction(
    input: CreateTransactionInput
): Promise<{ ok: boolean; error?: string; transaction?: TransactionView }> {
    if (!ObjectId.isValid(input.fiscalYearId)) {
        return { ok: false, error: "Ungültiges Geschäftsjahr." };
    }
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
        return { ok: false, error: "Bitte einen Betrag größer als 0 angeben." };
    }

    const fiscalYearId = new ObjectId(input.fiscalYearId);
    const year = await fiscalYears().findOne({ _id: fiscalYearId });
    if (!year) return { ok: false, error: "Geschäftsjahr nicht gefunden." };
    if (year.status !== "active") {
        return { ok: false, error: "In abgeschlossenen Geschäftsjahren kann nicht gebucht werden." };
    }

    // Das Buchungsdatum muss ins Geschäftsjahr fallen. Vorher war das Datum
    // eine freie Zeichenkette, die nie geprüft wurde.
    if (input.date.getFullYear() !== year.year) {
        return {
            ok: false,
            error: `Das Datum muss im Geschäftsjahr ${year.year} liegen.`
        };
    }

    const doc: FiscalTransactionDoc = {
        fiscalYearId,
        invoiceId: input.invoiceId && ObjectId.isValid(input.invoiceId) ? new ObjectId(input.invoiceId) : null,
        memberId: input.memberId ?? null,
        member: input.member ?? "",
        date: input.date,
        direction: input.direction,
        kind: input.kind,
        amount: input.amount,
        note: input.note ?? "",
        receiptFileId: input.receiptFileId ?? null,
        createdBy: input.user,
        createdAt: new Date()
    };

    const result = await fiscalTransactions().insertOne(doc);

    await financeLogs().insertOne({
        fiscalYearId,
        entity: "transaction",
        entityId: result.insertedId.toString(),
        action: "create",
        user: input.user,
        createdAt: new Date()
    });

    return { ok: true, transaction: toTransactionView({ ...doc, _id: result.insertedId }) };
}

export interface UpdateTransactionInput {
    date?: Date;
    direction?: TransactionDirection;
    kind?: string;
    amount?: Cents;
    note?: string;
    receiptFileId?: string | null;
}

/**
 * Ändert eine Buchung. Die Funktion existierte bereits, war aber an keine
 * Route angeschlossen -- ein Tippfehler in einer Buchung war damit nicht
 * korrigierbar.
 */
export async function updateTransaction(
    id: string,
    input: UpdateTransactionInput,
    user: string
): Promise<{ ok: boolean; error?: string }> {
    if (!ObjectId.isValid(id)) return { ok: false, error: "Ungültige Kennung." };

    const transactionId = new ObjectId(id);
    const before = await fiscalTransactions().findOne({ _id: transactionId });
    if (!before) return { ok: false, error: "Buchung nicht gefunden." };

    // Zahlungen auf Rechnungen dürfen hier nicht angefasst werden, sonst
    // liefe paidAmount aus dem Ruder.
    if (before.invoiceId) {
        return {
            ok: false,
            error: "Diese Buchung gehört zu einer Rechnung. Bitte die Zahlung stornieren und neu erfassen."
        };
    }

    const year = await fiscalYears().findOne({ _id: before.fiscalYearId });
    if (year?.status !== "active") {
        return { ok: false, error: "In abgeschlossenen Geschäftsjahren kann nicht gebucht werden." };
    }

    if (input.amount !== undefined && (!Number.isInteger(input.amount) || input.amount <= 0)) {
        return { ok: false, error: "Bitte einen Betrag größer als 0 angeben." };
    }
    if (input.date && year && input.date.getFullYear() !== year.year) {
        return { ok: false, error: `Das Datum muss im Geschäftsjahr ${year.year} liegen.` };
    }

    const update: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of ["date", "direction", "kind", "amount", "note", "receiptFileId"] as const) {
        if (input[key] !== undefined) update[key] = input[key];
    }

    await fiscalTransactions().updateOne({ _id: transactionId }, { $set: update });

    await financeLogs().insertOne({
        fiscalYearId: before.fiscalYearId,
        entity: "transaction",
        entityId: id,
        action: "update",
        changes: Object.entries(update)
            .filter(([field]) => field !== "updatedAt")
            .map(([field, after]) => ({
                field,
                before: (before as unknown as Record<string, unknown>)[field],
                after
            })),
        user,
        createdAt: new Date()
    });

    return { ok: true };
}

export async function deleteTransaction(
    id: string,
    user: string
): Promise<{ ok: boolean; error?: string }> {
    if (!ObjectId.isValid(id)) return { ok: false, error: "Ungültige Kennung." };

    const transactionId = new ObjectId(id);
    const before = await fiscalTransactions().findOne({ _id: transactionId });
    if (!before) return { ok: false, error: "Buchung nicht gefunden." };

    if (before.invoiceId) {
        return {
            ok: false,
            error: "Diese Buchung gehört zu einer Rechnung. Bitte stattdessen die Zahlung stornieren."
        };
    }

    const year = await fiscalYears().findOne({ _id: before.fiscalYearId });
    if (year?.status !== "active") {
        return { ok: false, error: "In abgeschlossenen Geschäftsjahren kann nicht gebucht werden." };
    }

    await fiscalTransactions().deleteOne({ _id: transactionId });

    await financeLogs().insertOne({
        fiscalYearId: before.fiscalYearId,
        entity: "transaction",
        entityId: id,
        action: "delete",
        changes: [{ field: "amount", before: before.amount, after: null }],
        user,
        createdAt: new Date()
    });

    return { ok: true };
}

/** Entfernt alle Spuren eines gelöschten Mitglieds. */
export async function removeMemberTransactions(memberId: string): Promise<void> {
    await fiscalTransactions().updateMany({ memberId }, { $set: { memberId: null } });
    await fiscalInvoices().updateMany({ memberId }, { $set: { memberId: null } });
}
