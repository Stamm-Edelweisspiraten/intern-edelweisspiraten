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

export interface FiscalTransaction {
    id?: string;
    memberId?: string;
    member: string;
    date: string;                 // ISO string
    direction: TransactionDirection;
    kind: string;                 // e.g. dues, donation, equipment
    amount: Money;
    note?: string;
}

export type FiscalYearStatus = "active" | "archived";

export interface FiscalYear {
    id?: string;
    year: number;
    dues: Dues;
    transactions: FiscalTransaction[];
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
        id: t.id ?? new ObjectId().toString()
    }));

const mapDocToFiscalYear = (doc: any): FiscalYear => ({
    id: doc._id.toString(),
    year: Number(doc.year),
    dues: normalizeDues(doc.dues),
    transactions: ensureTransactionIds(doc.transactions ?? []),
    status: (doc.status as FiscalYearStatus) ?? "active",
    createdAt: doc.createdAt?.toISOString?.() ?? doc.createdAt,
    updatedAt: doc.updatedAt?.toISOString?.() ?? doc.updatedAt
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
        status?: FiscalYearStatus;
    }
): Promise<boolean> {
    const update: Record<string, any> = {
        updatedAt: new Date()
    };

    if (data.year !== undefined) update.year = data.year;
    if (data.dues) update.dues = normalizeDues(data.dues);
    if (data.transactions) update.transactions = ensureTransactionIds(data.transactions);
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
    const withId = { ...tx, id: tx.id ?? new ObjectId().toString() };

    const res = await db.collection(COLLECTION).updateOne(
        { _id: new ObjectId(fiscalYearId) },
        { $push: { transactions: withId }, $set: { updatedAt: new Date() } }
    );

    if (res.matchedCount === 0) return null;
    return withId;
}

// Remove a transaction by id
export async function removeTransaction(fiscalYearId: string, transactionId: string): Promise<boolean> {
    const res = await db.collection(COLLECTION).updateOne(
        { _id: new ObjectId(fiscalYearId) },
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

    const res = await db.collection(COLLECTION).updateOne(
        { _id: new ObjectId(fiscalYearId), "transactions.id": transactionId },
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
