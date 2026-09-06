import { relations } from "drizzle-orm";
import {
    boolean,
    index,
    integer,
    jsonb,
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
import { events } from "./events";

/**
 * Umfragen und Formulare.
 *
 * Dieselbe Bauart wie Termine und Ordner: ein Kopf, eine Freigabetabelle mit
 * demselben Zuschnitt (`share_target`) und dieselbe Sichtbarkeitsregel --
 * ohne Freigabe gilt eine Umfrage fuer alle.
 *
 * Drei Entscheidungen, die nicht aus dem Namen hervorgehen:
 *
 *   1. Die Optionen einer Auswahlfrage stehen als `jsonb` AM FELD, nicht in
 *      einer eigenen Tabelle. Entscheidend dabei: eine Option hat einen
 *      STABILEN `value` und ein davon getrenntes `label`. Die Antwort
 *      speichert den `value`. Wird "Samstag" spaeter in "Sa." umbenannt,
 *      aendert sich nur das `label` -- die Auszaehlung bleibt eine einzige
 *      Gruppe. Genau deshalb braucht es keine Optionstabelle mit
 *      Fremdschluessel, die beim Entfernen einer Option ueber CASCADE die
 *      bereits abgegebenen Antworten mitreissen wuerde.
 *
 *   2. Wer antwortet, steht je Umfrage in `audience`.
 *      "user"   -- der angemeldete Zugang. Der Normalfall: eine Umfrage
 *                  fragt die Meinung der Person, die sie beantwortet.
 *      "member" -- je verknuepftem Mitglied, wie die Rueckmeldung zu einem
 *                  Termin ("Essenswunsch je Kind").
 *      Ein reines Mitgliedermodell waere falsch: ein Zugang ohne verknuepftes
 *      Mitglied (Kassenpruefer) koennte dann gar nicht antworten, obwohl er
 *      als Freigabeziel eingeladen werden kann. Ein reines Zugangsmodell
 *      waere ebenfalls falsch: Eltern zweier Kinder haetten eine Stimme, wo
 *      zwei gefragt sind. `audience` ist nach der ersten Antwort unveraenderbar
 *      -- das erzwingt `surveyService`.
 *
 *   3. Anonym heisst wirklich anonym. Die Antwortzeile traegt dann KEINEN
 *      Absender; wer teilgenommen hat, steht in `survey_participants` -- ohne
 *      Bezug darauf, WAS geantwortet wurde. Eine Anonymitaet, die den Absender
 *      in derselben Zeile speichert und ihn nur beim Anzeigen weglaesst, haelt
 *      genau bis zur ersten Fehlersuche. Folge fuer die Oberflaeche: eine
 *      anonyme Antwort laesst sich weder aendern noch zuruecknehmen.
 *
 *   4. Sobald Antworten vorliegen, darf die Fragenliste noch WACHSEN, aber
 *      nicht schrumpfen: neue Fragen und geaenderte Beschriftungen sind
 *      erlaubt, das Loeschen einer Frage und der Wechsel ihres Typs nicht.
 *      Sonst zeigten die Ergebnisse Antworten ohne Feld -- oder Zahlen, die
 *      unter einer Frage stehen, die so nie gestellt wurde. Eine nachtraeglich
 *      ergaenzte Frage weist die Auswertung als "von X der Y Antworten
 *      beantwortet" aus. Das erzwingt `surveyService`, nicht die Datenbank.
 *
 * ACHTUNG bei einem weiteren Feldtyp -- die Regel lautet ANDERS, als es
 * naheliegt:
 *
 *   `migrate()` von Drizzle legt EINE Transaktion um ALLE ausstehenden
 *   Migrationsdateien (siehe `PgDialect.migrate`). Eine eigene Datei schafft
 *   also KEINE Transaktionsgrenze -- bei einem Produktionsdeploy laufen alle
 *   noch offenen Dateien gemeinsam.
 *
 * Was tatsaechlich gilt (PostgreSQL 12+, hier 17):
 *
 *   - `ALTER TYPE ... ADD VALUE` im Transaktionsblock ist ERLAUBT.
 *   - Den neuen Wert in derselben Transaktion zu BENUTZEN ist verboten:
 *     "unsafe use of new value ... of enum type". Nachgestellt und bestaetigt.
 *   - Ausnahme: wurde der Typ in derselben Transaktion per CREATE TYPE
 *     angelegt, darf der Wert sofort benutzt werden. Deshalb ist der Fall
 *     "frische Datenbank" (CI, neues Volume) IMMER gruen und beweist nichts.
 *
 * Daraus folgt die verbindliche Regel:
 *
 *   KEINE Migration desselben Deploys darf einen frisch hinzugefuegten Wert
 *   als Literal benutzen -- nicht in DEFAULT, CHECK, WHERE, USING, INSERT
 *   oder UPDATE. Eine Datenmigration ("alle alten Zeilen auf 'section'
 *   setzen") gehoert deshalb in ein SPAETERES Deploy, nicht nur in eine
 *   spaetere Datei.
 *
 * Neue Werte immer ANHAENGEN, nie einschieben: bei einer Umsortierung baut
 * drizzle-kit den Typ neu (`CREATE TYPE ... _new`, `ALTER COLUMN ... USING`),
 * und dieser Cast benutzt die neuen Werte -- er bricht dann genau im
 * Produktionsfall und nur dort.
 */

export const surveyStatus = pgEnum("survey_status", ["draft", "published", "closed"]);

/** Wer antwortet: der angemeldete Zugang oder je verknuepftem Mitglied. */
export const surveyAudience = pgEnum("survey_audience", ["user", "member"]);

/**
 * text     -- einzeilige Eingabe
 * longtext -- mehrzeilige Eingabe
 * single   -- genau eine Auswahl
 * multi    -- mehrere Auswahlen
 * boolean  -- Ja/Nein
 */
export const surveyFieldType = pgEnum("survey_field_type", [
    "text",
    "longtext",
    "single",
    "multi",
    "boolean",
    "number",
    "date",
    "email",
    "phone",
    "scale",
    "section"
]);

export const surveys = pgTable(
    "surveys",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        title: text("title").notNull(),
        description: text("description").notNull().default(""),
        status: surveyStatus("status").notNull().default("draft"),
        /** Siehe Punkt 2 im Kopfkommentar. Nach der ersten Antwort fest. */
        audience: surveyAudience("audience").notNull().default("user"),
        /**
         * Bezug auf einen Termin, freiwillig. ON DELETE SET NULL, nicht
         * CASCADE: die Ergebnisse einer Umfrage sind eigenstaendig und
         * duerfen einen geloeschten Termin ueberleben.
         */
        eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
        /** Vor diesem Zeitpunkt ist keine Antwort moeglich. */
        opensAt: timestamp("opens_at", { withTimezone: true }),
        /** Nach diesem Zeitpunkt ist keine Antwort mehr moeglich. */
        closesAt: timestamp("closes_at", { withTimezone: true }),
        /**
         * Anonym: die Antwort wird ohne `user_id` gespeichert. Damit
         * entfaellt zwangslaeufig auch der Schutz gegen Mehrfachantworten --
         * das Formular weist ausdruecklich darauf hin.
         */
        anonymous: boolean("anonymous").notNull().default(false),
        /** Formular statt Umfrage: derselbe Zugang darf mehrfach absenden. */
        multiplePerUser: boolean("multiple_per_user").notNull().default(false),
        /**
         * Externe Freigabe: Antworten ohne Anmeldung ueber einen Link.
         *
         * Die Spalten stehen hier und nicht in einer eigenen Tabelle, weil es
         * genau EINEN Link je Umfrage gibt -- eine Tabelle mit hoechstens einer
         * Zeile je Elternzeile waere ein Join ohne Gegenwert.
         *
         * Gespeichert wird nur der sha256-Abdruck, wie bei Sitzungen und
         * Kalender-Abos: ein Lesezugriff auf die Datenbank ergibt damit keinen
         * benutzbaren Link. Das Token selbst ist genau einmal sichtbar.
         *
         * WICHTIG: eine Umfrage mit `audience = "member"` laesst sich nicht
         * extern freigeben -- ohne Anmeldung gibt es kein Mitglied, fuer das
         * geantwortet werden koennte. Das erzwingt `surveyService`.
         */
        publicEnabled: boolean("public_enabled").notNull().default(false),
        publicTokenHash: text("public_token_hash"),
        /**
         * Wie der Absender erfasst wird: `required` | `optional` | `none`.
         *
         * Text mit Positivliste in TS statt pgEnum: ein weiterer Modus soll
         * ohne die Transaktionsfalle von `ALTER TYPE ... ADD VALUE` dazukommen
         * duerfen. Unbekannte Werte fallen beim Lesen auf `optional` zurueck.
         */
        publicNameMode: text("public_name_mode").notNull().default("optional"),
        /** NULL = ohne Ablauf. */
        publicExpiresAt: timestamp("public_expires_at", { withTimezone: true }),
        createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
    },
    (table) => [
        index("surveys_status_idx").on(table.status),
        index("surveys_event_idx").on(table.eventId),
        unique("surveys_public_token_unique").on(table.publicTokenHash)
    ]
);

export const surveyFields = pgTable(
    "survey_fields",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        surveyId: uuid("survey_id")
            .notNull()
            .references(() => surveys.id, { onDelete: "cascade" }),
        /** Reihenfolge im Formular, lueckenlos ab 0. */
        position: integer("position").notNull().default(0),
        type: surveyFieldType("type").notNull(),
        label: text("label").notNull(),
        help: text("help").notNull().default(""),
        required: boolean("required").notNull().default(false),
        /**
         * Nur bei `single` und `multi`: eine zusaetzliche Zeile "Sonstiges" mit
         * Freitextfeld. Der gewaehlte Wert ist dann `__other__`, der Text steht
         * in `survey_answers.other_value`.
         */
        allowOther: boolean("allow_other").notNull().default(false),
        /**
         * Grenzen. Bei `number` die erlaubte Spanne, bei `scale` die Skala
         * selbst (Vorgabe 1 bis 5). Beide NULL: keine Begrenzung.
         *
         * Konfigurierbar statt fest verdrahtet, weil eine Schulnotenskala 1-6
         * genauso verbreitet ist wie eine Zustimmung von 1 bis 5.
         */
        minValue: integer("min_value"),
        maxValue: integer("max_value"),
        /**
         * Nur bei `single` und `multi` belegt; sonst leer.
         *
         * `value` ist der stabile Schluessel, den die Antwort speichert;
         * `label` ist die Beschriftung und darf sich jederzeit aendern --
         * siehe Punkt 1 im Kopfkommentar.
         */
        options: jsonb("options")
            .$type<{ value: string; label: string }[]>()
            .notNull()
            .default([])
    },
    (table) => [
        /**
         * KEINE Eindeutigkeit auf (survey_id, position): sie machte aus jedem
         * Umsortieren einen Zweischritt ueber Zwischenwerte. Gleiche
         * Positionen sind harmlos -- gelesen wird immer nach
         * `position, id` sortiert. Genauso haelt es `article_sizes`.
         */
        index("survey_fields_survey_idx").on(table.surveyId, table.position)
    ]
);

export const surveyResponses = pgTable(
    "survey_responses",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        surveyId: uuid("survey_id")
            .notNull()
            .references(() => surveys.id, { onDelete: "cascade" }),
        /** Wer geantwortet hat. IMMER leer bei anonymen Umfragen. */
        userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
        /** Nur bei `audience = "member"` belegt: fuer wen geantwortet wurde. */
        memberId: uuid("member_id").references(() => members.id, { onDelete: "cascade" }),
        /**
         * Der Schluessel, der Mehrfachantworten verhindert -- oder NULL.
         *
         * Belegt mit `u:<zugang>` bzw. `m:<mitglied>`, wenn die Umfrage genau
         * eine Antwort je Teilnehmer zulaesst. NULL bei anonymen Umfragen und
         * bei Formularen mit `multiple_per_user`.
         *
         * Der Umweg ueber eine eigene Spalte statt einer Eindeutigkeit auf
         * (survey_id, user_id, member_id) ist Absicht: PostgreSQL behandelt
         * NULL-Werte in einer Eindeutigkeit standardmaessig als verschieden,
         * und genau das wird hier gebraucht -- beliebig viele anonyme
         * Antworten nebeneinander, aber hoechstens eine je Teilnehmer, sobald
         * ein Schluessel gesetzt ist. Eine Bedingung ueber `NULLS NOT
         * DISTINCT` haette den umgekehrten Effekt und alle anonymen Antworten
         * bis auf die erste abgewiesen.
         */
        dedupeKey: text("dedupe_key"),
        /**
         * Woher die Antwort kam: `intern` (angemeldet) oder `link` (oeffentlich).
         *
         * Bestandszeilen bleiben `intern`. Die Auswertung weist beides getrennt
         * aus -- eine Antwort ohne Anmeldung traegt nicht dieselbe Gewissheit
         * wie eine aus dem Portal.
         */
        source: text("source").notNull().default("intern"),
        /**
         * Der selbst angegebene Name bei einer Antwort ueber den Link.
         *
         * Leer, wenn der Namensmodus `none` ist oder niemand etwas eingetragen
         * hat. Bewusst KEIN Bezug auf `users` oder `members`: wer ueber den Link
         * antwortet, ist im Portal nicht bekannt.
         */
        publicName: text("public_name").notNull().default(""),
        submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
    },
    (table) => [
        unique("survey_responses_dedupe_unique").on(table.surveyId, table.dedupeKey),
        index("survey_responses_survey_idx").on(table.surveyId)
    ]
);

/**
 * Wer an einer ANONYMEN Umfrage teilgenommen hat -- nicht, was er geantwortet
 * hat.
 *
 * Ohne diese Tabelle gaebe es bei anonymen Umfragen keinen Schutz gegen
 * Mehrfachantworten; mit einem Absender in der Antwortzeile gaebe es keine
 * Anonymitaet. Beides zusammen geht nur ueber zwei Tabellen, zwischen denen
 * keine Verbindung besteht.
 *
 * Bei nicht-anonymen Umfragen bleibt sie leer: dort traegt die Antwortzeile
 * ihren `dedupe_key` selbst, und zwei Wahrheiten wuerden auseinanderlaufen.
 */
export const surveyParticipants = pgTable(
    "survey_participants",
    {
        surveyId: uuid("survey_id")
            .notNull()
            .references(() => surveys.id, { onDelete: "cascade" }),
        /** "user" oder "member" -- wie `surveys.audience`. */
        subjectKind: surveyAudience("subject_kind").notNull(),
        /** Zeigt je nach subjectKind auf users.id oder members.id; kein FK. */
        subjectId: uuid("subject_id").notNull(),
        submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [
        unique("survey_participants_unique").on(
            table.surveyId,
            table.subjectKind,
            table.subjectId
        )
    ]
);

export const surveyAnswers = pgTable(
    "survey_answers",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        responseId: uuid("response_id")
            .notNull()
            .references(() => surveyResponses.id, { onDelete: "cascade" }),
        fieldId: uuid("field_id")
            .notNull()
            .references(() => surveyFields.id, { onDelete: "cascade" }),
        /** text, longtext, single und boolean. */
        value: text("value").notNull().default(""),
        /**
         * Nur `multi`. Zwei Spalten statt einer: eine Mehrfachauswahl in einem
         * Textfeld zusammenzufassen macht jede Auswertung zur Zeichenkettenarbeit.
         */
        values: text("values").array().notNull().default([]),
        /** Der Freitext neben "Sonstiges"; leer, wenn nicht gewaehlt. */
        otherValue: text("other_value").notNull().default("")
    },
    (table) => [
        unique("survey_answers_unique").on(table.responseId, table.fieldId),
        index("survey_answers_field_idx").on(table.fieldId)
    ]
);

export const surveyShares = pgTable(
    "survey_shares",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        surveyId: uuid("survey_id")
            .notNull()
            .references(() => surveys.id, { onDelete: "cascade" }),
        targetKind: shareTarget("target_kind").notNull(),
        /**
         * Zeigt je nach targetKind auf groups.id, positions.id, roles.id oder
         * users.id -- ein Fremdschluessel ist deshalb nicht moeglich.
         */
        targetId: uuid("target_id").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [
        unique("survey_shares_unique").on(table.surveyId, table.targetKind, table.targetId),
        index("survey_shares_target_idx").on(table.targetKind, table.targetId)
    ]
);

export const surveysRelations = relations(surveys, ({ many, one }) => ({
    fields: many(surveyFields),
    responses: many(surveyResponses),
    shares: many(surveyShares),
    event: one(events, { fields: [surveys.eventId], references: [events.id] })
}));

export const surveyFieldsRelations = relations(surveyFields, ({ one, many }) => ({
    survey: one(surveys, { fields: [surveyFields.surveyId], references: [surveys.id] }),
    answers: many(surveyAnswers)
}));

export const surveyResponsesRelations = relations(surveyResponses, ({ one, many }) => ({
    survey: one(surveys, { fields: [surveyResponses.surveyId], references: [surveys.id] }),
    user: one(users, { fields: [surveyResponses.userId], references: [users.id] }),
    member: one(members, { fields: [surveyResponses.memberId], references: [members.id] }),
    answers: many(surveyAnswers)
}));

export const surveyAnswersRelations = relations(surveyAnswers, ({ one }) => ({
    response: one(surveyResponses, {
        fields: [surveyAnswers.responseId],
        references: [surveyResponses.id]
    }),
    field: one(surveyFields, { fields: [surveyAnswers.fieldId], references: [surveyFields.id] })
}));

export const surveySharesRelations = relations(surveyShares, ({ one }) => ({
    survey: one(surveys, { fields: [surveyShares.surveyId], references: [surveys.id] })
}));
