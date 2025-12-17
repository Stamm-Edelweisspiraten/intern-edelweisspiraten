import { db } from "$lib/server/mongo";
import { ObjectId } from "mongodb";

export type Money = number;

export interface Dues {
    stamm: Money;
    gau: Money;
    landesmark: Money;
    bund: Money;
}

export type TransactionDirection = "in" | "out";
export type TransactionStatus = "pending" | "paid";
export type InvoiceStatus = "pending" | "paid" | "cancelled";

export interface FiscalTransaction {
    id?: string;
    memberId?: string;
    member: string;
    invoiceId?: string;
    date: string;                 // ISO string
    direction: TransactionDirection;
    kind: string;                 // e.g. dues, donation, equipment
    amount: Money;
    note?: string;
    status?: TransactionStatus;   // e.g. paid, pending
}

export interface FiscalInvoice {
    id?: string;
    memberId?: string;
    member: string;
    kind: string;         // e.g. Jahresbeitrag, Pfadverlag, Lager/Aktion
    amount: Money;
    date: string;         // issue date
    dueDate?: string;
    note?: string;
    orderId?: string;     // optional: zugehoerige Bestellung (kaemmerer)
    status: InvoiceStatus;
}

export type FiscalYearStatus = "active" | "archived";

export interface FiscalYear {
    id?: string;
    year: number;
    dues: Dues;
    transactions: FiscalTransaction[];
    invoices?: FiscalInvoice[];
    status?: FiscalYearStatus;
    createdAt?: string;
    updatedAt?: string;
}

export interface FiscalYearSummary {
    id: string;
    year: number;
    dues: Dues;
    transactionCount: number;
    status?: FiscalYearStatus;
    createdAt?: string;
    updatedAt?: string;
}

const COLLECTION = "fiscal_years";

const normalizeDues = (dues: Partial<Dues> = {}): Dues => ({
    stamm: Number(dues.stamm) || 0,
    gau: Number(dues.gau) || 0,
    landesmark: Number(dues.landesmark) || 0,
    bund: Number(dues.bund) || 0
});

const ensureTransactionIds = (transactions: FiscalTransaction[] = []): FiscalTransaction[] =>
    transactions.map((t) => ({
        ...t,
        id: t.id ?? new ObjectId().toString(),
        status: t.status ?? "paid"
    }));

const ensureInvoiceIds = (invoices: FiscalInvoice[] = []): FiscalInvoice[] =>
    invoices.map((i) => ({
        ...i,
        id: i.id ?? new ObjectId().toString(),
        status: i.status ?? "pending",
        orderId: i.orderId
    }));

const mapDocToFiscalYear = (doc: any): FiscalYear => ({
    id: doc._id.toString(),
    year: Number(doc.year),
    dues: normalizeDues(doc.dues),
    transactions: ensureTransactionIds(doc.transactions ?? []),
    invoices: ensureInvoiceIds(doc.invoices ?? []),
    status: (doc.status as FiscalYearStatus) ?? "active",
    createdAt: doc.createdAt?.toISOString?.() ?? doc.createdAt,
    updatedAt: doc.updatedAt?.toISOString?.() ?? doc.updatedAt
});

const editableYearFilter = (id: string) => ({
    _id: new ObjectId(id),
    status: { $ne: "archived" }
});

// Create a fiscal year with optional seed transactions
export async function createFiscalYear(payload: {
    year: number;
    dues: Dues;
    transactions?: FiscalTransaction[];
    status?: FiscalYearStatus;
}) {
    const now = new Date();
    const transactions = ensureTransactionIds(payload.transactions ?? []);
    const status: FiscalYearStatus = payload.status ?? "active";

    const res = await db.collection(COLLECTION).insertOne({
        year: payload.year,
        dues: normalizeDues(payload.dues),
        transactions,
        status,
        createdAt: now,
        updatedAt: now
    });

    return {
        id: res.insertedId.toString(),
        year: payload.year,
        dues: normalizeDues(payload.dues),
        transactions,
        status,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
    } as FiscalYear;
}

// List all fiscal years with summary info
export async function listFiscalYears(): Promise<FiscalYearSummary[]> {
    const docs = await db
        .collection(COLLECTION)
        .find({})
        .sort({ year: -1 })
        .toArray();

    return docs.map((doc) => ({
        id: doc._id.toString(),
        year: Number(doc.year),
        dues: normalizeDues(doc.dues),
        transactionCount: Array.isArray(doc.transactions) ? doc.transactions.length : 0,
        status: (doc.status as FiscalYearStatus) ?? "active",
        createdAt: doc.createdAt?.toISOString?.() ?? doc.createdAt,
        updatedAt: doc.updatedAt?.toISOString?.() ?? doc.updatedAt
    }));
}

// Get one fiscal year with all transactions
export async function getFiscalYear(id: string): Promise<FiscalYear | null> {
    const doc = await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
    if (!doc) return null;
    return mapDocToFiscalYear(doc);
}

// Update year and dues; optionally replace transactions
export async function updateFiscalYear(
    id: string,
    data: {
        year?: number;
        dues?: Partial<Dues>;
        transactions?: FiscalTransaction[];
        invoices?: FiscalInvoice[];
        status?: FiscalYearStatus;
    }
): Promise<boolean> {
    const update: Record<string, any> = {
        updatedAt: new Date()
    };

    if (data.year !== undefined) update.year = data.year;
    if (data.dues) update.dues = normalizeDues(data.dues);
    if (data.transactions) update.transactions = ensureTransactionIds(data.transactions);
    if (data.invoices) update.invoices = ensureInvoiceIds(data.invoices);
    if (data.status) update.status = data.status;

    const res = await db.collection(COLLECTION).updateOne(
        { _id: new ObjectId(id) },
        { $set: update }
    );

    return res.matchedCount > 0;
}

// Append a single transaction to a fiscal year
export async function addTransaction(
    fiscalYearId: string,
    tx: FiscalTransaction
): Promise<FiscalTransaction | null> {
    const withId = { ...tx, id: tx.id ?? new ObjectId().toString(), status: tx.status ?? "pending" };

    const res = await db.collection(COLLECTION).updateOne(
        editableYearFilter(fiscalYearId),
        { $push: { transactions: withId }, $set: { updatedAt: new Date() } }
    );

    if (res.matchedCount === 0) return null;
    return withId;
}

// Remove a transaction by id
export async function removeTransaction(fiscalYearId: string, transactionId: string): Promise<boolean> {
    const res = await db.collection(COLLECTION).updateOne(
        editableYearFilter(fiscalYearId),
        { $pull: { transactions: { id: transactionId } }, $set: { updatedAt: new Date() } }
    );
    return res.modifiedCount > 0;
}

// Update an existing transaction (amount/date/note/direction/kind/member/memberId)
export async function updateTransaction(
    fiscalYearId: string,
    transactionId: string,
    data: Partial<FiscalTransaction>
): Promise<boolean> {
    const setFields: Record<string, any> = { updatedAt: new Date() };
    const prefix = "transactions.$.";

    if (data.amount !== undefined) setFields[prefix + "amount"] = data.amount;
    if (data.date !== undefined) setFields[prefix + "date"] = data.date;
    if (data.note !== undefined) setFields[prefix + "note"] = data.note;
    if (data.direction !== undefined) setFields[prefix + "direction"] = data.direction;
    if (data.kind !== undefined) setFields[prefix + "kind"] = data.kind;
    if (data.member !== undefined) setFields[prefix + "member"] = data.member;
    if (data.memberId !== undefined) setFields[prefix + "memberId"] = data.memberId;
    if (data.status !== undefined) setFields[prefix + "status"] = data.status;
    if (data.invoiceId !== undefined) setFields[prefix + "invoiceId"] = data.invoiceId;

    const res = await db.collection(COLLECTION).updateOne(
        { ...editableYearFilter(fiscalYearId), "transactions.id": transactionId },
        { $set: setFields }
    );
    return res.matchedCount > 0 && res.modifiedCount > 0;
}

// Set status to archived
export async function archiveFiscalYear(id: string): Promise<boolean> {
    const res = await db.collection(COLLECTION).updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "archived", updatedAt: new Date() } }
    );
    return res.matchedCount > 0;
}

// ---------------------------------------------
// Helper: Beitrag pro Mitglied berechnen
// ---------------------------------------------
export function calculateMemberDues(dues: Dues, member: any) {
    const sumAll = dues.stamm + dues.gau + dues.landesmark + dues.bund;
    const isSecondMember = !!member?.isSecondMember;
    const flags = member?.contributionDues ?? { stamm: true, gau: true, landesmark: true, bund: true };

    const payableParts = {
        stamm: flags.stamm ? dues.stamm : 0,
        gau: flags.gau ? dues.gau : 0,
        landesmark: flags.landesmark ? dues.landesmark : 0,
        bund: flags.bund ? dues.bund : 0
    };

    const payable = isSecondMember
        ? payableParts.stamm + payableParts.gau + payableParts.landesmark + payableParts.bund
        : sumAll;

    return { payable, payableParts };
}

// ---------------------------------------------
// Helper: aktives Geschäftsjahr holen
// ---------------------------------------------
export async function getActiveFiscalYear(): Promise<FiscalYear | null> {
    const currentYear = new Date().getFullYear();

    // 1) Bevorzugt das laufende Jahr, falls aktiv
    const current = await db.collection(COLLECTION)
        .find({ status: "active", year: currentYear })
        .sort({ updatedAt: -1 })
        .limit(1)
        .next();
    if (current) return mapDocToFiscalYear(current);

    // 2) Fallback: neuestes aktives Jahr
    const latest = await db.collection(COLLECTION)
        .find({ status: "active" })
        .sort({ year: -1 })
        .limit(1)
        .next();

    if (!latest) return null;
    return mapDocToFiscalYear(latest);
}

// ---------------------------------------------
// Yearly dues pro Mitglied erstellen/aktualisieren
// ---------------------------------------------
export async function upsertMemberDueForYear(
    fiscalYearId: string,
    member: any,
    duesOverride?: Dues
) {
    const fiscalYear = await getFiscalYear(fiscalYearId);
    if (!fiscalYear) return;

    const dues = duesOverride ? normalizeDues(duesOverride) : fiscalYear.dues;
    const memberId = member?._id?.toString?.() ?? member?.id ?? "";
    if (!memberId) return;

    const { payable } = calculateMemberDues(dues, member);
    const memberName = `${member.firstname ?? ""} ${member.lastname ?? ""}`.trim() || "Unbekannt";

    const paymentsTotal = (fiscalYear.transactions ?? [])
        .filter((tx) => tx.kind === "Jahresbeitrag" && tx.memberId === memberId && tx.status !== "pending")
        .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);

    const status: TransactionStatus = paymentsTotal >= payable ? "paid" : "pending";

    const existingDue = (fiscalYear.transactions ?? []).find(
        (tx) => tx.kind === "Jahresbeitrag" && tx.memberId === memberId && tx.direction === "in"
    );

    if (existingDue) {
        await updateTransaction(fiscalYearId, existingDue.id!, {
            amount: payable,
            status,
            member: memberName,
            memberId
        });
    } else {
        await addTransaction(fiscalYearId, {
            memberId,
            member: memberName,
            date: new Date().toISOString(),
            direction: "in",
            kind: "Jahresbeitrag",
            amount: payable,
            status,
            note: "Automatisch erstellt"
        });
    }
}

export async function seedYearlyDuesForMembers(fiscalYearId: string, members: any[], dues: Dues) {
    for (const member of members) {
        await upsertMemberDueForYear(fiscalYearId, member, dues);
    }
}

export async function removeMemberTransactions(memberId: string) {
    await db.collection(COLLECTION).updateMany(
        {},
        { $pull: { transactions: { memberId } }, $set: { updatedAt: new Date() } }
    );
}

// ---------------------------------------------
// Invoices
// ---------------------------------------------
export async function addInvoice(
    fiscalYearId: string,
    invoice: Omit<FiscalInvoice, "id" | "status"> & { status?: InvoiceStatus }
) {
    const payload: FiscalInvoice = {
        ...invoice,
        id: invoice.id ?? new ObjectId().toString(),
        status: invoice.status ?? "pending",
        orderId: invoice.orderId
    };

    const res = await db.collection(COLLECTION).updateOne(
        editableYearFilter(fiscalYearId),
        { $push: { invoices: payload }, $set: { updatedAt: new Date() } }
    );

    if (res.matchedCount === 0) return null;
    return payload;
}

export async function updateInvoice(
    fiscalYearId: string,
    invoiceId: string,
    data: Partial<FiscalInvoice>
) {
    const prefix = "invoices.$.";
    const setFields: Record<string, any> = { updatedAt: new Date() };

    if (data.amount !== undefined) setFields[prefix + "amount"] = data.amount;
    if (data.kind !== undefined) setFields[prefix + "kind"] = data.kind;
    if (data.note !== undefined) setFields[prefix + "note"] = data.note;
    if (data.member !== undefined) setFields[prefix + "member"] = data.member;
    if (data.memberId !== undefined) setFields[prefix + "memberId"] = data.memberId;
    if (data.status !== undefined) setFields[prefix + "status"] = data.status;
    if (data.date !== undefined) setFields[prefix + "date"] = data.date;
    if (data.dueDate !== undefined) setFields[prefix + "dueDate"] = data.dueDate;
    if (data.orderId !== undefined) setFields[prefix + "orderId"] = data.orderId;

    const res = await db.collection(COLLECTION).updateOne(
        { ...editableYearFilter(fiscalYearId), "invoices.id": invoiceId },
        { $set: setFields }
    );

    if (res.matchedCount > 0 && data.status) {
        // Sync kaemmerer order payment status, if module is available
        try {
            const mod = await import("$lib/server/kaemmererService");
            if (typeof mod.syncOrderPaymentForInvoice === "function") {
                await mod.syncOrderPaymentForInvoice(invoiceId);
            }
        } catch (err) {
            console.error("Could not sync kaemmerer order payment", err);
        }
    }

    return res.matchedCount > 0;
}
