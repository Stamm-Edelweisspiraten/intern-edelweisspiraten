import { env } from "$env/dynamic/private";
import { decryptSecret, encryptSecret, hasEncryptionKey } from "$lib/server/crypto";
import { readSettingRaw, writeSettingRaw } from "$lib/server/settingsService";

/**
 * Zugangsdaten des Objektspeichers.
 *
 * Zwei Quellen, in dieser Reihenfolge:
 *
 *   1. Umgebungsvariablen (`S3_*`) -- damit ein Betrieb ganz ohne Geheimnisse
 *      in der Datenbank möglich bleibt, etwa wenn der Speicher vom Hoster
 *      gestellt und über die Betriebsumgebung durchgereicht wird.
 *   2. Der Adminbereich (`settings`, Schlüssel "storage").
 *
 * Der geheime Schlüssel steht in der Datenbank ausschließlich verschlüsselt
 * (siehe $lib/server/crypto). Er verlässt den Server nie: die Adminseite
 * bekommt nur die Angabe, ob einer hinterlegt ist.
 */

const STORAGE_KEY = "storage";

export interface StorageConfig {
    /** Endpunkt-URL; leer bedeutet AWS S3 selbst. */
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    /** Präfix für alle Objekte, z.B. "stamm-edelweiss/". */
    prefix: string;
    /**
     * Pfad-Adressierung statt `bucket.host`. MinIO und die meisten
     * selbstgehosteten Speicher brauchen das.
     */
    forcePathStyle: boolean;
}

/** Was die Oberfläche sehen darf -- ohne den geheimen Schlüssel. */
export interface StorageConfigView extends Omit<StorageConfig, "secretAccessKey"> {
    /** true, wenn ein geheimer Schlüssel hinterlegt ist. */
    hasSecret: boolean;
    /** true, wenn die Werte aus der Umgebung stammen und nicht änderbar sind. */
    fromEnv: boolean;
    /** true, wenn Endpunkt, Bucket und Schlüsselpaar vollständig sind. */
    configured: boolean;
}

const EMPTY: StorageConfig = {
    endpoint: "",
    region: "us-east-1",
    bucket: "",
    accessKeyId: "",
    secretAccessKey: "",
    prefix: "",
    forcePathStyle: true
};

/** true, wenn die Umgebung den Speicher vorgibt. */
export function storageFromEnv(): boolean {
    return Boolean(env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY);
}

function fromEnvironment(): StorageConfig {
    return {
        endpoint: env.S3_ENDPOINT ?? "",
        region: env.S3_REGION || "us-east-1",
        bucket: env.S3_BUCKET ?? "",
        accessKeyId: env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? "",
        prefix: env.S3_PREFIX ?? "",
        // Ohne eigenen Endpunkt ist es AWS -- dort ist Host-Adressierung üblich.
        forcePathStyle: env.S3_FORCE_PATH_STYLE
            ? env.S3_FORCE_PATH_STYLE !== "false"
            : Boolean(env.S3_ENDPOINT)
    };
}

function text(value: unknown, fallback = ""): string {
    return typeof value === "string" ? value : fallback;
}

/**
 * Die vollständige Einstellung samt entschlüsseltem Schlüssel. Nur für den
 * Server -- niemals an eine Seite weitergeben.
 */
export async function getStorageConfig(): Promise<StorageConfig> {
    if (storageFromEnv()) return fromEnvironment();

    const stored = await readSettingRaw(STORAGE_KEY);
    if (!stored) return { ...EMPTY };

    let secretAccessKey = "";
    const encrypted = text(stored.secretAccessKey);

    if (encrypted) {
        try {
            secretAccessKey = decryptSecret(encrypted);
        } catch (err) {
            // Ein falscher oder gewechselter Schlüssel darf nicht die ganze
            // Anwendung anhalten: die Ablage faellt dann auf die Datenbank
            // zurueck, statt bei jedem Zugriff zu werfen.
            console.error("Speicher-Zugangsdaten nicht lesbar:", err);
        }
    }

    return {
        endpoint: text(stored.endpoint),
        region: text(stored.region, "us-east-1"),
        bucket: text(stored.bucket),
        accessKeyId: text(stored.accessKeyId),
        secretAccessKey,
        prefix: text(stored.prefix),
        forcePathStyle: stored.forcePathStyle !== false
    };
}

/** true, wenn genug hinterlegt ist, um wirklich zu schreiben. */
export function isConfigured(config: StorageConfig): boolean {
    return Boolean(config.bucket && config.accessKeyId && config.secretAccessKey);
}

/** Fassung für die Oberfläche: ohne geheimen Schlüssel. */
export async function getStorageConfigView(): Promise<StorageConfigView> {
    const config = await getStorageConfig();
    const { secretAccessKey, ...rest } = config;

    return {
        ...rest,
        hasSecret: Boolean(secretAccessKey),
        fromEnv: storageFromEnv(),
        configured: isConfigured(config)
    };
}

export interface StorageConfigInput extends Omit<StorageConfig, "secretAccessKey"> {
    /**
     * Leer lassen heißt: den hinterlegten Schlüssel behalten. So muss er beim
     * Ändern des Buckets nicht erneut eingetippt werden -- und er steht nicht
     * im Formular, wo ihn der Browser speichern würde.
     */
    secretAccessKey?: string;
}

export async function saveStorageConfig(
    input: StorageConfigInput,
    updatedBy: string
): Promise<{ ok: boolean; error?: string }> {
    if (storageFromEnv()) {
        return {
            ok: false,
            error: "Der Speicher wird über Umgebungsvariablen vorgegeben und kann hier nicht geändert werden."
        };
    }

    const secret = (input.secretAccessKey ?? "").trim();

    if (secret && !hasEncryptionKey()) {
        return {
            ok: false,
            error: "Ohne APP_ENC_KEY kann der geheime Schlüssel nicht verschlüsselt abgelegt werden."
        };
    }

    const previous = await readSettingRaw(STORAGE_KEY);
    const encrypted = secret ? encryptSecret(secret) : text(previous?.secretAccessKey);

    await writeSettingRaw(
        STORAGE_KEY,
        {
            endpoint: input.endpoint.trim(),
            region: input.region.trim() || "us-east-1",
            bucket: input.bucket.trim(),
            accessKeyId: input.accessKeyId.trim(),
            secretAccessKey: encrypted,
            // Ein Präfix endet immer auf "/", sonst klebt es am Dateinamen.
            prefix: normalizePrefix(input.prefix),
            forcePathStyle: input.forcePathStyle
        },
        updatedBy
    );

    return { ok: true };
}

/** Entfernt den Speicher wieder; vorhandene Objekte bleiben liegen. */
export async function clearStorageConfig(updatedBy: string): Promise<void> {
    await writeSettingRaw(STORAGE_KEY, {}, updatedBy);
}

export function normalizePrefix(prefix: string): string {
    const trimmed = prefix.trim().replace(/^\/+/, "").replace(/\/+$/, "");
    return trimmed ? `${trimmed}/` : "";
}
