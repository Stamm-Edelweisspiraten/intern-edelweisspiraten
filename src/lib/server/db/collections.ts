import type { Collection, ObjectId } from "mongodb";
import { db } from "$lib/server/mongo";
import type { Cents } from "$lib/money";
import type { OrderStatus, PaymentStatus } from "$lib/kaemmerer/orderStatus";

/**
 * Zentrale Registry aller MongoDB-Collections mit Dokumenttypen.
 *
 * Vorher war `db` als `any` typisiert -- die gesamte Datenschicht damit
 * ungetypt. Alle neuen und angefassten Zugriffe laufen ueber diese Accessoren.
 */

export const COLLECTIONS = {
    users: "users",
    sessions: "sessions",
    roles: "roles",
    passwordResetTokens: "passwordResetTokens",
    loginAttempts: "loginAttempts",
    members: "members",
    memberLogs: "memberLogs",
    groups: "groups",
    positions: "positions",
    settings: "settings",
    fiscalYears: "fiscal_years",
    fiscalTransactions: "fiscal_transactions",
    fiscalInvoices: "fiscal_invoices",
    financeLogs: "financeLogs",
    kaemmererArticles: "kaemmerer_articles",
    kaemmererOrders: "kaemmerer_orders"
} as const;

// ---------------------------------------------------------------------------
// Benutzer, Rollen, Sitzungen
// ---------------------------------------------------------------------------

export type UserStatus = "active" | "disabled" | "invited";

export interface UserMfa {
    enabled: boolean;
    /** TOTP-Secret, verschluesselt abgelegt (siehe $lib/server/auth/totp). */
    secret?: string;
    /** Gehashte Wiederherstellungscodes -- nie im Klartext gespeichert. */
    recoveryCodes?: string[];
    confirmedAt?: Date;
}

export interface UserDoc {
    _id?: ObjectId;
    name: string;
    /** Immer klein geschrieben gespeichert; eindeutiger Index. */
    email: string;
    passwordHash: string;
    passwordChangedAt?: Date;
    status: UserStatus;
    type: "parent" | "child";
    roleIds: ObjectId[];
    memberIds: string[];
    mfa?: UserMfa;
    failedLoginAttempts?: number;
    lockedUntil?: Date | null;
    lastLoginAt?: Date;
    createdAt: Date;
    updatedAt?: Date;
}

export interface SessionImpersonation {
    originalUserId: ObjectId;
    originalUserName: string;
    originalUserEmail: string;
    startedAt: Date;
}

export interface SessionDoc {
    _id?: ObjectId;
    /**
     * sha256 des Cookie-Tokens. Der Rohwert steht ausschliesslich im Cookie --
     * ein Lesezugriff auf die Datenbank erlaubt damit keine Sitzungsuebernahme.
     */
    tokenHash: string;
    /** Effektiver Benutzer; waehrend einer Impersonation der Zielbenutzer. */
    userId: ObjectId;
    createdAt: Date;
    lastSeenAt: Date;
    /** Gleitendes Ablaufdatum (TTL-Index). */
    expiresAt: Date;
    /** Harte Obergrenze; die gleitende Verlaengerung darf sie nicht ueberschreiten. */
    absoluteExpiresAt: Date;
    userAgent?: string | null;
    device?: string | null;
    ip?: string | null;
    revokedAt?: Date | null;
    /** Erst true, wenn der zweite Faktor bestaetigt wurde. */
    mfaSatisfied: boolean;
    /** Gesetzt, solange diese Sitzung eine Impersonation ist. */
    impersonation?: SessionImpersonation | null;
}

export interface RoleDoc {
    _id?: ObjectId;
    key: string;
    name: string;
    description?: string;
    permissions: string[];
    /** Systemrollen koennen nicht geloescht werden. */
    system?: boolean;
    createdAt: Date;
    updatedAt?: Date;
}

export interface PasswordResetTokenDoc {
    _id?: ObjectId;
    tokenHash: string;
    userId: ObjectId;
    createdAt: Date;
    expiresAt: Date;
    usedAt?: Date | null;
}

export interface LoginAttemptDoc {
    _id?: ObjectId;
    /** Beispiele: "ip:1.2.3.4", "user:<id>", "invite:<memberId>". */
    key: string;
    count: number;
    firstAt: Date;
    lastAt: Date;
    expiresAt: Date;
}

// ---------------------------------------------------------------------------
// Finanzen
// ---------------------------------------------------------------------------

export type FiscalYearStatus = "active" | "archived";
export type InvoiceStatus = "open" | "partial" | "paid" | "cancelled";
export type TransactionDirection = "in" | "out";

export interface DuesDoc {
    stamm: Cents;
    gau: Cents;
    landesmark: Cents;
    bund: Cents;
}

export interface FiscalYearDoc {
    _id?: ObjectId;
    year: number;
    dues: DuesDoc;
    status: FiscalYearStatus;
    openingBalance?: Cents;
    closedAt?: Date | null;
    createdAt: Date;
    updatedAt?: Date;
}

export interface FiscalTransactionDoc {
    _id?: ObjectId;
    fiscalYearId: ObjectId;
    invoiceId?: ObjectId | null;
    memberId?: string | null;
    /** Denormalisierter Anzeigename, damit Listen ohne Join auskommen. */
    member?: string;
    date: Date;
    direction: TransactionDirection;
    kind: string;
    amount: Cents;
    note?: string;
    receiptFileId?: string | null;
    createdBy?: string;
    createdAt: Date;
    updatedAt?: Date;
}

export interface FiscalInvoiceDoc {
    _id?: ObjectId;
    fiscalYearId: ObjectId;
    memberId?: string | null;
    member?: string;
    kind: string;
    amount: Cents;
    paidAmount: Cents;
    date: Date;
    dueDate?: Date | null;
    note?: string;
    orderId?: ObjectId | null;
    status: InvoiceStatus;
    remindedAt?: Date | null;
    createdBy?: string;
    createdAt: Date;
    updatedAt?: Date;
}

export interface FinanceLogDoc {
    _id?: ObjectId;
    fiscalYearId?: ObjectId;
    entity: "transaction" | "invoice" | "fiscalYear";
    entityId?: string;
    action: "create" | "update" | "delete" | "pay" | "cancel" | "archive";
    changes?: { field: string; before: unknown; after: unknown }[];
    user: string;
    createdAt: Date;
}

// ---------------------------------------------------------------------------
// Kaemmerer
// ---------------------------------------------------------------------------

export interface ArticleSizeDoc {
    name: string;
    price: Cents;
    stock: number;
    minStock: number;
    orderUrl?: string;
}

export interface ArticleDoc {
    _id?: ObjectId;
    name: string;
    description?: string;
    price: Cents;
    sizes: ArticleSizeDoc[];
    /** Bei Artikeln mit Groessen abgeleitet (Summe der Groessenbestaende). */
    stock: number;
    minStock: number;
    active: boolean;
    orderUrl?: string;
    createdAt: Date;
    updatedAt?: Date;
}

export interface OrderItemDoc {
    articleId?: string;
    name: string;
    /** Serverseitig aus dem Artikel aufgeloest, nie aus dem Formular uebernommen. */
    price: Cents;
    size?: string;
    quantity: number;
    total: Cents;
    received: boolean;
    /** Gesetzt, sobald der Lagerabgang gebucht wurde. */
    stockBooked?: boolean;
}

export interface OrderDoc {
    _id?: ObjectId;
    number: string;
    items: OrderItemDoc[];
    members: { id: string; name: string }[];
    memberIds: string[];
    invoiceIds: string[];
    total: Cents;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    cancelledAt?: Date | null;
    createdBy?: string;
    createdByName?: string;
    createdAt: Date;
    updatedAt?: Date;
}

// ---------------------------------------------------------------------------
// Einstellungen
// ---------------------------------------------------------------------------

export interface SettingsDoc {
    _id: string;
    contributions?: DuesDoc;
    bank?: {
        accountHolder?: string;
        iban?: string;
        bic?: string;
        creditorId?: string;
    };
    updatedAt?: string;
    updatedBy?: string;
}

// ---------------------------------------------------------------------------
// Typisierte Accessoren
// ---------------------------------------------------------------------------

export const users = (): Collection<UserDoc> => db.collection<UserDoc>(COLLECTIONS.users);
export const sessions = (): Collection<SessionDoc> => db.collection<SessionDoc>(COLLECTIONS.sessions);
export const roles = (): Collection<RoleDoc> => db.collection<RoleDoc>(COLLECTIONS.roles);
export const passwordResetTokens = (): Collection<PasswordResetTokenDoc> =>
    db.collection<PasswordResetTokenDoc>(COLLECTIONS.passwordResetTokens);
export const loginAttempts = (): Collection<LoginAttemptDoc> =>
    db.collection<LoginAttemptDoc>(COLLECTIONS.loginAttempts);

export const fiscalYears = (): Collection<FiscalYearDoc> =>
    db.collection<FiscalYearDoc>(COLLECTIONS.fiscalYears);
export const fiscalTransactions = (): Collection<FiscalTransactionDoc> =>
    db.collection<FiscalTransactionDoc>(COLLECTIONS.fiscalTransactions);
export const fiscalInvoices = (): Collection<FiscalInvoiceDoc> =>
    db.collection<FiscalInvoiceDoc>(COLLECTIONS.fiscalInvoices);
export const financeLogs = (): Collection<FinanceLogDoc> =>
    db.collection<FinanceLogDoc>(COLLECTIONS.financeLogs);

export const articles = (): Collection<ArticleDoc> =>
    db.collection<ArticleDoc>(COLLECTIONS.kaemmererArticles);
export const orders = (): Collection<OrderDoc> => db.collection<OrderDoc>(COLLECTIONS.kaemmererOrders);

export const settings = (): Collection<SettingsDoc> => db.collection<SettingsDoc>(COLLECTIONS.settings);
