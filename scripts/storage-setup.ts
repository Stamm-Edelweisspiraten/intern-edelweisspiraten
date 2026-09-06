import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/server/db/schema/index";
import { encryptWithKey, parseKey } from "../src/lib/server/crypto/aes";

/**
 * Objektspeicher einrichten.
 *
 *   npm run storage:setup
 *
 * Bringt Garage in einen benutzbaren Zustand und hinterlegt die Zugangsdaten
 * im Adminbereich — danach liegen neue Dateien oben statt in der Datenbank.
 *
 * Vier Schritte, alle wiederholbar:
 *
 *   1. Aufteilung festlegen (`layout`). Ein frischer Garage-Knoten hat keine
 *      und nimmt deshalb nichts an.
 *   2. Bucket anlegen.
 *   3. Zugangsschluessel anlegen und ihm Lese- und Schreibrecht auf den
 *      Bucket geben.
 *   4. Endpunkt, Bucket und Schluesselpaar in `settings` schreiben, den
 *      geheimen Teil verschluesselt.
 *
 * Ein zweiter Lauf legt nichts doppelt an: vorhandene Buckets und Schluessel
 * werden erkannt, und Garage gibt das Geheimnis eines bestehenden Schluessels
 * wieder heraus.
 *
 * Bewusst OHNE die Anwendungsmodule: die lesen DATABASE_URL ueber
 * $env/dynamic/private, einen Alias, den es ausserhalb von Vite nicht gibt.
 * Schema und Verschluesselung sind davon frei und deshalb hier benutzbar --
 * die Verschluesselung muss dieselbe sein, sonst kann die Anwendung den
 * Schluessel nicht lesen.
 */

const ADMIN_URL = process.env.GARAGE_ADMIN_URL ?? "http://localhost:3903";
const ADMIN_TOKEN = process.env.GARAGE_ADMIN_TOKEN ?? "";

/**
 * Der Endpunkt, den die ANWENDUNG benutzt -- nicht der, ueber den dieses
 * Skript Garage verwaltet. Im Entwicklungsbetrieb laeuft die Anwendung auf
 * dem Rechner und erreicht Garage unter localhost; im Container heisst der
 * Dienst "garage". Fuer den Containerbetrieb stehen die S3_*-Variablen in
 * der docker-compose.yml, sie haben Vorrang vor dieser Einstellung.
 */
const S3_URL = process.env.GARAGE_S3_URL ?? "http://localhost:3900";

const BUCKET = process.env.GARAGE_BUCKET ?? "portal";
const KEY_NAME = process.env.GARAGE_KEY_NAME ?? "portal-app";
const ZONE = "dc1";
/** 10 GB. Bei einem Knoten ist das nur eine Zahl fuer die Verteilrechnung. */
const CAPACITY = 10_000_000_000;

const SETTINGS_KEY = "storage";

function fail(message: string): never {
    console.error(`\n${message}\n`);
    process.exit(1);
}

async function admin<T>(
    path: string,
    init: { method?: string; body?: unknown } = {}
): Promise<T> {
    const response = await fetch(`${ADMIN_URL}${path}`, {
        method: init.method ?? "GET",
        headers: {
            authorization: `Bearer ${ADMIN_TOKEN}`,
            ...(init.body === undefined ? {} : { "content-type": "application/json" })
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body)
    });

    const text = await response.text();

    if (!response.ok) {
        throw new Error(`${init.method ?? "GET"} ${path} -> ${response.status}: ${text}`);
    }

    return (text ? JSON.parse(text) : null) as T;
}

/**
 * Die Verwaltungsschnittstelle von Garage 2 (`/v2/...`). Sie unterscheidet
 * sich in Pfaden UND Nutzlast von der v1 aus Garage 1.x -- ein Wechsel der
 * Hauptversion braucht hier also Arbeit, nicht nur eine neue Bildmarke.
 */
interface ClusterStatus {
    layoutVersion: number;
    nodes: { id: string; isUp: boolean; role: unknown }[];
}

/**
 * Achtung, zwei Namen fuer dasselbe: `ListKeys` liefert die Kennung als
 * `id`, `CreateKey` und `GetKeyInfo` als `accessKeyId`.
 */
interface KeyListEntry {
    id: string;
    name: string;
}

interface KeyInfo {
    accessKeyId: string;
    secretAccessKey?: string | null;
    name: string;
}

interface BucketInfo {
    id: string;
    globalAliases: string[];
}

/**
 * Wartet, bis die Verwaltungsschnittstelle antwortet -- direkt nach
 * `docker compose up` dauert das ein paar Sekunden.
 *
 * Bewusst NICHT ueber `/health`: Garage 2 meldet sich dort erst als gesund,
 * wenn die Aufteilung steht -- also nach dem, was dieses Skript gerade erst
 * herstellen will. Ein Warten darauf liefe immer in die Zeitueberschreitung.
 * Gefragt ist hier nur: antwortet die Schnittstelle ueberhaupt?
 */
async function waitForGarage(): Promise<void> {
    for (let attempt = 1; attempt <= 30; attempt += 1) {
        try {
            const response = await fetch(`${ADMIN_URL}/v2/GetClusterStatus`, {
                headers: { authorization: `Bearer ${ADMIN_TOKEN}` }
            });

            if (response.ok) {
                if (attempt > 1) console.log("");
                return;
            }

            if (response.status === 401 || response.status === 403) {
                console.log("");
                fail(
                    "Garage weist den Verwaltungstoken zurueck.\n" +
                        "GARAGE_ADMIN_TOKEN in der .env muss zu dem passen, mit dem der\n" +
                        "Dienst gestartet wurde:  docker compose up -d --force-recreate garage"
                );
            }
        } catch {
            // Noch nicht da.
        }

        if (attempt === 1) process.stdout.write("Warte auf Garage ");
        process.stdout.write(".");
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log("");
    fail(
        `Garage antwortet unter ${ADMIN_URL} nicht.\n` +
            "Laeuft der Dienst?  docker compose up -d garage"
    );
}

/**
 * Schritt 1: Aufteilung.
 *
 * Ein frischer Knoten hat keine Rolle im Cluster und nimmt deshalb keine
 * Daten an -- die S3-Schnittstelle antwortet dann mit einem Fehler, der
 * nichts darueber sagt, was fehlt. Ist die Aufteilung schon gesetzt, wird
 * nichts geaendert.
 */
async function ensureLayout(): Promise<void> {
    const status = await admin<ClusterStatus>("/v2/GetClusterStatus");

    if (status.nodes.some((node) => node.role !== null)) {
        console.log(`  Aufteilung steht bereits (Fassung ${status.layoutVersion}).`);
        return;
    }

    const self = status.nodes.find((node) => node.isUp);
    if (!self) fail("Garage meldet keinen erreichbaren Knoten.");

    await admin("/v2/UpdateClusterLayout", {
        method: "POST",
        body: { roles: [{ id: self.id, zone: ZONE, capacity: CAPACITY, tags: [] }] }
    });

    await admin("/v2/ApplyClusterLayout", {
        method: "POST",
        body: { version: status.layoutVersion + 1 }
    });

    console.log(`  Aufteilung gesetzt: ein Knoten in Zone "${ZONE}".`);
}

/** Schritt 2: Bucket. */
async function ensureBucket(): Promise<string> {
    const buckets = await admin<BucketInfo[]>("/v2/ListBuckets");
    const existing = buckets.find((bucket) => bucket.globalAliases.includes(BUCKET));

    if (existing) {
        console.log(`  Bucket "${BUCKET}" ist vorhanden.`);
        return existing.id;
    }

    const created = await admin<BucketInfo>("/v2/CreateBucket", {
        method: "POST",
        body: { globalAlias: BUCKET }
    });

    console.log(`  Bucket "${BUCKET}" angelegt.`);
    return created.id;
}

/**
 * Schritt 3: Zugangsschluessel samt Rechten.
 *
 * Garage gibt das Geheimnis eines bestehenden Schluessels auf Nachfrage
 * wieder heraus (`showSecretKey`). Deshalb ist ein zweiter Lauf moeglich,
 * ohne einen neuen Schluessel anzulegen und den alten liegen zu lassen.
 */
async function ensureKey(bucketId: string): Promise<{ id: string; secret: string }> {
    const keys = await admin<KeyListEntry[]>("/v2/ListKeys");
    const existing = keys.find((key) => key.name === KEY_NAME);

    let accessKeyId: string;
    let secret: string;

    if (existing) {
        const full = await admin<KeyInfo>(
            `/v2/GetKeyInfo?id=${encodeURIComponent(existing.id)}&showSecretKey=true`
        );
        if (!full.secretAccessKey) {
            fail(
                `Der Schluessel "${KEY_NAME}" existiert, sein Geheimnis ist aber nicht\n` +
                    "lesbar. Loesche ihn in der Oberflaeche unter http://localhost:3909\n" +
                    "und starte den Lauf erneut."
            );
        }
        accessKeyId = full.accessKeyId;
        secret = full.secretAccessKey;
        console.log(`  Zugangsschluessel "${KEY_NAME}" ist vorhanden.`);
    } else {
        const created = await admin<KeyInfo>("/v2/CreateKey", {
            method: "POST",
            body: { name: KEY_NAME }
        });
        if (!created.secretAccessKey) fail("Garage hat keinen geheimen Schluessel geliefert.");
        accessKeyId = created.accessKeyId;
        secret = created.secretAccessKey;
        console.log(`  Zugangsschluessel "${KEY_NAME}" angelegt.`);
    }

    // Rechte setzen ist bei Garage wiederholbar -- ein zweiter Aufruf aendert
    // nichts, wenn sie schon stimmen.
    await admin("/v2/AllowBucketKey", {
        method: "POST",
        body: {
            bucketId,
            accessKeyId,
            permissions: { read: true, write: true, owner: false }
        }
    });

    console.log(`  Lese- und Schreibrecht auf "${BUCKET}" vergeben.`);
    return { id: accessKeyId, secret };
}

/** Schritt 4: ab in den Adminbereich. */
async function writeSettings(accessKeyId: string, secretAccessKey: string): Promise<void> {
    const url = process.env.DATABASE_URL;
    if (!url) fail("DATABASE_URL ist nicht gesetzt.");

    const key = parseKey(process.env.APP_ENC_KEY || process.env.MFA_ENC_KEY);

    const sql = postgres(url, { max: 1 });
    const db = drizzle(sql, { schema });

    try {
        const value = {
            endpoint: S3_URL,
            region: "garage",
            bucket: BUCKET,
            accessKeyId,
            // Verschluesselt, genau wie es die Adminseite ablegen wuerde.
            secretAccessKey: encryptWithKey(key, secretAccessKey),
            prefix: "",
            // Garage kennt keine Adressierung ueber den Hostnamen ohne
            // passendes DNS -- Pfad-Adressierung ist hier Pflicht.
            forcePathStyle: true
        };

        await db
            .insert(schema.settings)
            .values({ key: SETTINGS_KEY, value, updatedBy: "storage:setup", updatedAt: new Date() })
            .onConflictDoUpdate({
                target: schema.settings.key,
                set: { value, updatedBy: "storage:setup", updatedAt: new Date() }
            });

        const [row] = await db
            .select({ value: schema.settings.value })
            .from(schema.settings)
            .where(eq(schema.settings.key, SETTINGS_KEY));

        if (!row) fail("Die Einstellung wurde nicht geschrieben.");
    } finally {
        await sql.end();
    }

    console.log("  Zugangsdaten im Adminbereich hinterlegt.");
}

async function main(): Promise<void> {
    if (!ADMIN_TOKEN) {
        fail(
            "GARAGE_ADMIN_TOKEN ist nicht gesetzt.\n" +
                "Erzeuge eines mit `openssl rand -base64 32` und trage es in die .env ein,\n" +
                "zusammen mit GARAGE_RPC_SECRET (`openssl rand -hex 32`)."
        );
    }

    await waitForGarage();
    console.log("");

    console.log("Garage einrichten:");
    await ensureLayout();
    const bucketId = await ensureBucket();
    const { id, secret } = await ensureKey(bucketId);
    await writeSettings(id, secret);

    console.log("");
    console.log(`Fertig. Neue Dateien landen ab sofort in "${BUCKET}".`);
    console.log("");
    console.log("  Adminbereich:      /intern/admin/speicher");
    console.log("    dort „Verbindung pruefen“ und, wenn schon Dateien in der");
    console.log("    Datenbank liegen, „Dateien umziehen“.");
    console.log("  Garage-Oberflaeche: http://localhost:3909");
    console.log("");
    console.log("Fuer den Containerbetrieb (docker compose --profile app) gehoert");
    console.log("das Schluesselpaar zusaetzlich in die .env -- im Container heisst");
    console.log("der Dienst \"garage\", nicht \"localhost\":");
    console.log("");
    console.log(`  S3_BUCKET=${BUCKET}`);
    console.log(`  S3_ACCESS_KEY_ID=${id}`);
    console.log(`  S3_SECRET_ACCESS_KEY=${secret}`);
    console.log("");
}

main().catch((err) => {
    console.error("\nEinrichtung fehlgeschlagen:", err instanceof Error ? err.message : err);
    process.exit(1);
});
