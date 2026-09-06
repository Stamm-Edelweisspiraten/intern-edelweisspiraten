import { relations, sql } from "drizzle-orm";
import {
    boolean,
    check,
    index,
    integer,
    pgEnum,
    pgTable,
    primaryKey,
    text,
    timestamp,
    uniqueIndex,
    uuid
} from "drizzle-orm/pg-core";
import { members } from "./members";
import { invoices } from "./finance";

/**
 * Kaemmerer: Artikel, Lager und Bestellungen.
 *
 * Lieferung und Bezahlung bleiben ausdruecklich zwei unabhaengige Merkmale
 * (status und paymentStatus). In einer frueheren Fassung ueberschrieb eine
 * vollstaendige Zahlung den Lieferstatus "delivered" und loeschte damit die
 * Lieferinformation.
 */

export const orderStatus = pgEnum("order_status", [
    "ordered",
    "processing",
    "delivered",
    "cancelled"
]);
export const orderPaymentStatus = pgEnum("order_payment_status", ["open", "partial", "paid"]);
export const stockMovementKind = pgEnum("stock_movement_kind", [
    "in",
    "out",
    "correction",
    "order",
    "return"
]);

export const articles = pgTable(
    "articles",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        name: text("name").notNull(),
        description: text("description").notNull().default(""),
        /** Grundpreis in Cents; Groessen koennen ihn ueberschreiben. */
        price: integer("price").notNull().default(0),
        /** Bei Artikeln mit Groessen die Summe der Groessenbestaende. */
        stock: integer("stock").notNull().default(0),
        minStock: integer("min_stock").notNull().default(0),
        active: boolean("active").notNull().default(true),
        orderUrl: text("order_url").notNull().default(""),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
    },
    (table) => [index("articles_active_name_idx").on(table.active, table.name)]
);

export const articleSizes = pgTable(
    "article_sizes",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        articleId: uuid("article_id")
            .notNull()
            .references(() => articles.id, { onDelete: "cascade" }),
        name: text("name").notNull(),
        price: integer("price").notNull().default(0),
        stock: integer("stock").notNull().default(0),
        minStock: integer("min_stock").notNull().default(0),
        orderUrl: text("order_url").notNull().default(""),
        position: integer("position").notNull().default(0)
    },
    (table) => [
        uniqueIndex("article_sizes_unique").on(table.articleId, table.name),
        index("article_sizes_article_idx").on(table.articleId)
    ]
);

/**
 * Lagerbewegungen. In der Altfassung war der Bestand nur eine Zahl am
 * Artikel -- eine Inventurkorrektur war danach nicht mehr nachvollziehbar.
 */
export const stockMovements = pgTable(
    "stock_movements",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        articleId: uuid("article_id")
            .notNull()
            .references(() => articles.id, { onDelete: "cascade" }),
        sizeId: uuid("size_id").references(() => articleSizes.id, { onDelete: "cascade" }),
        kind: stockMovementKind("kind").notNull(),
        /** Vorzeichenbehaftete Veraenderung des Bestands. */
        quantity: integer("quantity").notNull(),
        /** Bestand nach dieser Bewegung, fuer die Nachvollziehbarkeit. */
        stockAfter: integer("stock_after").notNull(),
        orderId: uuid("order_id"),
        note: text("note").notNull().default(""),
        createdBy: text("created_by").notNull().default("system"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [index("stock_movements_article_idx").on(table.articleId, table.createdAt)]
);

export const orders = pgTable(
    "orders",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        number: text("number").notNull(),
        total: integer("total").notNull().default(0),
        status: orderStatus("status").notNull().default("ordered"),
        paymentStatus: orderPaymentStatus("payment_status").notNull().default("open"),
        cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
        createdBy: uuid("created_by"),
        createdByName: text("created_by_name").notNull().default(""),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
    },
    (table) => [
        uniqueIndex("orders_number_unique").on(table.number),
        index("orders_status_idx").on(table.status)
    ]
);

export const orderItems = pgTable(
    "order_items",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        orderId: uuid("order_id")
            .notNull()
            .references(() => orders.id, { onDelete: "cascade" }),
        position: integer("position").notNull().default(0),
        articleId: uuid("article_id").references(() => articles.id, { onDelete: "set null" }),
        sizeId: uuid("size_id").references(() => articleSizes.id, { onDelete: "set null" }),
        /** Beim Anlegen festgehalten, damit spaetere Preisaenderungen alte Bestellungen nicht verfaelschen. */
        name: text("name").notNull(),
        size: text("size"),
        price: integer("price").notNull(),
        quantity: integer("quantity").notNull(),
        total: integer("total").notNull(),
        received: boolean("received").notNull().default(false),
        /** Gesetzt, sobald der Lagerabgang gebucht wurde. */
        stockBooked: boolean("stock_booked").notNull().default(false)
    },
    (table) => [
        index("order_items_order_idx").on(table.orderId),
        check("order_items_quantity_check", sql`${table.quantity} > 0`)
    ]
);

export const orderMembers = pgTable(
    "order_members",
    {
        orderId: uuid("order_id")
            .notNull()
            .references(() => orders.id, { onDelete: "cascade" }),
        memberId: uuid("member_id")
            .notNull()
            .references(() => members.id, { onDelete: "cascade" }),
        memberName: text("member_name").notNull().default("")
    },
    (table) => [
        primaryKey({ columns: [table.orderId, table.memberId] }),
        index("order_members_member_idx").on(table.memberId)
    ]
);

/** Abrechnung einer Bestellung ueber die Kasse. */
export const orderInvoices = pgTable(
    "order_invoices",
    {
        orderId: uuid("order_id")
            .notNull()
            .references(() => orders.id, { onDelete: "cascade" }),
        invoiceId: uuid("invoice_id")
            .notNull()
            .references(() => invoices.id, { onDelete: "cascade" })
    },
    (table) => [
        primaryKey({ columns: [table.orderId, table.invoiceId] }),
        index("order_invoices_invoice_idx").on(table.invoiceId)
    ]
);

// ---------------------------------------------------------------------------
// Beziehungen
// ---------------------------------------------------------------------------

export const articlesRelations = relations(articles, ({ many }) => ({
    sizes: many(articleSizes),
    movements: many(stockMovements)
}));

export const articleSizesRelations = relations(articleSizes, ({ one }) => ({
    article: one(articles, { fields: [articleSizes.articleId], references: [articles.id] })
}));

export const ordersRelations = relations(orders, ({ many }) => ({
    items: many(orderItems),
    members: many(orderMembers),
    invoices: many(orderInvoices)
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
    order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
    article: one(articles, { fields: [orderItems.articleId], references: [articles.id] })
}));

export const orderMembersRelations = relations(orderMembers, ({ one }) => ({
    order: one(orders, { fields: [orderMembers.orderId], references: [orders.id] }),
    member: one(members, { fields: [orderMembers.memberId], references: [members.id] })
}));
