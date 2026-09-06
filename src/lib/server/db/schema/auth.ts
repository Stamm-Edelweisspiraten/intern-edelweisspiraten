import { relations } from "drizzle-orm";
import {
    boolean,
    index,
    integer,
    pgEnum,
    pgTable,
    primaryKey,
    text,
    timestamp,
    unique,
    uniqueIndex,
    uuid
} from "drizzle-orm/pg-core";

/**
 * Zugaenge, Rollen, Sitzungen und API-Tokens.
 *
 * Gegenueber der MongoDB-Fassung sind die drei Zeichenketten-Arrays
 * (roleIds, memberIds, permissions) aufgeloest: Rollen- und
 * Mitgliedszuordnungen sind jetzt Zuordnungstabellen mit Fremdschluessel,
 * sodass eine geloeschte Rolle nicht als verwaiste Kennung in Benutzern
 * zurueckbleiben kann.
 */

export const userStatus = pgEnum("user_status", ["active", "disabled", "invited"]);
export const userType = pgEnum("user_type", ["parent", "child"]);

export const users = pgTable(
    "users",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        name: text("name").notNull(),
        /** Immer klein geschrieben gespeichert; eindeutig. */
        email: text("email").notNull(),
        /** Leer bei eingeladenen Zugaengen ohne gesetztes Passwort. */
        passwordHash: text("password_hash").notNull().default(""),
        passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
        status: userStatus("status").notNull().default("invited"),
        type: userType("type").notNull().default("parent"),

        /** Zwei-Faktor. Das Geheimnis liegt verschluesselt (siehe auth/totp). */
        mfaEnabled: boolean("mfa_enabled").notNull().default(false),
        mfaSecret: text("mfa_secret"),
        /** Gehashte Wiederherstellungscodes -- nie im Klartext. */
        mfaRecoveryCodes: text("mfa_recovery_codes").array(),
        mfaConfirmedAt: timestamp("mfa_confirmed_at", { withTimezone: true }),

        failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
        lockedUntil: timestamp("locked_until", { withTimezone: true }),
        lastLoginAt: timestamp("last_login_at", { withTimezone: true }),

        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
    },
    (table) => [
        uniqueIndex("users_email_unique").on(table.email),
        index("users_status_idx").on(table.status)
    ]
);

export const roles = pgTable(
    "roles",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        key: text("key").notNull(),
        name: text("name").notNull(),
        description: text("description").notNull().default(""),
        /** Berechtigungsschluessel, inklusive Platzhaltern wie "finance.*". */
        permissions: text("permissions").array().notNull().default([]),
        requireMfa: boolean("require_mfa").notNull().default(false),
        /** Systemrollen koennen nicht geloescht werden. */
        system: boolean("system").notNull().default(false),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
    },
    (table) => [uniqueIndex("roles_key_unique").on(table.key)]
);

/**
 * Rollenzuweisung, wahlweise auf eine Gruppe eingeschraenkt.
 *
 * `groupId = null` bedeutet stammesweit -- die Rolle gilt ueberall. Steht dort
 * eine Gruppe, gelten ihre Rechte nur fuer diese Gruppe: dieselbe Rolle
 * "Gruppenleitung" kann so einmal fuer die Meute und einmal fuer die Sippe
 * vergeben werden.
 *
 * Vorher gab es dafuer eine zweite Berechtigungsreihe `groupleader.*`, deren
 * Gruppenbezug ausschliesslich aus einem Amt vom Typ "gruppenleiter" stammte
 * und in neun Routen von Hand nachgebaut war.
 *
 * Der Gruppenbezug gehoert zum Schluessel -- aber NICHT als Primaerschluessel:
 * dessen Spalten muessen in PostgreSQL NOT NULL sein, und genau das darf
 * `groupId` nicht sein. Stattdessen ein eindeutiger Index mit
 * NULLS NOT DISTINCT: dabei gelten zwei NULL-Werte als gleich, sodass
 * dieselbe stammesweite Zuweisung nicht zweimal entstehen kann.
 *
 * `groupId` traegt hier bewusst KEIN references(): `groups` steht in
 * members.ts, und members.ts braucht seinerseits `roles` aus dieser Datei
 * (positions.roleId) -- ein gegenseitiger Import waere die Folge. Der
 * Fremdschluessel wird stattdessen in derselben Migration von Hand angelegt,
 * mit ON DELETE CASCADE. Die Integritaet ist damit dieselbe, nur die
 * Deklaration liegt woanders.
 */
export const userRoles = pgTable(
    "user_roles",
    {
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        roleId: uuid("role_id")
            .notNull()
            .references(() => roles.id, { onDelete: "cascade" }),
        groupId: uuid("group_id")
    },
    (table) => [
        unique("user_roles_unique")
            .on(table.userId, table.roleId, table.groupId)
            .nullsNotDistinct(),
        index("user_roles_role_idx").on(table.roleId),
        index("user_roles_group_idx").on(table.groupId)
    ]
);

/**
 * Verknuepfung Zugang -> Mitglied. Es gab in der Altfassung vier parallele
 * Felder dafuer; massgeblich ist ausschliesslich diese Tabelle.
 */
export const userMembers = pgTable(
    "user_members",
    {
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        memberId: uuid("member_id").notNull()
    },
    (table) => [
        primaryKey({ columns: [table.userId, table.memberId] }),
        index("user_members_member_idx").on(table.memberId)
    ]
);

export const sessions = pgTable(
    "sessions",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        /**
         * sha256 des Cookie-Tokens. Der Rohwert steht ausschliesslich im
         * Cookie -- ein Lesezugriff auf die Datenbank erlaubt damit keine
         * Sitzungsuebernahme.
         */
        tokenHash: text("token_hash").notNull(),
        /** Effektiver Benutzer; waehrend einer Impersonation der Zielbenutzer. */
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
        /** Gleitendes Ablaufdatum. */
        expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
        /** Harte Obergrenze, die die gleitende Verlaengerung nicht ueberschreitet. */
        absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(),
        userAgent: text("user_agent"),
        device: text("device"),
        ip: text("ip"),
        revokedAt: timestamp("revoked_at", { withTimezone: true }),
        /** Erst true, wenn der zweite Faktor bestaetigt wurde. */
        mfaSatisfied: boolean("mfa_satisfied").notNull().default(false),

        /** Gesetzt, solange diese Sitzung eine Impersonation ist. */
        impersonationUserId: uuid("impersonation_user_id"),
        impersonationUserName: text("impersonation_user_name"),
        impersonationUserEmail: text("impersonation_user_email"),
        impersonationStartedAt: timestamp("impersonation_started_at", { withTimezone: true })
    },
    (table) => [
        uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
        index("sessions_user_idx").on(table.userId),
        index("sessions_expires_idx").on(table.expiresAt)
    ]
);

export const passwordResetTokens = pgTable(
    "password_reset_tokens",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tokenHash: text("token_hash").notNull(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
        usedAt: timestamp("used_at", { withTimezone: true })
    },
    (table) => [
        uniqueIndex("password_reset_tokens_hash_unique").on(table.tokenHash),
        index("password_reset_tokens_user_idx").on(table.userId),
        index("password_reset_tokens_expires_idx").on(table.expiresAt)
    ]
);

/**
 * Zaehler gegen automatisiertes Durchprobieren. Aufgeraeumt wird ueber
 * cleanupExpired() beim Start -- in MongoDB uebernahm das ein TTL-Index.
 */
export const loginAttempts = pgTable(
    "login_attempts",
    {
        /** Beispiele: "ip:1.2.3.4", "user:<id>", "invite:<memberId>:<ip>". */
        key: text("key").primaryKey(),
        count: integer("count").notNull().default(0),
        firstAt: timestamp("first_at", { withTimezone: true }).notNull().defaultNow(),
        lastAt: timestamp("last_at", { withTimezone: true }).notNull().defaultNow(),
        expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
    },
    (table) => [index("login_attempts_expires_idx").on(table.expiresAt)]
);

/**
 * Zugangstoken fuer die REST-API.
 *
 * Gleiches Muster wie bei Sitzungen: gespeichert wird nur der sha256-Hash,
 * der Klartext wird genau einmal beim Anlegen angezeigt. Die Scopes sind
 * dieselben Berechtigungsschluessel wie im Portal -- es gibt bewusst kein
 * zweites Berechtigungsmodell.
 */
export const apiTokens = pgTable(
    "api_tokens",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        name: text("name").notNull(),
        tokenHash: text("token_hash").notNull(),
        /** Sichtbarer Anfang des Tokens, damit man es in der Liste wiedererkennt. */
        prefix: text("prefix").notNull(),
        scopes: text("scopes").array().notNull().default([]),
        createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
        createdByName: text("created_by_name"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        expiresAt: timestamp("expires_at", { withTimezone: true }),
        lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
        revokedAt: timestamp("revoked_at", { withTimezone: true })
    },
    (table) => [uniqueIndex("api_tokens_hash_unique").on(table.tokenHash)]
);

// ---------------------------------------------------------------------------
// Beziehungen (fuer die relationale Abfrage-API von Drizzle)
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
    roles: many(userRoles),
    members: many(userMembers),
    sessions: many(sessions)
}));

export const rolesRelations = relations(roles, ({ many }) => ({
    users: many(userRoles)
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
    user: one(users, { fields: [userRoles.userId], references: [users.id] }),
    role: one(roles, { fields: [userRoles.roleId], references: [roles.id] })
}));

export const userMembersRelations = relations(userMembers, ({ one }) => ({
    user: one(users, { fields: [userMembers.userId], references: [users.id] })
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
    user: one(users, { fields: [sessions.userId], references: [users.id] })
}));
