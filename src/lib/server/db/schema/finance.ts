import { relations, sql } from "drizzle-orm";
import {
    boolean,
    check,
    date,
    index,
    integer,
    jsonb,
    pgEnum,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid
} from "drizzle-orm/pg-core";
import { files, members } from "./members";

/**
 * Kasse und Buchhaltung.
 *
 * Grundlegender Unterschied zur Altfassung: dort trug ein Feld `direction`
 * ("in"/"out") die Semantik und `kind` war ein fester Enum aus acht
 * Zeichenketten -- es gab weder Konten noch Belege noch Bankkonten. Jetzt
 * gilt doppelte Buchfuehrung: jede Buchung ist ein Buchungssatz
 * (journal_entries) aus mindestens zwei Zeilen (journal_lines), deren Soll-
 * und Habensummen uebereinstimmen muessen. Die Pruefung steckt in einem
 * aufgeschobenen Trigger, nicht in der Oberflaeche.
 *
 * Alle Betraege sind ganzzahlige Cents. `integer` reicht bis 21,4 Mio. EUR
 * je Zeile; Summen werden in SQL nach bigint gecastet.
 */

export const fiscalYearStatus = pgEnum("fiscal_year_status", ["active", "closed", "archived"]);
export const invoiceStatus = pgEnum("invoice_status", ["open", "partial", "paid", "cancelled"]);
export const accountType = pgEnum("account_type", [
    "asset",
    "liability",
    "equity",
    "income",
    "expense"
]);
/** Steuerliche Sphaeren eines gemeinnuetzigen Vereins. */
export const accountSphere = pgEnum("account_sphere", [
    "ideell",
    "vermoegensverwaltung",
    "zweckbetrieb",
    "wirtschaftlich",
    "neutral"
]);
export const journalSource = pgEnum("journal_source", [
    "manual",
    "invoice",
    "payment",
    "order",
    "recurring",
    "import",
    "opening",
    "closing"
]);
export const recurringInterval = pgEnum("recurring_interval", [
    "monthly",
    "quarterly",
    "semiannual",
    "annual"
]);
export const reconcileStatus = pgEnum("reconcile_status", ["open", "matched", "ignored"]);
export const attachmentTarget = pgEnum("attachment_target", ["entry", "invoice", "bill", "payment"]);
export const financeLogEntity = pgEnum("finance_log_entity", [
    "journalEntry",
    "invoice",
    "bill",
    "payment",
    "account",
    "fiscalYear",
    "recurring"
]);
export const financeLogAction = pgEnum("finance_log_action", [
    "create",
    "update",
    "delete",
    "pay",
    "cancel",
    "reverse",
    "archive",
    "close"
]);

// ---------------------------------------------------------------------------
// Geschaeftsjahre
// ---------------------------------------------------------------------------

export const fiscalYears = pgTable(
    "fiscal_years",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        year: integer("year").notNull(),
        /** Beitragssaetze des Jahres, in Cents. */
        duesStamm: integer("dues_stamm").notNull().default(0),
        duesGau: integer("dues_gau").notNull().default(0),
        duesLandesmark: integer("dues_landesmark").notNull().default(0),
        duesBund: integer("dues_bund").notNull().default(0),
        status: fiscalYearStatus("status").notNull().default("active"),
        openingBalance: integer("opening_balance").notNull().default(0),
        closedAt: timestamp("closed_at", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
    },
    (table) => [uniqueIndex("fiscal_years_year_unique").on(table.year)]
);

// ---------------------------------------------------------------------------
// Kontenplan
// ---------------------------------------------------------------------------

export const accounts = pgTable(
    "accounts",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        /** Kontonummer aus dem Vereins-Kontenrahmen, z. B. "4100". */
        number: text("number").notNull(),
        name: text("name").notNull(),
        type: accountType("type").notNull(),
        sphere: accountSphere("sphere").notNull().default("ideell"),
        parentId: uuid("parent_id"),
        description: text("description").notNull().default(""),
        active: boolean("active").notNull().default(true),
        /** true bei Konten, die ein Bank- oder Kassenkonto abbilden. */
        isBank: boolean("is_bank").notNull().default(false),
        /** Vom Kontenrahmen mitgeliefert; solche Konten sind nicht loeschbar. */
        system: boolean("system").notNull().default(false),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
    },
    (table) => [
        uniqueIndex("accounts_number_unique").on(table.number),
        index("accounts_type_idx").on(table.type)
    ]
);

/**
 * Kassen- und Bankkonten. Jedes zeigt auf genau ein Sachkonto der Klasse
 * "asset"; die Kontostaende werden nicht gespeichert, sondern aus den
 * Buchungszeilen dieses Sachkontos berechnet.
 */
export const bankAccounts = pgTable(
    "bank_accounts",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        name: text("name").notNull(),
        accountId: uuid("account_id")
            .notNull()
            .references(() => accounts.id, { onDelete: "restrict" }),
        accountHolder: text("account_holder").notNull().default(""),
        iban: text("iban").notNull().default(""),
        bic: text("bic").notNull().default(""),
        bankName: text("bank_name").notNull().default(""),
        /** true bei einer Barkasse ohne Bankverbindung. */
        isCash: boolean("is_cash").notNull().default(false),
        openingBalance: integer("opening_balance").notNull().default(0),
        active: boolean("active").notNull().default(true),
        sortOrder: integer("sort_order").notNull().default(0),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
    },
    (table) => [uniqueIndex("bank_accounts_account_unique").on(table.accountId)]
);

/**
 * Buchungsarten der einfachen Erfassungsmaske.
 *
 * Ersetzt den festen Enum TRANSACTION_KINDS. Jede Kategorie zeigt auf ein
 * Erfolgskonto; daraus entsteht die Gegenbuchung, ohne dass der Kassenwart
 * Soll und Haben kennen muss.
 */
export const bookingCategories = pgTable(
    "booking_categories",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        name: text("name").notNull(),
        /** "in" fuer Einnahmen, "out" fuer Ausgaben. */
        direction: text("direction").notNull(),
        accountId: uuid("account_id")
            .notNull()
            .references(() => accounts.id, { onDelete: "restrict" }),
        active: boolean("active").notNull().default(true),
        system: boolean("system").notNull().default(false),
        sortOrder: integer("sort_order").notNull().default(0),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [
        uniqueIndex("booking_categories_name_unique").on(table.name),
        check("booking_categories_direction_check", sql`${table.direction} in ('in', 'out')`)
    ]
);

/** Belegnummernkreise, je Geschaeftsjahr und Praefix. */
export const numberSequences = pgTable(
    "number_sequences",
    {
        /** z. B. "entry:2026", "invoice:2026". */
        key: text("key").primaryKey(),
        nextValue: integer("next_value").notNull().default(1)
    }
);

// ---------------------------------------------------------------------------
// Buchungssaetze
// ---------------------------------------------------------------------------

export const journalEntries = pgTable(
    "journal_entries",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        /** Fortlaufende Belegnummer im Geschaeftsjahr, z. B. "2026-0042". */
        entryNo: text("entry_no").notNull(),
        fiscalYearId: uuid("fiscal_year_id")
            .notNull()
            .references(() => fiscalYears.id, { onDelete: "restrict" }),
        date: date("date", { mode: "date" }).notNull(),
        description: text("description").notNull().default(""),
        source: journalSource("source").notNull().default("manual"),
        /** Gesetzt, wenn dieser Satz einen anderen storniert. */
        reversesId: uuid("reverses_id"),
        /** Gesetzt, sobald dieser Satz durch einen anderen storniert wurde. */
        reversedById: uuid("reversed_by_id"),
        createdBy: text("created_by").notNull().default("system"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
    },
    (table) => [
        uniqueIndex("journal_entries_no_unique").on(table.entryNo),
        index("journal_entries_year_idx").on(table.fiscalYearId, table.date),
        index("journal_entries_source_idx").on(table.source)
    ]
);

export const journalLines = pgTable(
    "journal_lines",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        entryId: uuid("entry_id")
            .notNull()
            .references(() => journalEntries.id, { onDelete: "cascade" }),
        lineNo: integer("line_no").notNull().default(1),
        accountId: uuid("account_id")
            .notNull()
            .references(() => accounts.id, { onDelete: "restrict" }),
        /** Genau eines von beiden ist groesser als 0. */
        debit: integer("debit").notNull().default(0),
        credit: integer("credit").notNull().default(0),
        /** Optionale Zuordnung zu Mitglied und Bankkonto fuer Auswertungen. */
        memberId: uuid("member_id").references(() => members.id, { onDelete: "set null" }),
        memberName: text("member_name"),
        bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, {
            onDelete: "set null"
        }),
        categoryId: uuid("category_id").references(() => bookingCategories.id, {
            onDelete: "set null"
        }),
        note: text("note").notNull().default("")
    },
    (table) => [
        index("journal_lines_entry_idx").on(table.entryId),
        index("journal_lines_account_idx").on(table.accountId),
        index("journal_lines_member_idx").on(table.memberId),
        index("journal_lines_bank_idx").on(table.bankAccountId),
        check("journal_lines_amounts_check", sql`${table.debit} >= 0 and ${table.credit} >= 0`),
        // Eine Zeile ist entweder Soll oder Haben, nie beides und nie keines.
        check(
            "journal_lines_side_check",
            sql`(${table.debit} = 0) <> (${table.credit} = 0)`
        )
    ]
);

// ---------------------------------------------------------------------------
// Forderungen und Verbindlichkeiten
// ---------------------------------------------------------------------------

export const invoices = pgTable(
    "invoices",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        number: text("number").notNull(),
        fiscalYearId: uuid("fiscal_year_id")
            .notNull()
            .references(() => fiscalYears.id, { onDelete: "restrict" }),
        memberId: uuid("member_id").references(() => members.id, { onDelete: "set null" }),
        /** Denormalisierter Anzeigename, damit Listen ohne Join auskommen. */
        memberName: text("member_name"),
        /** Buchungsart, z. B. "Jahresbeitrag" oder "Bestellung". */
        kind: text("kind").notNull().default("Sonstiges"),
        categoryId: uuid("category_id").references(() => bookingCategories.id, {
            onDelete: "set null"
        }),
        amount: integer("amount").notNull(),
        paidAmount: integer("paid_amount").notNull().default(0),
        date: date("date", { mode: "date" }).notNull(),
        dueDate: date("due_date", { mode: "date" }),
        note: text("note").notNull().default(""),
        status: invoiceStatus("status").notNull().default("open"),
        orderId: uuid("order_id"),
        /** Buchungssatz der Forderungsentstehung. */
        entryId: uuid("entry_id").references(() => journalEntries.id, { onDelete: "set null" }),
        remindedAt: timestamp("reminded_at", { withTimezone: true }),
        reminderLevel: integer("reminder_level").notNull().default(0),
        createdBy: text("created_by").notNull().default("system"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
    },
    (table) => [
        uniqueIndex("invoices_number_unique").on(table.number),
        index("invoices_year_status_idx").on(table.fiscalYearId, table.status),
        index("invoices_member_idx").on(table.memberId),
        index("invoices_order_idx").on(table.orderId),
        /**
         * Verhindert doppelte Jahresbeitraege je Mitglied und Jahr. In
         * MongoDB war das ein partieller eindeutiger Index.
         */
        uniqueIndex("invoices_year_member_kind_unique")
            .on(table.fiscalYearId, table.memberId, table.kind)
            .where(sql`member_id is not null`),
        check("invoices_amount_check", sql`${table.amount} > 0`),
        // Ueberzahlungsschutz -- vorher eine $expr-Bedingung mit manueller
        // Kompensation im Anwendungscode.
        check(
            "invoices_paid_check",
            sql`${table.paidAmount} >= 0 and ${table.paidAmount} <= ${table.amount}`
        )
    ]
);

export const invoiceItems = pgTable(
    "invoice_items",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        invoiceId: uuid("invoice_id")
            .notNull()
            .references(() => invoices.id, { onDelete: "cascade" }),
        position: integer("position").notNull().default(0),
        description: text("description").notNull(),
        quantity: integer("quantity").notNull().default(1),
        unitPrice: integer("unit_price").notNull(),
        total: integer("total").notNull(),
        accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" })
    },
    (table) => [index("invoice_items_invoice_idx").on(table.invoiceId)]
);

/** Eingangsrechnungen (Verbindlichkeiten). In der Altfassung nicht vorhanden. */
export const bills = pgTable(
    "bills",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        number: text("number").notNull(),
        fiscalYearId: uuid("fiscal_year_id")
            .notNull()
            .references(() => fiscalYears.id, { onDelete: "restrict" }),
        vendor: text("vendor").notNull(),
        kind: text("kind").notNull().default("Sonstiges"),
        categoryId: uuid("category_id").references(() => bookingCategories.id, {
            onDelete: "set null"
        }),
        amount: integer("amount").notNull(),
        paidAmount: integer("paid_amount").notNull().default(0),
        date: date("date", { mode: "date" }).notNull(),
        dueDate: date("due_date", { mode: "date" }),
        note: text("note").notNull().default(""),
        status: invoiceStatus("status").notNull().default("open"),
        entryId: uuid("entry_id").references(() => journalEntries.id, { onDelete: "set null" }),
        createdBy: text("created_by").notNull().default("system"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
    },
    (table) => [
        uniqueIndex("bills_number_unique").on(table.number),
        index("bills_year_status_idx").on(table.fiscalYearId, table.status),
        check("bills_amount_check", sql`${table.amount} > 0`),
        check(
            "bills_paid_check",
            sql`${table.paidAmount} >= 0 and ${table.paidAmount} <= ${table.amount}`
        )
    ]
);

/** Zahlung auf eine Forderung oder Verbindlichkeit. */
export const payments = pgTable(
    "payments",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "cascade" }),
        billId: uuid("bill_id").references(() => bills.id, { onDelete: "cascade" }),
        bankAccountId: uuid("bank_account_id")
            .notNull()
            .references(() => bankAccounts.id, { onDelete: "restrict" }),
        entryId: uuid("entry_id").references(() => journalEntries.id, { onDelete: "set null" }),
        amount: integer("amount").notNull(),
        date: date("date", { mode: "date" }).notNull(),
        note: text("note").notNull().default(""),
        reversedAt: timestamp("reversed_at", { withTimezone: true }),
        createdBy: text("created_by").notNull().default("system"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [
        index("payments_invoice_idx").on(table.invoiceId),
        index("payments_bill_idx").on(table.billId),
        check("payments_amount_check", sql`${table.amount} > 0`),
        // Eine Zahlung gehoert zu genau einer Seite.
        check(
            "payments_target_check",
            sql`(${table.invoiceId} is null) <> (${table.billId} is null)`
        )
    ]
);

// ---------------------------------------------------------------------------
// Wiederkehrende Buchungen
// ---------------------------------------------------------------------------

export const recurringSchedules = pgTable(
    "recurring_schedules",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        name: text("name").notNull(),
        interval: recurringInterval("interval").notNull().default("monthly"),
        amount: integer("amount").notNull(),
        categoryId: uuid("category_id")
            .notNull()
            .references(() => bookingCategories.id, { onDelete: "restrict" }),
        bankAccountId: uuid("bank_account_id")
            .notNull()
            .references(() => bankAccounts.id, { onDelete: "restrict" }),
        memberId: uuid("member_id").references(() => members.id, { onDelete: "set null" }),
        note: text("note").notNull().default(""),
        startDate: date("start_date", { mode: "date" }).notNull(),
        endDate: date("end_date", { mode: "date" }),
        nextRunAt: date("next_run_at", { mode: "date" }).notNull(),
        lastRunAt: timestamp("last_run_at", { withTimezone: true }),
        runCount: integer("run_count").notNull().default(0),
        active: boolean("active").notNull().default(true),
        createdBy: text("created_by").notNull().default("system"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [
        index("recurring_next_run_idx").on(table.active, table.nextRunAt),
        check("recurring_amount_check", sql`${table.amount} > 0`)
    ]
);

// ---------------------------------------------------------------------------
// Belege
// ---------------------------------------------------------------------------

export const attachments = pgTable(
    "attachments",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        target: attachmentTarget("target").notNull(),
        targetId: uuid("target_id").notNull(),
        fileId: uuid("file_id")
            .notNull()
            .references(() => files.id, { onDelete: "cascade" }),
        label: text("label").notNull().default(""),
        createdBy: text("created_by").notNull().default("system"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [index("attachments_target_idx").on(table.target, table.targetId)]
);

// ---------------------------------------------------------------------------
// Kontoauszug-Import und Abgleich
// ---------------------------------------------------------------------------

export const bankImports = pgTable(
    "bank_imports",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        bankAccountId: uuid("bank_account_id")
            .notNull()
            .references(() => bankAccounts.id, { onDelete: "cascade" }),
        filename: text("filename").notNull(),
        format: text("format").notNull().default("csv"),
        lineCount: integer("line_count").notNull().default(0),
        importedBy: text("imported_by").notNull().default("system"),
        importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [index("bank_imports_account_idx").on(table.bankAccountId)]
);

export const bankImportLines = pgTable(
    "bank_import_lines",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        importId: uuid("import_id")
            .notNull()
            .references(() => bankImports.id, { onDelete: "cascade" }),
        bankAccountId: uuid("bank_account_id")
            .notNull()
            .references(() => bankAccounts.id, { onDelete: "cascade" }),
        date: date("date", { mode: "date" }).notNull(),
        /** Vorzeichenbehaftet: positiv = Eingang, negativ = Ausgang. */
        amount: integer("amount").notNull(),
        counterparty: text("counterparty").notNull().default(""),
        reference: text("reference").notNull().default(""),
        /**
         * Eindeutigkeit innerhalb eines Kontos, damit derselbe Auszug nicht
         * zweimal eingelesen wird.
         */
        fingerprint: text("fingerprint").notNull(),
        status: reconcileStatus("status").notNull().default("open"),
        matchedEntryId: uuid("matched_entry_id").references(() => journalEntries.id, {
            onDelete: "set null"
        }),
        matchedAt: timestamp("matched_at", { withTimezone: true }),
        matchedBy: text("matched_by")
    },
    (table) => [
        uniqueIndex("bank_import_lines_fingerprint_unique").on(
            table.bankAccountId,
            table.fingerprint
        ),
        index("bank_import_lines_status_idx").on(table.bankAccountId, table.status)
    ]
);

// ---------------------------------------------------------------------------
// Protokoll
// ---------------------------------------------------------------------------

export const financeLogs = pgTable(
    "finance_logs",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        fiscalYearId: uuid("fiscal_year_id"),
        entity: financeLogEntity("entity").notNull(),
        entityId: uuid("entity_id"),
        action: financeLogAction("action").notNull(),
        changes: jsonb("changes")
            .$type<{ field: string; before: unknown; after: unknown }[]>()
            .notNull()
            .default([]),
        user: text("user").notNull().default("system"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [index("finance_logs_year_idx").on(table.fiscalYearId, table.createdAt)]
);

// ---------------------------------------------------------------------------
// Beziehungen
// ---------------------------------------------------------------------------

export const accountsRelations = relations(accounts, ({ many, one }) => ({
    lines: many(journalLines),
    parent: one(accounts, {
        fields: [accounts.parentId],
        references: [accounts.id],
        relationName: "accountParent"
    }),
    children: many(accounts, { relationName: "accountParent" })
}));

export const journalEntriesRelations = relations(journalEntries, ({ many, one }) => ({
    lines: many(journalLines),
    fiscalYear: one(fiscalYears, {
        fields: [journalEntries.fiscalYearId],
        references: [fiscalYears.id]
    })
}));

export const journalLinesRelations = relations(journalLines, ({ one }) => ({
    entry: one(journalEntries, {
        fields: [journalLines.entryId],
        references: [journalEntries.id]
    }),
    account: one(accounts, { fields: [journalLines.accountId], references: [accounts.id] }),
    bankAccount: one(bankAccounts, {
        fields: [journalLines.bankAccountId],
        references: [bankAccounts.id]
    })
}));

export const invoicesRelations = relations(invoices, ({ many, one }) => ({
    items: many(invoiceItems),
    payments: many(payments),
    fiscalYear: one(fiscalYears, {
        fields: [invoices.fiscalYearId],
        references: [fiscalYears.id]
    })
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
    invoice: one(invoices, { fields: [payments.invoiceId], references: [invoices.id] }),
    bill: one(bills, { fields: [payments.billId], references: [bills.id] }),
    bankAccount: one(bankAccounts, {
        fields: [payments.bankAccountId],
        references: [bankAccounts.id]
    })
}));

export const bankAccountsRelations = relations(bankAccounts, ({ one, many }) => ({
    account: one(accounts, { fields: [bankAccounts.accountId], references: [accounts.id] }),
    imports: many(bankImports)
}));
