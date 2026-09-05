import { ObjectId } from "mongodb";
import {
    fiscalYears,
    fiscalInvoices,
    fiscalTransactions,
    financeLogs,
    type FiscalYearDoc
} from "$lib/server/db/collections";
import type { Cents } from "$lib/money";
import type { Dues, FiscalYearStatus, FiscalYearView, YearSummary } from "./types";

/** Geschäftsjahre: anlegen, auflisten, abschließen, archivieren. */

export function toYearView(doc: FiscalYearDoc): FiscalYearView {
    return {
        id: doc._id!.toString(),
        year: doc.year,
        dues: doc.dues,
        status: doc.status,
        openingBalance: doc.openingBalance ?? 0,
        closedAt: doc.closedAt ? doc.closedAt.toISOString() : null,
        createdAt: doc.createdAt.toISOString()
    };
}

export async function listFiscalYears(): Promise<FiscalYearView[]> {
    const docs = await fiscalYears().find().sort({ year: -1 }).toArray();
    return docs.map(toYearView);
}

export async function getFiscalYear(id: string): Promise<FiscalYearView | null> {
    if (!ObjectId.isValid(id)) return null;
    const doc = await fiscalYears().findOne({ _id: new ObjectId(id) });
    return doc ? toYearView(doc) : null;
}

/**
 * Aktives Geschäftsjahr: bevorzugt das laufende Kalenderjahr, sonst das
 * jüngste aktive.
 */
export async function getActiveFiscalYear(): Promise<FiscalYearView | null> {
    const current = await fiscalYears().findOne({
        year: new Date().getFullYear(),
        status: "active"
    });
    if (current) return toYearView(current);

    const newest = await fiscalYears()
        .find({ status: "active" })
        .sort({ year: -1 })
        .limit(1)
        .toArray();

    return newest[0] ? toYearView(newest[0]) : null;
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
    const doc: FiscalYearDoc = {
        year: input.year,
        dues: input.dues,
        status: "active",
        openingBalance: input.openingBalance ?? 0,
        closedAt: null,
        createdAt: new Date()
    };

    try {
        const result = await fiscalYears().insertOne(doc);
        const view = toYearView({ ...doc, _id: result.insertedId });

        await financeLogs().insertOne({
            fiscalYearId: result.insertedId,
            entity: "fiscalYear",
            entityId: result.insertedId.toString(),
            action: "create",
            user: input.createdBy,
            createdAt: new Date()
        });

        return { ok: true, year: view };
    } catch (err: unknown) {
        // Der eindeutige Index auf year verhindert Doppelanlagen, die vorher
        // moeglich waren -- inklusive widerspruechlicher Beitragssaetze.
        if ((err as { code?: number })?.code === 11000) {
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
    if (!ObjectId.isValid(id)) return { ok: false, error: "Ungültige Kennung." };

    const objectId = new ObjectId(id);
    const year = await fiscalYears().findOne({ _id: objectId });
    if (!year) return { ok: false, error: "Geschäftsjahr nicht gefunden." };
    if (year.status !== "active") {
        return { ok: false, error: "Abgeschlossene Geschäftsjahre können nicht geändert werden." };
    }

    await fiscalYears().updateOne({ _id: objectId }, { $set: { dues, updatedAt: new Date() } });
    await financeLogs().insertOne({
        fiscalYearId: objectId,
        entity: "fiscalYear",
        entityId: id,
        action: "update",
        changes: [{ field: "dues", before: year.dues, after: dues }],
        user,
        createdAt: new Date()
    });

    return { ok: true };
}

/**
 * Schließt ein Geschäftsjahr ab. Offene Posten müssen entweder ausgeglichen
 * oder ausdrücklich ins Folgejahr übernommen werden -- vorher gab es weder
 * einen Abschluss noch einen Übertrag ("Archivieren (soon)").
 */
export async function closeFiscalYear(
    id: string,
    options: { user: string; carryOverOpenInvoices: boolean }
): Promise<{ ok: boolean; error?: string; carriedOver?: number }> {
    if (!ObjectId.isValid(id)) return { ok: false, error: "Ungültige Kennung." };

    const objectId = new ObjectId(id);
    const year = await fiscalYears().findOne({ _id: objectId });
    if (!year) return { ok: false, error: "Geschäftsjahr nicht gefunden." };
    if (year.status !== "active") {
        return { ok: false, error: "Dieses Geschäftsjahr ist bereits abgeschlossen." };
    }

    const open = await fiscalInvoices()
        .find({ fiscalYearId: objectId, status: { $in: ["open", "partial"] } })
        .toArray();

    let carriedOver = 0;

    if (open.length > 0) {
        if (!options.carryOverOpenInvoices) {
            return {
                ok: false,
                error: `Es gibt noch ${open.length} offene Posten. Übertrage sie ins Folgejahr oder gleiche sie aus.`
            };
        }

        const next = await fiscalYears().findOne({ year: year.year + 1 });
        if (!next?._id) {
            return {
                ok: false,
                error: `Für den Übertrag muss zuerst das Geschäftsjahr ${year.year + 1} angelegt werden.`
            };
        }

        // Offene Restbeträge als neue Rechnung im Folgejahr anlegen.
        for (const invoice of open) {
            const rest = invoice.amount - invoice.paidAmount;
            if (rest <= 0) continue;

            await fiscalInvoices().insertOne({
                fiscalYearId: next._id,
                memberId: invoice.memberId ?? null,
                member: invoice.member,
                kind: invoice.kind,
                amount: rest,
                paidAmount: 0,
                date: new Date(),
                dueDate: null,
                note: `Übertrag aus ${year.year}`,
                orderId: invoice.orderId ?? null,
                status: "open",
                createdBy: options.user,
                createdAt: new Date()
            });

            await fiscalInvoices().updateOne(
                { _id: invoice._id },
                {
                    $set: {
                        status: "cancelled",
                        note: `${invoice.note ?? ""} (übertragen nach ${year.year + 1})`.trim(),
                        updatedAt: new Date()
                    }
                }
            );

            carriedOver += 1;
        }
    }

    const balance = await calculateBalance(objectId);

    await fiscalYears().updateOne(
        { _id: objectId },
        { $set: { status: "closed", closedAt: new Date(), updatedAt: new Date() } }
    );

    // Saldo als Anfangsbestand ins Folgejahr übernehmen, sofern vorhanden.
    const next = await fiscalYears().findOne({ year: year.year + 1 });
    if (next?._id) {
        await fiscalYears().updateOne(
            { _id: next._id },
            { $set: { openingBalance: (year.openingBalance ?? 0) + balance } }
        );
    }

    await financeLogs().insertOne({
        fiscalYearId: objectId,
        entity: "fiscalYear",
        entityId: id,
        action: "archive",
        user: options.user,
        createdAt: new Date()
    });

    return { ok: true, carriedOver };
}

export async function archiveFiscalYear(id: string, user: string): Promise<boolean> {
    if (!ObjectId.isValid(id)) return false;

    const objectId = new ObjectId(id);
    const result = await fiscalYears().updateOne(
        { _id: objectId },
        { $set: { status: "archived" as FiscalYearStatus, updatedAt: new Date() } }
    );

    if (result.matchedCount > 0) {
        await financeLogs().insertOne({
            fiscalYearId: objectId,
            entity: "fiscalYear",
            entityId: id,
            action: "archive",
            user,
            createdAt: new Date()
        });
    }

    return result.matchedCount > 0;
}

/** Einnahmen minus Ausgaben eines Jahres. */
async function calculateBalance(fiscalYearId: ObjectId): Promise<Cents> {
    const rows = await fiscalTransactions()
        .aggregate<{ _id: string; total: number }>([
            { $match: { fiscalYearId } },
            { $group: { _id: "$direction", total: { $sum: "$amount" } } }
        ])
        .toArray();

    const income = rows.find((row) => row._id === "in")?.total ?? 0;
    const expense = rows.find((row) => row._id === "out")?.total ?? 0;
    return income - expense;
}

/**
 * Kennzahlen aller Jahre in EINER Abfrage je Collection.
 *
 * Vorher wurde erst die Liste geladen und anschließend für JEDES Jahr das
 * vollständige Dokument ein zweites Mal geholt -- inklusive aller Buchungen
 * und Rechnungen, nur um vier Zahlen anzuzeigen.
 */
export async function getYearSummaries(): Promise<YearSummary[]> {
    const [years, txRows, invRows] = await Promise.all([
        fiscalYears().find().sort({ year: -1 }).toArray(),
        fiscalTransactions()
            .aggregate<{ _id: { year: ObjectId; direction: string }; total: number; count: number }>([
                {
                    $group: {
                        _id: { year: "$fiscalYearId", direction: "$direction" },
                        total: { $sum: "$amount" },
                        count: { $sum: 1 }
                    }
                }
            ])
            .toArray(),
        fiscalInvoices()
            .aggregate<{ _id: ObjectId; total: number; count: number }>([
                { $match: { status: { $in: ["open", "partial"] } } },
                {
                    $group: {
                        _id: "$fiscalYearId",
                        total: { $sum: { $subtract: ["$amount", "$paidAmount"] } },
                        count: { $sum: 1 }
                    }
                }
            ])
            .toArray()
    ]);

    return years.map((year) => {
        const id = year._id!.toString();
        const income = txRows.find((r) => r._id.year.toString() === id && r._id.direction === "in");
        const expense = txRows.find((r) => r._id.year.toString() === id && r._id.direction === "out");
        const outstanding = invRows.find((r) => r._id.toString() === id);

        return {
            id,
            year: year.year,
            status: year.status,
            income: income?.total ?? 0,
            expense: expense?.total ?? 0,
            balance: (income?.total ?? 0) - (expense?.total ?? 0),
            outstanding: outstanding?.total ?? 0,
            outstandingCount: outstanding?.count ?? 0,
            transactionCount: (income?.count ?? 0) + (expense?.count ?? 0)
        };
    });
}
