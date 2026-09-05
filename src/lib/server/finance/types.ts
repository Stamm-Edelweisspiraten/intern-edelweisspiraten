import type { Cents } from "$lib/money";

/**
 * Fachliche Typen der Kasse -- bewusst ohne Importe aus anderen Services,
 * damit der zirkulaere Import zwischen Kasse und Kaemmerer aufgeloest bleibt.
 */

export type FiscalYearStatus = "active" | "closed" | "archived";
export type InvoiceStatus = "open" | "partial" | "paid" | "cancelled";
export type TransactionDirection = "in" | "out";
export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";
export type AccountSphere =
    | "ideell"
    | "vermoegensverwaltung"
    | "zweckbetrieb"
    | "wirtschaftlich"
    | "neutral";
export type JournalSource =
    | "manual"
    | "invoice"
    | "payment"
    | "order"
    | "recurring"
    | "import"
    | "opening"
    | "closing";

/**
 * Buchungsarten, mit denen der mitgelieferte Kontenrahmen vorbelegt wird.
 *
 * Frueher war das ein fester Enum, gegen den Geschaeftslogik ueber
 * Zeichenkettenvergleiche lief. Die Liste ist jetzt nur noch die Vorbelegung
 * fuer die Tabelle booking_categories -- ein Stamm kann eigene Arten anlegen,
 * ohne dass der Quelltext angefasst wird.
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

/**
 * Diese beiden Arten traegt die Geschaeftslogik: Jahresbeitraege duerfen je
 * Mitglied und Jahr nur einmal entstehen, Bestellungen haengen an einer
 * Bestellnummer. Sie bleiben deshalb Konstanten.
 */
export const KIND_DUES = "Jahresbeitrag";
export const KIND_ORDER = "Bestellung";

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

export interface AccountView {
    id: string;
    number: string;
    name: string;
    type: AccountType;
    sphere: AccountSphere;
    parentId: string | null;
    description: string;
    active: boolean;
    isBank: boolean;
    system: boolean;
}

export interface BookingCategoryView {
    id: string;
    name: string;
    direction: TransactionDirection;
    accountId: string;
    accountNumber: string;
    accountName: string;
    active: boolean;
    system: boolean;
}

export interface BankAccountView {
    id: string;
    name: string;
    accountId: string;
    accountNumber: string;
    accountHolder: string;
    iban: string;
    bic: string;
    bankName: string;
    isCash: boolean;
    openingBalance: Cents;
    active: boolean;
    /** Aus den Buchungszeilen berechnet, nicht gespeichert. */
    balance: Cents;
}

export interface JournalLineView {
    id: string;
    lineNo: number;
    accountId: string;
    accountNumber: string;
    accountName: string;
    debit: Cents;
    credit: Cents;
    memberId: string | null;
    memberName: string;
    bankAccountId: string | null;
    categoryId: string | null;
    note: string;
}

export interface JournalEntryView {
    id: string;
    entryNo: string;
    fiscalYearId: string;
    date: string;
    description: string;
    source: JournalSource;
    reversesId: string | null;
    reversedById: string | null;
    /** Summe der Sollseite; entspricht der Habenseite. */
    total: Cents;
    createdBy: string;
    createdAt: string;
    lines: JournalLineView[];
}

/**
 * Ansicht einer Buchung in der einfachen Maske.
 *
 * Eine Buchung ist hier stets ein Buchungssatz mit genau zwei Zeilen: ein
 * Bestandskonto (Bank/Kasse) und ein Erfolgskonto. Richtung und Betrag
 * ergeben sich daraus.
 */
export interface TransactionView {
    id: string;
    entryNo: string;
    fiscalYearId: string;
    invoiceId: string | null;
    memberId: string | null;
    member: string;
    date: string;
    direction: TransactionDirection;
    /** Name der Buchungsart. */
    kind: string;
    categoryId: string | null;
    bankAccountId: string | null;
    bankAccountName: string;
    amount: Cents;
    note: string;
    source: JournalSource;
    reversed: boolean;
    createdBy: string;
    createdAt: string;
}

export interface InvoiceView {
    id: string;
    number: string;
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
    reminderLevel: number;
}

export interface PaymentView {
    id: string;
    invoiceId: string | null;
    billId: string | null;
    bankAccountId: string;
    bankAccountName: string;
    entryId: string | null;
    amount: Cents;
    date: string;
    note: string;
    reversed: boolean;
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

// ---------------------------------------------------------------------------
// Berichte
// ---------------------------------------------------------------------------

export interface ReportRow {
    accountId: string;
    number: string;
    name: string;
    sphere: AccountSphere;
    amount: Cents;
}

export interface ProfitAndLossReport {
    from: string;
    to: string;
    income: ReportRow[];
    expense: ReportRow[];
    incomeTotal: Cents;
    expenseTotal: Cents;
    result: Cents;
    /** Ergebnis je steuerlicher Sphaere. */
    bySphere: { sphere: AccountSphere; income: Cents; expense: Cents; result: Cents }[];
}

export interface BalanceSheetReport {
    at: string;
    assets: ReportRow[];
    liabilities: ReportRow[];
    equity: ReportRow[];
    assetsTotal: Cents;
    liabilitiesTotal: Cents;
    equityTotal: Cents;
    /** Jahresergebnis bis zum Stichtag; schliesst die Bilanz rechnerisch. */
    result: Cents;
}

export interface CashBookEntry {
    date: string;
    entryNo: string;
    description: string;
    counterAccount: string;
    income: Cents;
    expense: Cents;
    balance: Cents;
}

export interface CashBookReport {
    bankAccountId: string;
    bankAccountName: string;
    from: string;
    to: string;
    openingBalance: Cents;
    closingBalance: Cents;
    incomeTotal: Cents;
    expenseTotal: Cents;
    entries: CashBookEntry[];
}

export interface AccountLedgerEntry {
    date: string;
    entryNo: string;
    description: string;
    counterAccount: string;
    debit: Cents;
    credit: Cents;
    balance: Cents;
}

export interface AccountLedgerReport {
    account: AccountView;
    from: string;
    to: string;
    openingBalance: Cents;
    closingBalance: Cents;
    entries: AccountLedgerEntry[];
}

/**
 * Eine Zeile der Summen- und Saldenliste.
 *
 * Die Standarduebersicht einer Buchhaltung, die bisher fehlte: je Konto der
 * Anfangsbestand, die Bewegungen im Zeitraum (Soll und Haben getrennt) und
 * der Schlusssaldo.
 */
export interface TrialBalanceRow {
    accountId: string;
    number: string;
    name: string;
    type: AccountType;
    sphere: AccountSphere;
    /** Saldo vor dem Zeitraum, vorzeichenrichtig nach Kontoart. */
    opening: Cents;
    /** Bewegungen IM Zeitraum. */
    debit: Cents;
    credit: Cents;
    /** opening + Bewegungen, vorzeichenrichtig nach Kontoart. */
    closing: Cents;
}

export interface TrialBalanceReport {
    from: string;
    to: string;
    rows: TrialBalanceRow[];
    /**
     * Summen der Bewegungsspalten. Soll und Haben MUESSEN gleich sein --
     * andernfalls stimmt etwas mit den Buchungssaetzen nicht.
     */
    debitTotal: Cents;
    creditTotal: Cents;
    balanced: boolean;
}

/** Ein Monat der Monatsuebersicht. */
export interface MonthlyRow {
    /** JJJJ-MM. */
    month: string;
    label: string;
    income: Cents;
    expense: Cents;
    result: Cents;
}

export interface MonthlyReport {
    year: number;
    months: MonthlyRow[];
    incomeTotal: Cents;
    expenseTotal: Cents;
    result: Cents;
}

/** Faelligkeitsstaffel der offenen Forderungen. */
export interface AgingBucket {
    label: string;
    /** Untere Grenze in Tagen; -1 steht fuer "noch nicht faellig". */
    fromDays: number;
    amount: Cents;
    count: number;
}

export interface AgingReport {
    at: string;
    buckets: AgingBucket[];
    total: Cents;
    count: number;
}

/** Wird geworfen, wenn eine Bestellung ohne aktives Geschäftsjahr entsteht. */
export class NoActiveFiscalYearError extends Error {
    constructor() {
        super("Es ist kein aktives Geschäftsjahr vorhanden.");
        this.name = "NoActiveFiscalYearError";
    }
}

/** Wird geworfen, wenn noch kein Bank- oder Kassenkonto eingerichtet ist. */
export class NoBankAccountError extends Error {
    constructor() {
        super("Es ist kein Kassen- oder Bankkonto eingerichtet.");
        this.name = "NoBankAccountError";
    }
}
