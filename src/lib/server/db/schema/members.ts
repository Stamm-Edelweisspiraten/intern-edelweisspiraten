import { relations } from "drizzle-orm";
import {
    boolean,
    customType,
    index,
    integer,
    jsonb,
    pgEnum,
    pgTable,
    primaryKey,
    text,
    timestamp,
    uniqueIndex,
    uuid
} from "drizzle-orm/pg-core";
import { roles } from "./auth";

/**
 * Mitglieder, Gruppen und Aemter.
 *
 * Die Mehrfachfelder (E-Mail, Telefon, Gruppen, Amtsinhaber) waren in
 * MongoDB eingebettete Arrays und wurden beim Lesen von Hand umgeschrieben,
 * weil aeltere Datensaetze noch die Einzelfelder `group` und `memberId`
 * benutzten. Beides entfaellt: es sind jetzt eigene Tabellen.
 */

/** Binaerinhalt einer Datei. Node liefert und erwartet einen Buffer. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
    dataType: () => "bytea"
});

export const groupType = pgEnum("group_type", ["sippe", "meute"]);
export const positionType = pgEnum("position_type", ["amt", "gruppenleiter"]);
export const memberLogAction = pgEnum("member_log_action", ["create", "update", "delete"]);
export const memberFileKind = pgEnum("member_file_kind", ["consent", "application"]);

/**
 * Dateiablage.
 *
 * Ersetzt den GridFS-Bucket "member_uploads". Der Inhalt liegt an genau
 * einer von zwei Stellen:
 *
 *   storageKey gesetzt -> im Objektspeicher (S3 oder kompatibel)
 *   content    gesetzt -> in dieser Spalte
 *
 * `content` ist deshalb nullbar geworden. Die Datenbankablage bleibt der
 * Rueckfall: ein Stamm ohne eigenen Objektspeicher soll das Portal weiter
 * ohne zweites System betreiben koennen. Der Umzug nach oben laeuft im
 * Adminbereich per Knopfdruck und ist wiederholbar.
 */
export const files = pgTable(
    "files",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        filename: text("filename").notNull(),
        contentType: text("content_type").notNull(),
        size: integer("size").notNull(),
        content: bytea("content"),
        /** Objektschluessel; null bedeutet: der Inhalt steht in content. */
        storageKey: text("storage_key"),
        uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
        uploadedBy: text("uploaded_by")
    },
    // Der Umzug sucht genau nach den Zeilen, die noch unten liegen.
    (table) => [index("files_storage_key_idx").on(table.storageKey)]
);

export const groups = pgTable(
    "groups",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        name: text("name").notNull(),
        type: groupType("type").notNull().default("sippe"),
        /** Freitext, z. B. "Montag 16:30 Uhr". */
        meetingTime: text("meeting_time").notNull().default(""),
        description: text("description").notNull().default(""),
        replyTo: text("reply_to").notNull().default(""),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
    },
    (table) => [index("groups_name_idx").on(table.name)]
);

export const members = pgTable(
    "members",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        firstname: text("firstname").notNull(),
        lastname: text("lastname").notNull(),
        fahrtenname: text("fahrtenname").notNull().default(""),
        /** Als Zeichenkette im Format JJJJ-MM-TT, wie im Formular. */
        birthday: text("birthday").notNull().default(""),
        street: text("street").notNull().default(""),
        zip: text("zip").notNull().default(""),
        city: text("city").notNull().default(""),
        /** Pfadfinderische Stufe. */
        stand: text("stand").notNull().default(""),
        status: text("status").notNull().default("aktiv"),
        entryDate: text("entry_date").notNull().default(""),
        isSecondMember: boolean("is_second_member").notNull().default(false),

        /** Welche Beitragsanteile das Mitglied schuldet. */
        duesStamm: boolean("dues_stamm").notNull().default(true),
        duesGau: boolean("dues_gau").notNull().default(true),
        duesLandesmark: boolean("dues_landesmark").notNull().default(true),
        duesBund: boolean("dues_bund").notNull().default(true),

        consentSocialMedia: boolean("consent_social_media").notNull().default(false),
        consentWebsite: boolean("consent_website").notNull().default(false),
        consentPrint: boolean("consent_print").notNull().default(false),

        consentFileId: uuid("consent_file_id").references(() => files.id, { onDelete: "set null" }),
        applicationFileId: uuid("application_file_id").references(() => files.id, {
            onDelete: "set null"
        }),

        /** Sechsstelliger Einladungscode fuer die Selbstregistrierung. */
        inviteCode: text("invite_code"),
        inviteCodeIssuedAt: timestamp("invite_code_issued_at", { withTimezone: true }),
        inviteCodeExpiresAt: timestamp("invite_code_expires_at", { withTimezone: true }),

        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
        updatedBy: text("updated_by").notNull().default("system")
    },
    (table) => [
        uniqueIndex("members_invite_code_unique").on(table.inviteCode),
        index("members_name_idx").on(table.lastname, table.firstname),
        index("members_status_idx").on(table.status)
    ]
);

export const memberEmails = pgTable(
    "member_emails",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        memberId: uuid("member_id")
            .notNull()
            .references(() => members.id, { onDelete: "cascade" }),
        label: text("label").notNull().default(""),
        email: text("email").notNull(),
        position: integer("position").notNull().default(0)
    },
    (table) => [
        index("member_emails_member_idx").on(table.memberId),
        index("member_emails_email_idx").on(table.email)
    ]
);

export const memberPhones = pgTable(
    "member_phones",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        memberId: uuid("member_id")
            .notNull()
            .references(() => members.id, { onDelete: "cascade" }),
        label: text("label").notNull().default(""),
        number: text("number").notNull(),
        position: integer("position").notNull().default(0)
    },
    (table) => [index("member_phones_member_idx").on(table.memberId)]
);

export const memberGroups = pgTable(
    "member_groups",
    {
        memberId: uuid("member_id")
            .notNull()
            .references(() => members.id, { onDelete: "cascade" }),
        groupId: uuid("group_id")
            .notNull()
            .references(() => groups.id, { onDelete: "cascade" })
    },
    (table) => [
        primaryKey({ columns: [table.memberId, table.groupId] }),
        index("member_groups_group_idx").on(table.groupId)
    ]
);

export const memberLogs = pgTable(
    "member_logs",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        /**
         * Bewusst ohne Fremdschluessel: das Protokoll muss die Loeschung des
         * Mitglieds ueberdauern, sonst waere gerade der Loescheintrag der
         * erste, der verschwindet.
         */
        memberId: uuid("member_id").notNull(),
        action: memberLogAction("action").notNull(),
        changes: jsonb("changes")
            .$type<{ field: string; before: unknown; after: unknown }[]>()
            .notNull()
            .default([]),
        user: text("user").notNull().default("system"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [index("member_logs_member_idx").on(table.memberId, table.createdAt)]
);

/**
 * Aemter.
 *
 * Ein Amt traegt jetzt eine Rolle: wer es innehat, bekommt deren Rechte --
 * bei einem Amt mit `groupId` nur fuer diese Gruppe. Damit sind
 * "Gruppenleitung Meute Wildkatzen" und "Stammesfuehrung" gewoehnliche
 * Aemter und brauchen keine Sonderbehandlung mehr.
 *
 * Vorher trug ein Amt keinerlei Rechte. Der einzige Effekt im ganzen
 * Projekt war `type = "gruppenleiter"` plus `groupId`, woraus eine einzige
 * Funktion die erlaubten Gruppen ableitete. Der Typ bleibt als Beschriftung
 * erhalten, entscheidend ist jetzt allein, ob eine Gruppe hinterlegt ist.
 */
export const positions = pgTable(
    "positions",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        name: text("name").notNull(),
        email: text("email").notNull().default(""),
        description: text("description").notNull().default(""),
        type: positionType("type").notNull().default("amt"),
        /** Gesetzt, wenn das Amt sich auf eine Gruppe bezieht. */
        groupId: uuid("group_id").references(() => groups.id, { onDelete: "set null" }),
        /**
         * Rechte, die mit dem Amt einhergehen. Ohne Rolle ist das Amt rein
         * beschreibend -- ein Eintrag im Impressum des Stamms, mehr nicht.
         */
        roleId: uuid("role_id").references(() => roles.id, { onDelete: "set null" }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
    },
    (table) => [
        index("positions_type_idx").on(table.type),
        index("positions_group_idx").on(table.groupId),
        index("positions_role_idx").on(table.roleId)
    ]
);

export const positionMembers = pgTable(
    "position_members",
    {
        positionId: uuid("position_id")
            .notNull()
            .references(() => positions.id, { onDelete: "cascade" }),
        memberId: uuid("member_id")
            .notNull()
            .references(() => members.id, { onDelete: "cascade" })
    },
    (table) => [
        primaryKey({ columns: [table.positionId, table.memberId] }),
        index("position_members_member_idx").on(table.memberId)
    ]
);

// ---------------------------------------------------------------------------
// Beziehungen
// ---------------------------------------------------------------------------

export const membersRelations = relations(members, ({ many, one }) => ({
    emails: many(memberEmails),
    phones: many(memberPhones),
    groups: many(memberGroups),
    positions: many(positionMembers),
    consentFile: one(files, {
        fields: [members.consentFileId],
        references: [files.id],
        relationName: "consentFile"
    }),
    applicationFile: one(files, {
        fields: [members.applicationFileId],
        references: [files.id],
        relationName: "applicationFile"
    })
}));

export const memberEmailsRelations = relations(memberEmails, ({ one }) => ({
    member: one(members, { fields: [memberEmails.memberId], references: [members.id] })
}));

export const memberPhonesRelations = relations(memberPhones, ({ one }) => ({
    member: one(members, { fields: [memberPhones.memberId], references: [members.id] })
}));

export const groupsRelations = relations(groups, ({ many }) => ({
    members: many(memberGroups),
    positions: many(positions)
}));

export const memberGroupsRelations = relations(memberGroups, ({ one }) => ({
    member: one(members, { fields: [memberGroups.memberId], references: [members.id] }),
    group: one(groups, { fields: [memberGroups.groupId], references: [groups.id] })
}));

export const positionsRelations = relations(positions, ({ many, one }) => ({
    members: many(positionMembers),
    group: one(groups, { fields: [positions.groupId], references: [groups.id] })
}));

export const positionMembersRelations = relations(positionMembers, ({ one }) => ({
    position: one(positions, { fields: [positionMembers.positionId], references: [positions.id] }),
    member: one(members, { fields: [positionMembers.memberId], references: [members.id] })
}));
