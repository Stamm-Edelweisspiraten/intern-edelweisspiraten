import { relations } from "drizzle-orm";
import {
    boolean,
    index,
    integer,
    pgTable,
    text,
    timestamp,
    unique,
    uuid
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { files } from "./members";
import { shareTarget } from "./files";
import { events } from "./events";

/**
 * Galerien und Bilder.
 *
 * Aufbau wie bei Ordner/Dokument: ein Kopf mit Freigaben, darunter die
 * Eintraege, deren Inhalt in `files` liegt (und damit im Objektspeicher).
 * Vier Punkte weichen bewusst ab und sind der Grund fuer diesen Kommentar:
 *
 *   1. `file_id` traegt ON DELETE RESTRICT, nicht CASCADE.
 *      Bei `documents` ist es CASCADE, und der Kommentar dort nennt schon das
 *      Problem: ein direktes `DELETE FROM files` nimmt die Zeile still mit und
 *      laesst das Objekt oben liegen. RESTRICT dreht das um -- geloescht wird
 *      immer ueber `galleryService`, und der raeumt Zeile UND Objekt ab.
 *
 *   2. `event_id` traegt ON DELETE SET NULL.
 *      CASCADE waere hier gefaehrlich: ein geloeschter Termin wuerde die
 *      ganze Galerie samt Bildzeilen aus der Datenbank entfernen, waehrend die
 *      Objekte im Bucket zurueckblieben. So verliert die Galerie nur ihren
 *      Terminbezug.
 *
 *   3. `cover_image_id` hat KEINEN Fremdschluessel.
 *      Er zeigte auf `gallery_images`, das seinerseits auf `galleries` zeigt --
 *      ein Zirkelbezug, den Drizzle nur mit einem nachtraeglichen ALTER
 *      aufloesen koennte. Stattdessen zieht `galleryService` das Titelbild
 *      beim Lesen und beim Loeschen eines Bildes nach.
 *
 *   4. `thumb_file_id` ist optional.
 *      Das Vorschaubild entsteht im Browser vor dem Hochladen. Ohne
 *      JavaScript kommt keines an; die Anzeige faellt dann auf das Original
 *      zurueck, und die Galerie funktioniert trotzdem.
 */

export const galleries = pgTable(
    "galleries",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        title: text("title").notNull(),
        description: text("description").notNull().default(""),
        eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
        /** Siehe Punkt 3 im Kopfkommentar: bewusst ohne Fremdschluessel. */
        coverImageId: uuid("cover_image_id"),
        createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
    },
    (table) => [
        index("galleries_event_idx").on(table.eventId),
        index("galleries_created_idx").on(table.createdAt)
    ]
);

export const galleryImages = pgTable(
    "gallery_images",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        galleryId: uuid("gallery_id")
            .notNull()
            .references(() => galleries.id, { onDelete: "cascade" }),
        /** Das Original. RESTRICT -- siehe Punkt 1 im Kopfkommentar. */
        fileId: uuid("file_id")
            .notNull()
            .references(() => files.id, { onDelete: "restrict" }),
        /** Das Vorschaubild, falls der Browser eines erzeugt hat. */
        thumbFileId: uuid("thumb_file_id").references(() => files.id, { onDelete: "set null" }),
        caption: text("caption").notNull().default(""),
        /** Reihenfolge in der Galerie, lueckenlos ab 0. */
        position: integer("position").notNull().default(0),
        /** Abmessungen des Originals, fuer ein stabiles Raster ohne Nachladen. */
        width: integer("width"),
        height: integer("height"),
        uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [
        index("gallery_images_gallery_idx").on(table.galleryId, table.position),
        index("gallery_images_file_idx").on(table.fileId)
    ]
);

export const galleryShares = pgTable(
    "gallery_shares",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        galleryId: uuid("gallery_id")
            .notNull()
            .references(() => galleries.id, { onDelete: "cascade" }),
        targetKind: shareTarget("target_kind").notNull(),
        /**
         * Zeigt je nach targetKind auf groups.id, positions.id, roles.id oder
         * users.id -- ein Fremdschluessel ist deshalb nicht moeglich.
         */
        targetId: uuid("target_id").notNull(),
        /** true: darf in diese Galerie auch hochladen. */
        canWrite: boolean("can_write").notNull().default(false),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [
        unique("gallery_shares_unique").on(table.galleryId, table.targetKind, table.targetId),
        index("gallery_shares_target_idx").on(table.targetKind, table.targetId)
    ]
);

export const galleriesRelations = relations(galleries, ({ many, one }) => ({
    images: many(galleryImages),
    shares: many(galleryShares),
    event: one(events, { fields: [galleries.eventId], references: [events.id] })
}));

export const galleryImagesRelations = relations(galleryImages, ({ one }) => ({
    gallery: one(galleries, { fields: [galleryImages.galleryId], references: [galleries.id] }),
    file: one(files, { fields: [galleryImages.fileId], references: [files.id] })
}));

export const gallerySharesRelations = relations(galleryShares, ({ one }) => ({
    gallery: one(galleries, { fields: [galleryShares.galleryId], references: [galleries.id] })
}));
