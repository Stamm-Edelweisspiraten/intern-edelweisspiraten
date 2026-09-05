import type { Cents } from "$lib/money";

/**
 * Fachliche Typen der Kasse -- bewusst ohne Importe aus anderen Services,
 * damit der zirkulaere Import zwischen Kasse und Kaemmerer aufgeloest bleibt.
 */

export type FiscalYearStatus = "active" | "closed" | "archived";
export type InvoiceStatus = "open" | "partial" | "paid" | "cancelled";
export type TransactionDirection = "in" | "out";

/**
 * Buchungsarten als feste Liste. Vorher war das ein freies Textfeld, auf das
 * gleichzeitig Geschaeftslogik ueber Zeichenkettenvergleiche zugriff
 * ("Jahresbeitrag", "Bestellung") -- und die beiden Auswahllisten in der
 * Oberflaeche wichen voneinander ab.
 */
export const TRANSACTION_KINDS = [
    "Jahresbeitrag",
    "Bestellung",
    "Spende",
    "Öffentlichkeitsarbeit",
    "Lager/Aktion",
    "Pfadverlag",
    "Ausrüstung",
    "Sonstiges"
] as const;

export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

export const KIND_DUES: TransactionKind = "Jahresbeitrag";
export const KIND_ORDER: TransactionKind = "Bestellung";

export function isTransactionKind(value: unknown): value is TransactionKind {
    return typeof value === "string" && (TRANSACTION_KINDS as readonly string[]).includes(value);
}

/** Beitragsanteile eines Geschäftsjahres. */
export interface Dues {
    stamm: Cents;
    gau: Cents;
    landesmark: Cents;
    bund: Cents;
}

export interface FiscalYearView {
    id: string;
    year: number;
    dues: Dues;
    status: FiscalYearStatus;
    openingBalance: Cents;
    closedAt: string | null;
    createdAt: string;
}

export interface InvoiceView {
    id: string;
    fiscalYearId: string;
    memberId: string | null;
    member: string;
    kind: string;
    amount: Cents;
    paidAmount: Cents;
    /** amount - paidAmount, nie negativ. */
    outstanding: Cents;
    date: string;
    dueDate: string | null;
    note: string;
    orderId: string | null;
    status: InvoiceStatus;
    /** true, wenn dueDate in der Vergangenheit liegt und noch offen ist. */
    overdue: boolean;
}

export interface TransactionView {
    id: string;
    fiscalYearId: string;
    invoiceId: string | null;
    memberId: string | null;
    member: string;
    date: string;
    direction: TransactionDirection;
    kind: string;
    amount: Cents;
    note: string;
    receiptFileId: string | null;
    createdBy: string;
    createdAt: string;
}

export interface YearSummary {
    id: string;
    year: number;
    status: FiscalYearStatus;
    income: Cents;
    expense: Cents;
    balance: Cents;
    outstanding: Cents;
    outstandingCount: number;
    transactionCount: number;
}

/** Wird geworfen, wenn eine Bestellung ohne aktives Geschäftsjahr entsteht. */
export class NoActiveFiscalYearError extends Error {
    constructor() {
        super("Es ist kein aktives Geschäftsjahr vorhanden.");
        this.name = "NoActiveFiscalYearError";
    }
}
