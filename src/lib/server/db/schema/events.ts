import { relations } from "drizzle-orm";
import {
    boolean,
    index,
    pgEnum,
    pgTable,
    text,
    timestamp,
    unique,
    uuid
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { members } from "./members";
import { shareTarget } from "./files";

/**
 * Termine, Freigaben und Rückmeldungen.
 *
 * Ersetzt die leere Platzhalterseite unter /intern/termine.
 *
 * Die Freigaben haben denselben Zuschnitt wie die der Ordner und werden von
 * derselben Auflösung bedient ($lib/server/shareService) -- der Enum
 * `share_target` wird geteilt, die Tabelle nicht: so trägt jede ihren eigenen
 * Fremdschlüssel, und ein gelöschter Termin nimmt seine Freigaben mit.
 *
 * Rückmeldungen hängen am MITGLIED, nicht am Zugang: Eltern melden für ihre
 * Kinder zurück, und ein Kind hat oft gar keinen eigenen Zugang. Ein Elternteil
 * mit zwei Kindern gibt deshalb zwei Rückmeldungen ab.
 */

export const eventStatus = pgEnum("event_status", ["draft", "published", "cancelled"]);
export const eventResponse = pgEnum("event_response", ["yes", "no", "maybe"]);

export const events = pgTable(
    "events",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        title: text("title").notNull(),
        description: text("description").notNull().default(""),
        location: text("location").notNull().default(""),
        /**
         * Zeitpunkte mit Zeitzone. Anders als bei den Kalendertagen der Kasse
         * geht es hier um echte Uhrzeiten -- ein Termin um 16:30 Uhr ist ein
         * Zeitpunkt, kein Datum.
         */
        startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
        endsAt: timestamp("ends_at", { withTimezone: true }),
        /** Ganztägig: die Uhrzeit wird dann nicht angezeigt. */
        allDay: boolean("all_day").notNull().default(false),
        status: eventStatus("status").notNull().default("draft"),
        /** Nach dieser Frist ist keine Rückmeldung mehr möglich. */
        responseDeadline: timestamp("response_deadline", { withTimezone: true }),
        createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
    },
    (table) => [
        index("events_starts_idx").on(table.startsAt),
        index("events_status_idx").on(table.status)
    ]
);

export const eventShares = pgTable(
    "event_shares",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        eventId: uuid("event_id")
            .notNull()
            .references(() => events.id, { onDelete: "cascade" }),
        targetKind: shareTarget("target_kind").notNull(),
        /**
         * Zeigt je nach targetKind auf groups.id, positions.id, roles.id oder
         * users.id -- ein Fremdschlüssel ist deshalb nicht möglich.
         */
        targetId: uuid("target_id").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [
        unique("event_shares_unique").on(table.eventId, table.targetKind, table.targetId),
        index("event_shares_target_idx").on(table.targetKind, table.targetId)
    ]
);

export const eventResponses = pgTable(
    "event_responses",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        eventId: uuid("event_id")
            .notNull()
            .references(() => events.id, { onDelete: "cascade" }),
        memberId: uuid("member_id")
            .notNull()
            .references(() => members.id, { onDelete: "cascade" }),
        response: eventResponse("response").notNull(),
        note: text("note").notNull().default(""),
        /** Wer die Rückmeldung abgegeben hat -- oft ein Elternteil. */
        respondedBy: uuid("responded_by").references(() => users.id, { onDelete: "set null" }),
        respondedAt: timestamp("responded_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [
        // Je Termin und Mitglied genau eine Rückmeldung; eine neue ersetzt sie.
        unique("event_responses_unique").on(table.eventId, table.memberId),
        index("event_responses_event_idx").on(table.eventId)
    ]
);

/**
 * Persönliche Kalenderabonnements.
 *
 * Ein Kalenderprogramm kann sich nicht anmelden -- es ruft eine Adresse ab.
 * Das Token in dieser Adresse ersetzt deshalb die Anmeldung und ist auf genau
 * einen Zugang ausgestellt. Es lässt sich einzeln widerrufen, ohne dass das
 * Passwort geändert werden muss.
 */
export const calendarTokens = pgTable(
    "calendar_tokens",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        /**
         * Der sha256-Abdruck des Tokens, nicht das Token selbst -- wie bei den
         * Sitzungen. Ein Lesezugriff auf die Datenbank ergibt damit kein
         * benutzbares Abonnement.
         */
        tokenHash: text("token_hash").notNull(),
        label: text("label").notNull().default(""),
        lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [
        unique("calendar_tokens_hash_unique").on(table.tokenHash),
        index("calendar_tokens_user_idx").on(table.userId)
    ]
);

export const eventsRelations = relations(events, ({ many }) => ({
    shares: many(eventShares),
    responses: many(eventResponses)
}));

export const eventSharesRelations = relations(eventShares, ({ one }) => ({
    event: one(events, { fields: [eventShares.eventId], references: [events.id] })
}));

export const eventResponsesRelations = relations(eventResponses, ({ one }) => ({
    event: one(events, { fields: [eventResponses.eventId], references: [events.id] }),
    member: one(members, { fields: [eventResponses.memberId], references: [members.id] })
}));
