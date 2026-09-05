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
import { files } from "./members";

/**
 * Ordner, Dokumente und Freigaben.
 *
 * Ersetzt die leere Platzhalterseite unter /intern/downloads. Ein Ordner ist
 * sichtbar, wenn eine Freigabe auf eine Gruppe des Benutzers, ein Amt, das er
 * innehat, eine seiner Rollen oder ihn selbst zeigt -- oder wenn er
 * `files.manage` stammesweit haelt.
 *
 * `folder_shares` und `event_shares` haben denselben Zuschnitt und werden von
 * derselben Aufloesung bedient ($lib/server/shareService). Bewusst ZWEI
 * Tabellen statt einer gemeinsamen mit Typspalte: so traegt jede ihren
 * eigenen Fremdschluessel, und eine geloeschte Zeile nimmt ihre Freigaben
 * zuverlaessig mit.
 */

/**
 * Woran eine Freigabe haengt.
 *
 * group    -- alle Mitglieder einer Meute oder Sippe
 * position -- die Inhaber eines Amts ("Kassenwart", "Stammesfuehrung")
 * role     -- alle, die eine Rolle tragen
 * user     -- eine einzelne Person
 */
export const shareTarget = pgEnum("share_target", ["group", "position", "role", "user"]);

export const folders = pgTable(
    "folders",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        name: text("name").notNull(),
        description: text("description").notNull().default(""),
        /**
         * Unterordner erben die Freigaben des Elternordners; eigene kommen
         * hinzu. ON DELETE CASCADE: ein geloeschter Ordner nimmt seine
         * Unterordner mit -- alles andere hinterliesse unerreichbare Zweige.
         */
        parentId: uuid("parent_id").references((): any => folders.id, { onDelete: "cascade" }),
        createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
    },
    (table) => [index("folders_parent_idx").on(table.parentId), index("folders_name_idx").on(table.name)]
);

export const documents = pgTable(
    "documents",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        folderId: uuid("folder_id")
            .notNull()
            .references(() => folders.id, { onDelete: "cascade" }),
        /**
         * ON DELETE RESTRICT waere hier falsch: ein Dokument OHNE Datei ist
         * wertlos, also faellt es mit. Der Eintrag in `files` wiederum wird
         * ueber documentService geloescht, damit auch das Objekt oben
         * verschwindet -- ein reiner Datenbank-CASCADE wuerde es liegen
         * lassen.
         */
        fileId: uuid("file_id")
            .notNull()
            .references(() => files.id, { onDelete: "cascade" }),
        title: text("title").notNull(),
        description: text("description").notNull().default(""),
        createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [
        index("documents_folder_idx").on(table.folderId),
        index("documents_file_idx").on(table.fileId)
    ]
);

export const folderShares = pgTable(
    "folder_shares",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        folderId: uuid("folder_id")
            .notNull()
            .references(() => folders.id, { onDelete: "cascade" }),
        targetKind: shareTarget("target_kind").notNull(),
        /**
         * Zeigt je nach targetKind auf groups.id, positions.id, roles.id oder
         * users.id. Ein Fremdschluessel ist deshalb nicht moeglich; verwaiste
         * Freigaben raeumt documentService beim Lesen weg, indem es nur
         * auflöst, was es findet.
         */
        targetId: uuid("target_id").notNull(),
        /** true: darf in diesem Ordner auch hochladen. */
        canWrite: boolean("can_write").notNull().default(false),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [
        unique("folder_shares_unique").on(table.folderId, table.targetKind, table.targetId),
        index("folder_shares_target_idx").on(table.targetKind, table.targetId)
    ]
);

export const foldersRelations = relations(folders, ({ many, one }) => ({
    parent: one(folders, {
        fields: [folders.parentId],
        references: [folders.id],
        relationName: "folderParent"
    }),
    children: many(folders, { relationName: "folderParent" }),
    documents: many(documents),
    shares: many(folderShares)
}));

export const documentsRelations = relations(documents, ({ one }) => ({
    folder: one(folders, { fields: [documents.folderId], references: [folders.id] }),
    file: one(files, { fields: [documents.fileId], references: [files.id] })
}));

export const folderSharesRelations = relations(folderShares, ({ one }) => ({
    folder: one(folders, { fields: [folderShares.folderId], references: [folders.id] })
}));
