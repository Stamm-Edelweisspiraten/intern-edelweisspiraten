import {
    DeleteObjectCommand,
    GetObjectCommand,
    HeadBucketCommand,
    PutObjectCommand,
    S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { contentDisposition, isInlineType } from "$lib/server/http/download";
import { getStorageConfig, isConfigured, type StorageConfig } from "./settings";

/**
 * Objektablage.
 *
 * Zwei Umsetzungen hinter einer Schnittstelle: der Objektspeicher (S3 oder
 * kompatibel, etwa MinIO) und die Datenbank. Welche greift, entscheidet die
 * Einstellung im Adminbereich -- ohne dass ein Aufrufer davon weiß.
 *
 * Die Datenbankablage bleibt der Rückfall und wird nicht abgeschafft: ein
 * Stamm ohne eigenen Objektspeicher soll das Portal weiterhin ohne zweites
 * System betreiben können. Deshalb trägt jede Datei entweder einen
 * `storage_key` (liegt oben) oder ein `content` (liegt in der Datenbank).
 */

export interface PutResult {
    /** Der Schlüssel im Objektspeicher, oder null für die Datenbank. */
    storageKey: string | null;
}

export interface ObjectStore {
    readonly kind: "s3" | "database";
    put(key: string, body: Buffer, contentType: string): Promise<void>;
    get(key: string): Promise<Buffer | null>;
    delete(key: string): Promise<void>;
    /**
     * Eine zeitlich begrenzte Adresse, unter der der Browser die Datei direkt
     * beim Speicher holt. `null` heißt: über eine eigene Route ausliefern.
     *
     * Der Typ gehört mit dazu: der Speicher liefert unter SEINEM Ursprung
     * aus, die Kopfzeilen der Anwendung greifen dort nicht. Was der Browser
     * anzeigen darf und was er herunterladen soll, muss deshalb schon in der
     * Adresse stehen.
     */
    signedUrl(key: string, filename: string, contentType?: string): Promise<string | null>;
}

// ---------------------------------------------------------------------------
// S3
// ---------------------------------------------------------------------------

/**
 * Der Client wird zwischengespeichert, aber an die Einstellung gebunden:
 * ändert sie sich im Adminbereich, entsteht beim nächsten Zugriff ein neuer.
 * Ein Client je Anfrage wäre teuer -- er baut eine eigene Verbindungshaltung
 * auf.
 */
let cached: { signature: string; client: S3Client } | null = null;

function signatureOf(config: StorageConfig): string {
    return [
        config.endpoint,
        config.region,
        config.bucket,
        config.accessKeyId,
        config.forcePathStyle ? "path" : "host",
        // Nicht der Schlüssel selbst, nur seine Länge -- er soll nirgends
        // versehentlich in einen Log geraten.
        String(config.secretAccessKey.length)
    ].join("|");
}

function clientFor(config: StorageConfig): S3Client {
    const signature = signatureOf(config);
    if (cached?.signature === signature) return cached.client;

    const client = new S3Client({
        region: config.region,
        endpoint: config.endpoint || undefined,
        forcePathStyle: config.forcePathStyle,
        credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey
        }
    });

    cached = { signature, client };
    return client;
}

/** Verwirft den zwischengespeicherten Client -- nach einer Änderung. */
export function resetStorageClient(): void {
    cached?.client.destroy();
    cached = null;
}

function s3Store(config: StorageConfig): ObjectStore {
    const client = clientFor(config);

    return {
        kind: "s3",

        async put(key, body, contentType) {
            await client.send(
                new PutObjectCommand({
                    Bucket: config.bucket,
                    Key: key,
                    Body: body,
                    ContentType: contentType,
                    ContentLength: body.byteLength
                })
            );
        },

        async get(key) {
            try {
                const result = await client.send(
                    new GetObjectCommand({ Bucket: config.bucket, Key: key })
                );
                if (!result.Body) return null;
                const bytes = await result.Body.transformToByteArray();
                return Buffer.from(bytes);
            } catch (err) {
                if (isNotFound(err)) return null;
                throw err;
            }
        },

        async delete(key) {
            try {
                await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
            } catch (err) {
                if (isNotFound(err)) return;
                throw err;
            }
        },

        async signedUrl(key, filename, contentType) {
            /**
             * Der Dateiname wird mitgegeben, damit der Browser beim Speichern
             * nicht den Objektschlüssel als Namen nimmt. Die Kopfzeile baut
             * jetzt `contentDisposition()` -- dieselbe Funktion wie in allen
             * eigenen Routen. Vorher wurde sie hier von Hand zusammengesetzt
             * und filterte nur Anführungszeichen; Umlaute gingen verloren und
             * jeder anzeigbare wie nicht anzeigbare Typ wurde `inline`
             * ausgeliefert.
             *
             * `ResponseContentType` ist der zweite Teil: ohne ihn rät der
             * Speicher den Typ aus der Endung des Schlüssels -- und der
             * Schlüssel ist eine UUID ohne Endung.
             */
            const disposition = isInlineType(contentType) ? "inline" : "attachment";

            return getSignedUrl(
                client,
                new GetObjectCommand({
                    Bucket: config.bucket,
                    Key: key,
                    ResponseContentDisposition: contentDisposition(filename, disposition),
                    ResponseContentType: contentType || "application/octet-stream"
                }),
                { expiresIn: 300 }
            );
        }
    };
}

/** S3 meldet "nicht gefunden" je nach Umsetzung unterschiedlich. */
function isNotFound(err: unknown): boolean {
    const name = (err as { name?: string })?.name ?? "";
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    return name === "NoSuchKey" || name === "NotFound" || status === 404;
}

// ---------------------------------------------------------------------------
// Auswahl
// ---------------------------------------------------------------------------

/**
 * Die aktuell gültige Ablage, oder null, wenn kein Objektspeicher
 * eingerichtet ist -- dann bleibt es bei der Datenbank.
 */
export async function getObjectStore(): Promise<ObjectStore | null> {
    const config = await getStorageConfig();
    if (!isConfigured(config)) return null;
    return s3Store(config);
}

/**
 * Der Schlüssel, unter dem eine Datei im Objektspeicher liegt.
 *
 * Die Kennung der Datei ist bereits eindeutig; das Präfix trennt mehrere
 * Installationen in einem gemeinsamen Bucket. Zwei Zeichen der Kennung als
 * Zwischenebene halten die Auflistung eines Ordners handhabbar -- manche
 * Speicher werden bei zehntausenden Objekten auf einer Ebene träge.
 */
export function storageKeyFor(fileId: string, prefix: string): string {
    return `${prefix}files/${fileId.slice(0, 2)}/${fileId}`;
}

/**
 * Prüft die Verbindung: Bucket erreichbar, dann ein Testobjekt schreiben,
 * lesen und wieder entfernen.
 *
 * Der Schreibtest ist der eigentliche Punkt -- ein Zugang mit reinem
 * Leserecht besteht HeadBucket, würde aber bei der ersten hochgeladenen
 * Datei scheitern, und zwar erst dann.
 */
export async function testStorage(): Promise<{ ok: boolean; error?: string }> {
    const config = await getStorageConfig();
    if (!isConfigured(config)) {
        return { ok: false, error: "Es sind noch keine vollständigen Zugangsdaten hinterlegt." };
    }

    const client = clientFor(config);
    const key = `${config.prefix}.verbindungstest`;
    const payload = Buffer.from(`Verbindungstest ${new Date().toISOString()}`, "utf8");

    try {
        await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
    } catch (err) {
        return { ok: false, error: `Bucket nicht erreichbar: ${messageOf(err)}` };
    }

    try {
        await client.send(
            new PutObjectCommand({
                Bucket: config.bucket,
                Key: key,
                Body: payload,
                ContentType: "text/plain"
            })
        );
    } catch (err) {
        return { ok: false, error: `Schreiben nicht möglich: ${messageOf(err)}` };
    }

    try {
        const result = await client.send(
            new GetObjectCommand({ Bucket: config.bucket, Key: key })
        );
        const bytes = await result.Body?.transformToByteArray();
        if (!bytes || Buffer.from(bytes).toString("utf8") !== payload.toString("utf8")) {
            return { ok: false, error: "Der gelesene Inhalt weicht vom geschriebenen ab." };
        }
    } catch (err) {
        return { ok: false, error: `Lesen nicht möglich: ${messageOf(err)}` };
    }

    try {
        await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    } catch (err) {
        // Nicht schlimm: das Testobjekt bleibt liegen, der Speicher taugt.
        return {
            ok: true,
            error: `Hinweis: Das Testobjekt konnte nicht gelöscht werden (${messageOf(err)}).`
        };
    }

    return { ok: true };
}

function messageOf(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
}
