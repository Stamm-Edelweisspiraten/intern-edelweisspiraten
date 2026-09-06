import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Einstellungen als Schluessel-Wert-Ablage.
 *
 * Zwei Schluessel sind belegt:
 *   "organization" -- Name, Logo und Kontaktdaten des Stamms. Damit laeuft
 *                     dieselbe Anwendung fuer verschiedene Staemme, ohne dass
 *                     der Name im Quelltext steht.
 *   "finance"      -- Standard-Beitragssaetze und Bankverbindung.
 */
export const settings = pgTable("settings", {
    key: text("key").primaryKey(),
    value: jsonb("value").$type<Record<string, unknown>>().notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: text("updated_by").notNull().default("system")
});
