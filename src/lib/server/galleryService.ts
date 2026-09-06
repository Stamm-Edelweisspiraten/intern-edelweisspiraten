import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, withTransaction } from "$lib/server/db";
import { isUuid, onlyUuids } from "$lib/server/db/ids";
import { events, files, galleries, galleryImages, galleryShares } from "$lib/server/db/schema";
import { deleteFile, MAX_FILE_BYTES, storeFile } from "$lib/server/fileStore";
import { checkUpload } from "$lib/server/files/mime";
import {
    matchesTargets,
    resolveShareTargets,
    resolveTargetNames,
    sharesGrantGroupScope,
    type ShareTargetKind
} from "$lib/server/shareService";

/**
 * Galerien und ihre Bilder.
 *
 * Sichtbarkeit wie bei Ordnern und Terminen: eine Galerie ohne jede Freigabe
 * ist fuer alle bestimmt, sonst zaehlt die Freigabe auf Gruppe, Amt, Rolle
 * oder Person. Wer `gallery.manage` haelt, sieht sie ohnehin -- bei einem
 * gruppengebundenen Recht allerdings nur, wenn eine Freigabe auf eine dieser
 * Gruppen zeigt (`sharesGrantGroupScope`, bewusst unsymmetrisch).
 *
 * Der eigentliche Grund fuer diese Datei ist aber die Reihenfolge beim
 * Schreiben und Loeschen. Der Fremdschluessel `gallery_images.file_id` steht
 * auf ON DELETE RESTRICT (siehe Kopfkommentar des Schemas): die Datenbank
 * verweigert ein `DELETE FROM files`, solange eine Bildzeile darauf zeigt.
 * Damit ist erzwungen, dass immer dieser Dienst loescht -- und der raeumt
 * Zeile UND Objekt im Speicher ab. Praktische Regel, die in jedem Loeschpfad
 * hier steht:
 *
 *     erst die Bildzeile loeschen, dann `deleteFile()`. Nie umgekehrt.
 *
 * EXIF: das Original wird Byte fuer Byte abgelegt, wie es der Browser
 * geschickt hat. Aufnahmeort, Kameramodell und Zeitstempel bleiben also
 * erhalten und sind fuer jeden abrufbar, der das Bild sehen darf. Das
 * Vorschaubild entsteht ueber ein `<canvas>` und traegt diese Daten nicht --
 * wer sie los werden will, muss das Original vor dem Hochladen bereinigen.
 */

/**
 * Was in eine Galerie darf.
 *
 * Nur Bilder, und nur solche mit eindeutiger Signatur. `image/svg+xml` fehlt
 * mit Absicht: ein SVG ist ein XML-Dokument mit Skriptfaehigkeit, und der
 * Objektspeicher liefert es unter SEINEM Ursprung aus -- die Schutzkopfzeilen
 * dieser Anwendung greifen dort nicht mehr. Die Endung steht ohnehin auf der
 * Sperrliste in `$lib/server/files/mime`.
 */
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/**
 * Obergrenze fuer das im Browser erzeugte Vorschaubild.
 *
 * ACHTUNG BETRIEB: Original (hoechstens `MAX_FILE_BYTES`, also 10 MB) +
 * Vorschaubild + der Aufschlag der multipart-Kodierung muessen zusammen unter
 * `BODY_SIZE_LIMIT=12M` bleiben. Wer `MAX_FILE_BYTES` anhebt, muss auch
 * `BODY_SIZE_LIMIT` anheben -- sonst antwortet `adapter-node` selbst mit 413
 * und diese Anwendung wird gar nicht erst erreicht.
 */
export const MAX_THUMB_BYTES = 512 * 1024;

/**
 * Abstand zwischen zwei Bildern in der Sortierung.
 *
 * Nicht 1: mit Luft dazwischen laesst sich ein Bild spaeter dazwischen
 * schieben, ohne alle folgenden neu zu numerieren. Die Spalte traegt bewusst
 * keine Eindeutigkeit -- zwei gleichzeitige Uploads duerfen dieselbe Position
 * bekommen, die Anzeige sortiert dann nach dem Anlagezeitpunkt weiter.
 */
const POSITION_STEP = 100;

export interface GalleryShare {
    id: string;
    targetKind: ShareTargetKind;
    targetId: string;
    targetName: string;
    /** true: in diese Galerie darf dieses Ziel auch hochladen. */
    canWrite: boolean;
}

export interface GalleryImageEntry {
    id: string;
    galleryId: string;
    caption: string;
    position: number;
    fileId: string;
    thumbFileId: string | null;
    filename: string;
    contentType: string;
    size: number;
    width: number | null;
    height: number | null;
    createdAt: Date;
}

export interface GalleryEntry {
    id: string;
    title: string;
    description: string;
    eventId: string | null;
    eventTitle: string | null;
    /** Das ausdruecklich gesetzte Titelbild -- kann ins Leere zeigen. */
    coverImageId: string | null;
    /** Titelbild, sonst das erste Bild, sonst null. */
    coverImageResolved: string | null;
    imageCount: number;
    /** Original und Vorschaubild zusammen -- beides belegt Speicher. */
    totalBytes: number;
    shares: GalleryShare[];
    createdAt: Date;
}

export interface GalleryInput {
    title: string;
    description?: string;
    eventId?: string | null;
}

interface Viewer {
    id?: string;
    memberIds?: string[];
}

interface AccessOptions {
    /** `gallery.manage` stammesweit: sieht und verwaltet alles. */
    manageAll?: boolean;
    /**
     * Gruppen, fuer die der Betrachter `gallery.manage` haelt -- genau der
     * Rueckgabewert von `groupsWithPermission()`. `null` heisst stammesweit.
     */
    manageGroups?: string[] | null;
}

// ---------------------------------------------------------------------------
// Reine Helfer -- ohne Datenbank, damit sie einen Unit-Test bekommen
// ---------------------------------------------------------------------------

/**
 * Die naechste freie Position.
 *
 * Leere Galerie: 0. Sonst das Maximum plus ein Schritt -- bewusst nicht
 * "Anzahl + 1", weil die Positionen nach dem Loeschen eines Bildes Luecken
 * haben und die Zaehlung dann eine bereits belegte Position lieferte.
 */
export function nextPosition(existing: number[]): number {
    if (existing.length === 0) return 0;
    return Math.max(...existing) + POSITION_STEP;
}

/**
 * Eine eingereichte Reihenfolge auf die tatsaechlich vorhandenen Bilder
 * abbilden.
 *
 * Zwei Faelle, die ein Formular aus einem anderen Browserfenster erzeugt:
 *
 *   - Eingereichte Kennungen, die nicht (mehr) zur Galerie gehoeren, fallen
 *     raus. Sonst liesse sich ein fremdes Bild ueber das Formular in eine
 *     andere Galerie hineinsortieren.
 *   - Bekannte Kennungen, die im Formular FEHLEN, werden in ihrer bisherigen
 *     Reihenfolge hinten angehaengt. Ein veraltetes Formular darf keine
 *     Bilder aus der Sortierung verschwinden lassen -- sie waeren danach
 *     zwar noch da, aber ihre Position waere Zufall.
 */
export function renumber(submitted: string[], known: string[]): { id: string; position: number }[] {
    const knownSet = new Set(known);
    const seen = new Set<string>();
    const order: string[] = [];

    for (const id of submitted) {
        if (!knownSet.has(id) || seen.has(id)) continue;
        seen.add(id);
        order.push(id);
    }

    for (const id of known) {
        if (seen.has(id)) continue;
        seen.add(id);
        order.push(id);
    }

    return order.map((id, index) => ({ id, position: index * POSITION_STEP }));
}

/**
 * Welches Bild ist das Titelbild?
 *
 * `cover_image_id` traegt keinen Fremdschluessel (Zirkelbezug, siehe Schema),
 * kann also ins Leere zeigen -- etwa wenn das Bild ueber einen anderen Weg
 * verschwunden ist. Dann faellt die Anzeige auf das erste Bild zurueck statt
 * auf eine leere Kachel.
 */
export function pickCover(
    coverImageId: string | null,
    images: { id: string; position: number }[]
): string | null {
    if (images.length === 0) return null;
    if (coverImageId && images.some((image) => image.id === coverImageId)) return coverImageId;

    let first = images[0];
    for (const image of images) {
        if (image.position < first.position) first = image;
    }
    return first.id;
}

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

interface ShareRow {
    id: string;
    galleryId: string;
    targetKind: ShareTargetKind;
    targetId: string;
    canWrite: boolean;
}

/**
 * Galerien laden, filtern und zusammensetzen.
 *
 * Vier Abfragen unabhaengig von der Anzahl: Galerien (mit Termintitel),
 * Freigaben, Bilder und die Namen der Freigabeziele. Die Sichtbarkeit wird
 * danach im Speicher entschieden -- als SQL waere sie eine Kette aus vier
 * ODER-Zweigen ueber drei Zuordnungstabellen, und der Bestand eines Stamms
 * ist klein.
 *
 * Die Bilder werden mit id, Position und Groesse geladen: daraus entstehen
 * Anzahl, Speicherbedarf UND das Titelbild in einem Durchgang.
 */
async function loadGalleries(
    viewer: Viewer,
    options: AccessOptions & { eventId?: string; only?: string } = {}
): Promise<GalleryEntry[]> {
    const conditions = [];

    if (options.only !== undefined) {
        if (!isUuid(options.only)) return [];
        conditions.push(eq(galleries.id, options.only));
    }
    if (options.eventId !== undefined) {
        if (!isUuid(options.eventId)) return [];
        conditions.push(eq(galleries.eventId, options.eventId));
    }

    const [rows, targets] = await Promise.all([
        db
            .select({
                id: galleries.id,
                title: galleries.title,
                description: galleries.description,
                eventId: galleries.eventId,
                eventTitle: events.title,
                coverImageId: galleries.coverImageId,
                createdAt: galleries.createdAt
            })
            .from(galleries)
            .leftJoin(events, eq(events.id, galleries.eventId))
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(galleries.createdAt)),
        resolveShareTargets(viewer)
    ]);

    if (rows.length === 0) return [];

    const galleryIds = rows.map((row) => row.id);

    const shareRows: ShareRow[] = await db
        .select({
            id: galleryShares.id,
            galleryId: galleryShares.galleryId,
            targetKind: galleryShares.targetKind,
            targetId: galleryShares.targetId,
            canWrite: galleryShares.canWrite
        })
        .from(galleryShares)
        .where(inArray(galleryShares.galleryId, galleryIds));

    const sharesByGallery = new Map<string, ShareRow[]>();
    for (const share of shareRows) {
        const list = sharesByGallery.get(share.galleryId) ?? [];
        list.push(share);
        sharesByGallery.set(share.galleryId, list);
    }

    const visible = rows.filter((row) => {
        const shares = sharesByGallery.get(row.id) ?? [];
        if (options.manageAll === true) return true;
        // Ohne Freigabe: fuer alle bestimmt.
        if (shares.length === 0) return true;
        if (shares.some((share) => matchesTargets(targets, share))) return true;
        // Wer verwalten darf, sieht die Galerie auch ohne eigene Freigabe.
        return sharesGrantGroupScope(shares, options.manageGroups ?? []);
    });

    if (visible.length === 0) return [];

    const visibleIds = visible.map((row) => row.id);
    const thumbFiles = alias(files, "thumb_files");

    const [imageRows, targetNames] = await Promise.all([
        db
            .select({
                id: galleryImages.id,
                galleryId: galleryImages.galleryId,
                position: galleryImages.position,
                size: files.size,
                thumbSize: thumbFiles.size
            })
            .from(galleryImages)
            .innerJoin(files, eq(files.id, galleryImages.fileId))
            .leftJoin(thumbFiles, eq(thumbFiles.id, galleryImages.thumbFileId))
            .where(inArray(galleryImages.galleryId, visibleIds))
            .orderBy(asc(galleryImages.position), asc(galleryImages.createdAt)),
        resolveTargetNames(shareRows.filter((share) => visibleIds.includes(share.galleryId)))
    ]);

    const imagesByGallery = new Map<string, { id: string; position: number }[]>();
    const bytesByGallery = new Map<string, number>();

    for (const image of imageRows) {
        const list = imagesByGallery.get(image.galleryId) ?? [];
        list.push({ id: image.id, position: image.position });
        imagesByGallery.set(image.galleryId, list);

        const bytes = Number(image.size) + Number(image.thumbSize ?? 0);
        bytesByGallery.set(image.galleryId, (bytesByGallery.get(image.galleryId) ?? 0) + bytes);
    }

    return visible.map((row) => {
        const images = imagesByGallery.get(row.id) ?? [];

        return {
            id: row.id,
            title: row.title,
            description: row.description,
            eventId: row.eventId,
            eventTitle: row.eventTitle ?? null,
            coverImageId: row.coverImageId,
            coverImageResolved: pickCover(row.coverImageId, images),
            imageCount: images.length,
            totalBytes: bytesByGallery.get(row.id) ?? 0,
            shares: (sharesByGallery.get(row.id) ?? []).map((share) => ({
                id: share.id,
                targetKind: share.targetKind,
                targetId: share.targetId,
                targetName: targetNames.get(share.targetId) ?? "Unbekannt",
                canWrite: share.canWrite
            })),
            createdAt: row.createdAt
        };
    });
}

/** Alle fuer den Benutzer sichtbaren Galerien. */
export async function listGalleries(
    viewer: Viewer,
    options: AccessOptions & { eventId?: string } = {}
): Promise<GalleryEntry[]> {
    return loadGalleries(viewer, options);
}

/**
 * Eine einzelne Galerie, wenn sie sichtbar ist -- sonst null.
 *
 * Bewusst durch dieselbe Aufloesung wie die Uebersicht: ein direkt geratener
 * Link kommt damit nicht weiter als das Kachelraster.
 */
export async function getGallery(
    id: string,
    viewer: Viewer,
    options: AccessOptions = {}
): Promise<GalleryEntry | null> {
    if (!isUuid(id)) return null;
    const found = await loadGalleries(viewer, { ...options, only: id });
    return found[0] ?? null;
}

/**
 * Die Bilder einer Galerie in ihrer Reihenfolge.
 *
 * Der Anlagezeitpunkt ist das zweite Kriterium: die Position traegt keine
 * Eindeutigkeit, zwei gleichzeitige Uploads koennen dieselbe bekommen. Ohne
 * das zweite Kriterium waere ihre Reihenfolge von Abfrage zu Abfrage
 * verschieden.
 */
export async function listImages(galleryId: string): Promise<GalleryImageEntry[]> {
    if (!isUuid(galleryId)) return [];

    const rows = await db
        .select({
            id: galleryImages.id,
            galleryId: galleryImages.galleryId,
            caption: galleryImages.caption,
            position: galleryImages.position,
            fileId: galleryImages.fileId,
            thumbFileId: galleryImages.thumbFileId,
            width: galleryImages.width,
            height: galleryImages.height,
            createdAt: galleryImages.createdAt,
            filename: files.filename,
            contentType: files.contentType,
            size: files.size
        })
        .from(galleryImages)
        .innerJoin(files, eq(files.id, galleryImages.fileId))
        .where(eq(galleryImages.galleryId, galleryId))
        .orderBy(asc(galleryImages.position), asc(galleryImages.createdAt));

    return rows;
}

/** Ein einzelnes Bild samt seiner Galeriekennung -- fuer die Auslieferung. */
export async function getImage(id: string): Promise<GalleryImageEntry | null> {
    if (!isUuid(id)) return null;

    const [row] = await db
        .select({
            id: galleryImages.id,
            galleryId: galleryImages.galleryId,
            caption: galleryImages.caption,
            position: galleryImages.position,
            fileId: galleryImages.fileId,
            thumbFileId: galleryImages.thumbFileId,
            width: galleryImages.width,
            height: galleryImages.height,
            createdAt: galleryImages.createdAt,
            filename: files.filename,
            contentType: files.contentType,
            size: files.size
        })
        .from(galleryImages)
        .innerJoin(files, eq(files.id, galleryImages.fileId))
        .where(eq(galleryImages.id, id))
        .limit(1);

    return row ?? null;
}

/**
 * Darf dieser Benutzer die Galerie verwalten?
 *
 * `allowedGroups` ist der Rueckgabewert von `groupsWithPermission(event,
 * "gallery.manage")`. Die Regel steckt in `sharesGrantGroupScope` und ist
 * bewusst unsymmetrisch: eine Galerie ohne jede Freigabe ist fuer alle
 * sichtbar, aber fuer eine gruppengebundene Verwaltung nicht verwaltbar.
 */
export async function mayManageGallery(
    id: string,
    allowedGroups: string[] | null
): Promise<boolean> {
    if (!isUuid(id)) return false;
    if (allowedGroups === null) return true;
    if (allowedGroups.length === 0) return false;

    const shareRows = await db
        .select({ targetKind: galleryShares.targetKind, targetId: galleryShares.targetId })
        .from(galleryShares)
        .where(eq(galleryShares.galleryId, id));

    return sharesGrantGroupScope(shareRows, allowedGroups);
}

/**
 * Darf dieser Benutzer in die Galerie hochladen?
 *
 * Entschieden wird ueber `gallery_shares.can_write` -- dieselbe Mechanik wie
 * das Schreibrecht an einem Ordner. Eine Galerie OHNE jede Freigabe ist zwar
 * fuer alle sichtbar, aber niemand darf dort ablegen ausser einer
 * stammesweiten Verwaltung: sonst koennte jeder mit `gallery.upload` in jede
 * unfreigegebene Galerie schreiben, und "fuer alle sichtbar" waere
 * unversehens auch "von allen fuellbar".
 */
export async function canUploadTo(
    id: string,
    viewer: Viewer,
    options: { manageAll?: boolean } = {}
): Promise<boolean> {
    if (!isUuid(id)) return false;
    if (options.manageAll === true) return true;

    const [shareRows, targets] = await Promise.all([
        db
            .select({
                targetKind: galleryShares.targetKind,
                targetId: galleryShares.targetId,
                canWrite: galleryShares.canWrite
            })
            .from(galleryShares)
            .where(eq(galleryShares.galleryId, id)),
        resolveShareTargets(viewer)
    ]);

    return shareRows.some((share) => share.canWrite && matchesTargets(targets, share));
}

/** Wie viele Galerien haengen an diesem Termin? Fuer den Hinweis am Termin. */
export async function countGalleriesForEvent(eventId: string): Promise<number> {
    if (!isUuid(eventId)) return 0;

    const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(galleries)
        .where(eq(galleries.eventId, eventId));

    return Number(row?.count ?? 0);
}

// ---------------------------------------------------------------------------
// Galerie schreiben
// ---------------------------------------------------------------------------

export async function createGallery(
    input: GalleryInput,
    createdBy: string | null
): Promise<{ ok: boolean; id?: string; error?: string }> {
    const title = input.title.trim();
    if (!title) return { ok: false, error: "Bitte einen Titel für die Galerie angeben." };

    const [row] = await db
        .insert(galleries)
        .values({
            title,
            description: input.description?.trim() ?? "",
            eventId: isUuid(input.eventId) ? input.eventId : null,
            createdBy: isUuid(createdBy) ? createdBy : null
        })
        .returning({ id: galleries.id });

    return { ok: true, id: row.id };
}

/**
 * Titel, Beschreibung und Terminbezug aendern.
 *
 * Nur mitgeschickte Felder werden angefasst: das Titelbild und die Freigaben
 * kommen aus eigenen Formularen, und ein Speichern des Bearbeitungsformulars
 * darf sie nicht stillschweigend leeren.
 */
export async function updateGallery(
    id: string,
    input: Partial<GalleryInput>
): Promise<{ ok: boolean; error?: string }> {
    if (!isUuid(id)) return { ok: false, error: "Ungültige Kennung." };

    const update: Record<string, unknown> = { updatedAt: new Date() };

    if (input.title !== undefined) {
        const title = input.title.trim();
        if (!title) return { ok: false, error: "Der Titel darf nicht leer sein." };
        update.title = title;
    }
    if (input.description !== undefined) update.description = input.description.trim();
    if (input.eventId !== undefined) update.eventId = isUuid(input.eventId) ? input.eventId : null;

    await db.update(galleries).set(update).where(eq(galleries.id, id));
    return { ok: true };
}

/**
 * Loescht eine Galerie samt Bildern und Dateien.
 *
 * Genau das Muster von `documentService.deleteFolder`, hier aber Pflicht und
 * nicht nur guter Stil: `file_id` steht auf ON DELETE RESTRICT. Erst die
 * Kennungen einsammeln, dann die Galerie loeschen (die Bildzeilen fallen per
 * CASCADE mit), erst danach die Dateien. Andersherum verweigert die Datenbank
 * jedes `deleteFile`, und die Galerie bliebe stehen.
 */
export async function deleteGallery(id: string): Promise<{ ok: boolean; error?: string }> {
    if (!isUuid(id)) return { ok: false, error: "Ungültige Kennung." };

    const fileRows = await db
        .select({ fileId: galleryImages.fileId, thumbFileId: galleryImages.thumbFileId })
        .from(galleryImages)
        .where(eq(galleryImages.galleryId, id));

    const deleted = await db
        .delete(galleries)
        .where(eq(galleries.id, id))
        .returning({ id: galleries.id });

    if (deleted.length === 0) return { ok: false, error: "Die Galerie wurde nicht gefunden." };

    for (const row of fileRows) {
        await deleteFile(row.thumbFileId);
        await deleteFile(row.fileId);
    }

    return { ok: true };
}

export async function setGalleryShares(
    galleryId: string,
    shares: { targetKind: ShareTargetKind; targetId: string; canWrite: boolean }[]
): Promise<void> {
    if (!isUuid(galleryId)) return;

    await withTransaction(async (tx) => {
        await tx.delete(galleryShares).where(eq(galleryShares.galleryId, galleryId));

        const valid = shares.filter((share) => isUuid(share.targetId));
        if (valid.length === 0) return;

        await tx
            .insert(galleryShares)
            .values(
                valid.map((share) => ({
                    galleryId,
                    targetKind: share.targetKind,
                    targetId: share.targetId,
                    canWrite: share.canWrite
                }))
            )
            .onConflictDoNothing();
    });
}

/**
 * Setzt das Titelbild -- oder nimmt es weg (`null`).
 *
 * Geprueft wird, dass das Bild zu DIESER Galerie gehoert. Ohne den
 * Fremdschluessel (Zirkelbezug, siehe Schema) waere sonst jede beliebige
 * Kennung eintragbar, und die Uebersicht zeigte ein Bild aus einer Galerie,
 * die der Betrachter gar nicht sehen darf.
 */
export async function setCoverImage(
    galleryId: string,
    imageId: string | null
): Promise<{ ok: boolean; error?: string }> {
    if (!isUuid(galleryId)) return { ok: false, error: "Ungültige Kennung." };

    if (imageId !== null) {
        if (!isUuid(imageId)) return { ok: false, error: "Ungültige Bildkennung." };

        const [row] = await db
            .select({ id: galleryImages.id })
            .from(galleryImages)
            .where(and(eq(galleryImages.id, imageId), eq(galleryImages.galleryId, galleryId)))
            .limit(1);

        if (!row) return { ok: false, error: "Dieses Bild gehört nicht zu dieser Galerie." };
    }

    await db
        .update(galleries)
        .set({ coverImageId: imageId, updatedAt: new Date() })
        .where(eq(galleries.id, galleryId));

    return { ok: true };
}

// ---------------------------------------------------------------------------
// Bilder
// ---------------------------------------------------------------------------

function isFileLike(input: unknown): input is File {
    return (
        typeof input === "object" &&
        input !== null &&
        typeof (input as File).arrayBuffer === "function" &&
        typeof (input as File).size === "number"
    );
}

/**
 * Ein Dateiname, wie er in `Content-Disposition` erscheint.
 *
 * Pfadanteile fliegen raus -- nicht, weil daraus je ein Pfad gebaut wuerde
 * (der Objektschluessel entsteht allein aus der UUID), sondern damit der Name
 * beim Speichern im Browser nicht in ein anderes Verzeichnis zeigt.
 */
function sanitizeFilename(value: string | null | undefined, fallback: string): string {
    const cleaned = (value ?? "")
        .replace(/[\\/]+/g, "_")
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .replace(/^\.+/, "")
        .trim();

    return cleaned || fallback;
}

/**
 * Ein Bild in eine Galerie legen.
 *
 * Die Reihenfolge ist der Kern dieser Datei:
 *
 *   1. Original pruefen -- Groesse, dann `checkUpload` gegen die Positivliste
 *      UND die ersten Bytes. Das ist die EINZIGE Absicherung; die Pruefung im
 *      Browser ist Hoeflichkeit gegenueber dem Benutzer, kein Schutz.
 *   2. Vorschaubild pruefen, falls eines mitkam. Es stammt genauso aus dem
 *      Browser wie das Original und ist damit ebenfalls ungepruefte Eingabe --
 *      die Positivliste laeuft auch darueber. Scheitert es, wird es
 *      VERWORFEN und ohne weitergemacht: das Vorschaubild ist eine
 *      Beschleunigung, kein Bestandteil. Der Rueckfall auf das Original ist
 *      ohnehin der Weg ohne JavaScript.
 *   3. Original ablegen. `storeFile` raeumt bei einem Fehler seine eigene
 *      Zeile ab, der Fehler darf also einfach durch.
 *   4. Vorschaubild ablegen -- abgestuft, nicht ausgeglichen. Ein bereits
 *      abgelegtes Original wegzuwerfen, weil sein Vorschaubild scheiterte,
 *      waere das schlechtere Ergebnis.
 *   5. Zeile schreiben. Scheitert das, muessen BEIDE Dateien wieder weg:
 *      ohne Zeile ist keine von ihnen mehr erreichbar.
 */
export async function addImage(input: {
    galleryId: string;
    file: unknown;
    thumb?: unknown;
    caption?: string;
    width?: number;
    height?: number;
    uploadedBy: string | null;
}): Promise<{ ok: boolean; id?: string; error?: string; status?: number }> {
    if (!isUuid(input.galleryId)) {
        return { ok: false, error: "Ungültige Kennung.", status: 400 };
    }

    // --- 1. Original ------------------------------------------------------
    if (!isFileLike(input.file)) {
        return { ok: false, error: "Es wurde kein Bild ausgewählt.", status: 400 };
    }

    const upload = input.file;
    if (upload.size === 0) return { ok: false, error: "Das Bild ist leer.", status: 400 };
    if (upload.size > MAX_FILE_BYTES) {
        return { ok: false, error: "Das Bild ist zu groß (höchstens 10 MB).", status: 413 };
    }

    const buffer = Buffer.from(await upload.arrayBuffer());
    const filename = sanitizeFilename(upload.name, "bild");

    const check = checkUpload(
        { filename, declaredType: upload.type, content: buffer },
        ALLOWED_IMAGE_TYPES
    );
    if (!check.ok) return { ok: false, error: check.error, status: check.status };

    // --- 2. Vorschaubild --------------------------------------------------
    let thumbData: { filename: string; contentType: string; content: Buffer } | null = null;

    if (isFileLike(input.thumb) && input.thumb.size > 0) {
        const thumb = input.thumb;

        if (thumb.size > MAX_THUMB_BYTES) {
            console.warn("Vorschaubild zu groß, wird verworfen:", thumb.size);
        } else {
            const thumbName = sanitizeFilename(thumb.name, "vorschau");
            const thumbBuffer = Buffer.from(await thumb.arrayBuffer());
            const thumbCheck = checkUpload(
                { filename: thumbName, declaredType: thumb.type, content: thumbBuffer },
                ALLOWED_IMAGE_TYPES
            );

            if (thumbCheck.ok) {
                thumbData = {
                    filename: thumbName,
                    contentType: thumbCheck.contentType,
                    content: thumbBuffer
                };
            } else {
                console.warn("Vorschaubild abgewiesen, wird verworfen:", thumbCheck.error);
            }
        }
    }

    // --- 3. Original ablegen ----------------------------------------------
    const uploadedBy = isUuid(input.uploadedBy) ? input.uploadedBy : undefined;

    const fileId = await storeFile({
        filename,
        contentType: check.contentType,
        content: buffer,
        uploadedBy
    });

    // --- 4. Vorschaubild ablegen ------------------------------------------
    let thumbId: string | null = null;
    if (thumbData) {
        try {
            thumbId = await storeFile({ ...thumbData, uploadedBy });
        } catch (err) {
            console.warn("Vorschaubild konnte nicht abgelegt werden:", err);
            thumbId = null;
        }
    }

    // --- 5. Zeile schreiben -----------------------------------------------
    try {
        const [row] = await db
            .insert(galleryImages)
            .values({
                galleryId: input.galleryId,
                fileId,
                thumbFileId: thumbId,
                caption: input.caption?.trim() ?? "",
                width: Number.isFinite(input.width) ? Math.round(input.width!) : null,
                height: Number.isFinite(input.height) ? Math.round(input.height!) : null,
                uploadedBy: isUuid(input.uploadedBy) ? input.uploadedBy : null,
                /**
                 * Das Maximum wird als Unterabfrage IN DERSELBEN Anweisung
                 * gelesen. Zwei gleichzeitige Uploads lesen so nicht erst
                 * beide dasselbe Maximum und schreiben es danach zurueck.
                 */
                position: sql`coalesce((select max(${galleryImages.position}) + ${POSITION_STEP} from ${galleryImages} where ${galleryImages.galleryId} = ${input.galleryId}), 0)`
            })
            .returning({ id: galleryImages.id });

        return { ok: true, id: row.id };
    } catch (err) {
        // Ohne Zeile sind beide Dateien unerreichbar -- also wieder weg damit.
        await deleteFile(thumbId);
        await deleteFile(fileId);
        throw err;
    }
}

export async function updateImage(
    id: string,
    input: { caption?: string }
): Promise<{ ok: boolean; error?: string }> {
    if (!isUuid(id)) return { ok: false, error: "Ungültige Kennung." };
    if (input.caption === undefined) return { ok: true };

    const rows = await db
        .update(galleryImages)
        .set({ caption: input.caption.trim() })
        .where(eq(galleryImages.id, id))
        .returning({ id: galleryImages.id });

    if (rows.length === 0) return { ok: false, error: "Das Bild wurde nicht gefunden." };
    return { ok: true };
}

/**
 * Loescht ein Bild samt Original und Vorschaubild.
 *
 * Erst die Zeile (RESTRICT laesst die Dateien sonst nicht los), dann das
 * Titelbild nachziehen, falls es auf genau dieses Bild zeigte -- der
 * Fremdschluessel dafuer fehlt bewusst, also raeumt der Dienst auf. Zuletzt
 * die beiden Dateien.
 */
export async function deleteImage(id: string): Promise<{ ok: boolean; error?: string }> {
    if (!isUuid(id)) return { ok: false, error: "Ungültige Kennung." };

    const [row] = await db
        .delete(galleryImages)
        .where(eq(galleryImages.id, id))
        .returning({
            galleryId: galleryImages.galleryId,
            fileId: galleryImages.fileId,
            thumbFileId: galleryImages.thumbFileId
        });

    if (!row) return { ok: false, error: "Das Bild wurde nicht gefunden." };

    await db
        .update(galleries)
        .set({ coverImageId: null })
        .where(and(eq(galleries.id, row.galleryId), eq(galleries.coverImageId, id)));

    await deleteFile(row.thumbFileId);
    await deleteFile(row.fileId);

    return { ok: true };
}

/**
 * Ein Bild um einen Platz nach vorn oder hinten.
 *
 * Getauscht wird ueber die vollstaendige, sortierte Liste und nicht ueber
 * zwei Positionswerte: die Spalte traegt keine Eindeutigkeit, zwei Bilder
 * koennen dieselbe Position haben, und ein reiner Wertetausch bewegte dann
 * gar nichts. Nach dem Tausch wird die Galerie neu durchnumeriert -- danach
 * sind die Positionen wieder eindeutig und lueckenlos.
 *
 * Beim ersten Bild nach oben (bzw. dem letzten nach unten) passiert nichts,
 * und zwar STILL mit `{ok: true}`: ohne JavaScript ist die Schaltflaeche da,
 * und eine Fehlermeldung fuer "geht nicht weiter" waere nur laestig.
 */
export async function moveImage(
    id: string,
    direction: "up" | "down"
): Promise<{ ok: boolean; error?: string }> {
    if (!isUuid(id)) return { ok: false, error: "Ungültige Kennung." };

    return withTransaction(async (tx) => {
        const [image] = await tx
            .select({ galleryId: galleryImages.galleryId })
            .from(galleryImages)
            .where(eq(galleryImages.id, id))
            .limit(1);

        if (!image) return { ok: false, error: "Das Bild wurde nicht gefunden." };

        const rows = await tx
            .select({ id: galleryImages.id })
            .from(galleryImages)
            .where(eq(galleryImages.galleryId, image.galleryId))
            .orderBy(asc(galleryImages.position), asc(galleryImages.createdAt));

        const order = rows.map((row) => row.id);
        const index = order.indexOf(id);
        const target = direction === "up" ? index - 1 : index + 1;

        if (index < 0 || target < 0 || target >= order.length) return { ok: true };

        [order[index], order[target]] = [order[target], order[index]];

        for (const entry of renumber(order, order)) {
            await tx
                .update(galleryImages)
                .set({ position: entry.position })
                .where(eq(galleryImages.id, entry.id));
        }

        return { ok: true };
    });
}

/**
 * Die ganze Galerie neu sortieren.
 *
 * In einer Transaktion, weil sonst ein Abbruch nach der Haelfte eine
 * Reihenfolge hinterliesse, die weder die alte noch die neue ist. Was das
 * Formular schickt, geht durch `renumber` -- fremde Kennungen fallen raus,
 * fehlende werden hinten angehaengt.
 */
export async function reorderImages(
    galleryId: string,
    imageIds: string[]
): Promise<{ ok: boolean; error?: string }> {
    if (!isUuid(galleryId)) return { ok: false, error: "Ungültige Kennung." };

    return withTransaction(async (tx) => {
        const rows = await tx
            .select({ id: galleryImages.id })
            .from(galleryImages)
            .where(eq(galleryImages.galleryId, galleryId))
            .orderBy(asc(galleryImages.position), asc(galleryImages.createdAt));

        if (rows.length === 0) return { ok: true };

        const known = rows.map((row) => row.id);
        const submitted = onlyUuids(imageIds);

        for (const entry of renumber(submitted, known)) {
            await tx
                .update(galleryImages)
                .set({ position: entry.position })
                .where(eq(galleryImages.id, entry.id));
        }

        return { ok: true };
    });
}
