import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "$lib/server/db";
import { isUuid } from "$lib/server/db/ids";
import { files } from "$lib/server/db/schema";
import { checkUpload } from "$lib/server/files/mime";
import { getObjectStore, storageKeyFor } from "$lib/server/storage";
import { getStorageConfig, isConfigured } from "$lib/server/storage/settings";

/**
 * Dateiablage.
 *
 * Die Schnittstelle nach außen ist unverändert -- `storeFile`, `readFile`,
 * `deleteFile`, `saveMemberFile`. Neu ist nur, wo der Inhalt landet: ist ein
 * Objektspeicher eingerichtet, geht er dorthin und die Zeile trägt einen
 * `storage_key`; sonst bleibt er wie bisher in der Spalte `content`.
 *
 * Beides existiert nebeneinander, auch dauerhaft: nach dem Einrichten des
 * Speichers liegen alte Dateien weiter unten, bis der Umzug im Adminbereich
 * angestoßen wird. Kein Aufrufer muss wissen, welche Datei wo liegt.
 */

export type MemberFileKind = "consent" | "application";

export interface StoredFileMeta {
    id: string;
    filename: string;
    contentType: string;
    size: number;
    uploadedAt: string;
    kind: MemberFileKind;
    memberId: string;
}

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
/** Mitgliedsunterlagen: Aufnahmeantrag und Einwilligung, sonst nichts. */
const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg"];

function isFile(input: unknown): input is File {
    return (
        typeof input === "object" &&
        input !== null &&
        typeof (input as File).arrayBuffer === "function"
    );
}

/**
 * Legt eine beliebige Datei ab und liefert ihre Kennung. Grundlage für
 * Mitgliedsunterlagen, Belege der Kasse, Dokumente und das Logo.
 */
export async function storeFile(input: {
    filename: string;
    contentType: string;
    content: Buffer;
    uploadedBy?: string;
}): Promise<string> {
    const store = await getObjectStore();

    /**
     * Erst die Zeile, dann das Objekt: die Kennung bildet den Schlüssel, und
     * ein Objekt ohne Zeile wäre unauffindbarer Müll. Schlägt das Hochladen
     * fehl, wird die Zeile wieder entfernt.
     */
    const [row] = await db
        .insert(files)
        .values({
            filename: input.filename,
            contentType: input.contentType,
            size: input.content.byteLength,
            content: store ? null : input.content,
            uploadedBy: input.uploadedBy ?? null
        })
        .returning({ id: files.id });

    if (!store) return row.id;

    const config = await getStorageConfig();
    const key = storageKeyFor(row.id, config.prefix);

    try {
        await store.put(key, input.content, input.contentType);
    } catch (err) {
        await db.delete(files).where(eq(files.id, row.id));
        throw err;
    }

    await db.update(files).set({ storageKey: key }).where(eq(files.id, row.id));
    return row.id;
}

/** Die Metadaten einer Datei, ohne den Inhalt zu holen. */
export async function readFileMeta(id: string) {
    if (!isUuid(id)) return null;
    const [row] = await db
        .select({
            id: files.id,
            filename: files.filename,
            contentType: files.contentType,
            size: files.size,
            storageKey: files.storageKey,
            uploadedAt: files.uploadedAt,
            uploadedBy: files.uploadedBy
        })
        .from(files)
        .where(eq(files.id, id))
        .limit(1);
    return row ?? null;
}

/**
 * Datei samt Inhalt.
 *
 * Liefert dieselbe Form wie zuvor -- `content` ist immer ein Buffer, egal ob
 * er aus der Spalte oder vom Objektspeicher kommt.
 */
export async function readFile(id: string) {
    if (!isUuid(id)) return null;

    const [row] = await db.select().from(files).where(eq(files.id, id)).limit(1);
    if (!row) return null;

    if (!row.storageKey) {
        // Alte Ablage: der Inhalt steht in der Spalte.
        return row.content ? { ...row, content: row.content } : null;
    }

    const store = await getObjectStore();
    if (!store) {
        console.error(
            `Datei ${id} liegt im Objektspeicher, dieser ist aber nicht eingerichtet.`
        );
        return null;
    }

    const content = await store.get(row.storageKey);
    if (!content) return null;

    return { ...row, content };
}

export async function deleteFile(id?: string | null): Promise<void> {
    if (!id || !isUuid(id)) return;

    try {
        const [row] = await db
            .delete(files)
            .where(eq(files.id, id))
            .returning({ storageKey: files.storageKey });

        if (row?.storageKey) {
            const store = await getObjectStore();
            // Bleibt das Objekt liegen, ist das ärgerlich, aber harmlos --
            // die Zeile ist weg, es ist über nichts mehr erreichbar.
            await store?.delete(row.storageKey);
        }
    } catch (err) {
        console.warn("Konnte Datei nicht löschen", id, err);
    }
}

/**
 * Eine kurzlebige Adresse direkt beim Speicher, falls die Datei dort liegt.
 * `null` heißt: über die eigene Route ausliefern.
 */
export async function signedUrlFor(
    id: string,
    options: { filename?: string } = {}
): Promise<string | null> {
    const meta = await readFileMeta(id);
    if (!meta?.storageKey) return null;

    const store = await getObjectStore();
    if (!store) return null;

    // Der Typ geht mit: der Speicher liefert unter seinem eigenen Ursprung
    // aus, dort greift keine Kopfzeile dieser Anwendung mehr.
    return store.signedUrl(meta.storageKey, options.filename ?? meta.filename, meta.contentType);
}

// ---------------------------------------------------------------------------
// Umzug in den Objektspeicher
// ---------------------------------------------------------------------------

export interface MigrationReport {
    /** Wie viele Dateien noch in der Datenbank lagen. */
    pending: number;
    moved: number;
    failed: number;
    bytes: number;
    errors: string[];
}

/**
 * Verschiebt alle Dateien, die noch in der Datenbank liegen, nach oben.
 *
 * In Stapeln, damit nicht der gesamte Bestand gleichzeitig im Speicher steht
 * -- bei 10 MB je Datei wären hundert Dateien schon ein Gigabyte. Der Vorgang
 * ist wiederholbar: was bereits oben liegt, hat einen `storage_key` und wird
 * gar nicht erst gelesen.
 *
 * Reihenfolge je Datei: erst hochladen, dann den Schlüssel setzen und den
 * Spalteninhalt leeren. Bricht es dazwischen ab, liegt das Objekt doppelt --
 * ein zweiter Lauf überschreibt es mit demselben Inhalt unter demselben
 * Schlüssel. Andersherum wäre die Datei verloren.
 */
export async function migrateFilesToStorage(
    options: { batchSize?: number } = {}
): Promise<MigrationReport> {
    const report: MigrationReport = { pending: 0, moved: 0, failed: 0, bytes: 0, errors: [] };

    const config = await getStorageConfig();
    if (!isConfigured(config)) {
        report.errors.push("Es ist kein Objektspeicher eingerichtet.");
        return report;
    }

    const store = await getObjectStore();
    if (!store) {
        report.errors.push("Der Objektspeicher ließ sich nicht öffnen.");
        return report;
    }

    const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(files)
        .where(and(isNull(files.storageKey), isNotNull(files.content)));
    report.pending = Number(count ?? 0);

    const batchSize = options.batchSize ?? 25;

    for (;;) {
        const batch = await db
            .select({
                id: files.id,
                filename: files.filename,
                contentType: files.contentType,
                content: files.content
            })
            .from(files)
            .where(and(isNull(files.storageKey), isNotNull(files.content)))
            .limit(batchSize);

        if (batch.length === 0) break;

        let progressed = false;

        for (const row of batch) {
            if (!row.content) continue;

            const key = storageKeyFor(row.id, config.prefix);

            try {
                await store.put(key, row.content, row.contentType);
                await db
                    .update(files)
                    .set({ storageKey: key, content: null })
                    .where(eq(files.id, row.id));

                report.moved += 1;
                report.bytes += row.content.byteLength;
                progressed = true;
            } catch (err) {
                report.failed += 1;
                const message = err instanceof Error ? err.message : String(err);
                // Nur die ersten Fehler sammeln -- bei einem falschen Zugang
                // wäre die Liste sonst so lang wie der Bestand.
                if (report.errors.length < 5) {
                    report.errors.push(`${row.filename}: ${message}`);
                }
            }
        }

        /**
         * Nichts verschoben, obwohl noch etwas offen ist: die Auswahl liefert
         * immer wieder dieselben Zeilen. Ohne Abbruch liefe die Schleife
         * endlos.
         */
        if (!progressed) break;
    }

    return report;
}

/** Zählt, was ein Umzug zu tun hätte -- für die Anzeige im Adminbereich. */
export async function countPendingMigration(): Promise<{ count: number; bytes: number }> {
    const [row] = await db
        .select({
            count: sql<number>`count(*)::int`,
            bytes: sql<number>`coalesce(sum(${files.size}), 0)::bigint`
        })
        .from(files)
        .where(and(isNull(files.storageKey), isNotNull(files.content)));

    return { count: Number(row?.count ?? 0), bytes: Number(row?.bytes ?? 0) };
}

// ---------------------------------------------------------------------------
// Mitgliedsunterlagen
// ---------------------------------------------------------------------------

export async function saveMemberFile(
    file: unknown,
    memberId: string,
    kind: MemberFileKind,
    previousId?: string
): Promise<StoredFileMeta | undefined> {
    if (!isFile(file) || file.size === 0) return undefined;

    if (file.size > MAX_FILE_BYTES) {
        throw new Error("Datei zu groß (max 10MB)");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = file.name || `${kind}-${Date.now()}.pdf`;

    /**
     * Vorher fiel jeder unerwartete Typ still auf "application/octet-stream"
     * -- eine .exe unter dem Namen "Einwilligung" landete damit unbeanstandet
     * in der Ablage. Jetzt wird der gemeldete Typ gegen die ersten Bytes
     * geprueft und alles Uebrige abgewiesen.
     */
    const check = checkUpload(
        { filename, declaredType: file.type, content: buffer },
        ALLOWED_TYPES
    );
    if (!check.ok) throw new Error(check.error);

    const contentType = check.contentType;

    const id = await storeFile({ filename, contentType, content: buffer, uploadedBy: memberId });

    // Vorherige Datei entfernen, falls vorhanden.
    await deleteFile(previousId);

    return {
        id,
        filename,
        contentType,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        kind,
        memberId
    };
}

/**
 * Liefert die Datei samt Inhalt. Anders als bei GridFS gibt es keinen Strom
 * mehr, sondern den vollständigen Puffer -- bei maximal 10 MB ist das
 * unproblematisch und erspart die Strömungssteuerung in den Routen.
 */
export async function getMemberFile(id: string) {
    const row = await readFile(id);
    if (!row) return null;
    return {
        file: {
            filename: row.filename,
            contentType: row.contentType,
            length: row.size
        },
        content: row.content
    };
}

export async function deleteMemberFile(id?: string | null): Promise<void> {
    await deleteFile(id);
}
