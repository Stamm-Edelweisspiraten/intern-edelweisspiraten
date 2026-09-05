import { MongoClient, type ClientSession, type Db } from "mongodb";
import { env } from "$env/dynamic/private";

/**
 * Datenbankverbindung.
 *
 * Wichtig: hier wird NICHT mehr auf den Verbindungsaufbau gewartet.
 * Vorher stand ein `await client.connect()` auf Modulebene -- dadurch
 * versuchte schon der Produktionsbuild eine Verbindung aufzubauen und schlug
 * ohne erreichbare Datenbank fehl (im Docker-Build zuverlaessig).
 *
 * Der Treiber stellt die Verbindung selbst her und puffert Operationen bis
 * dahin; `client.db()` darf daher sofort verwendet werden.
 */

const uri = env.MONGODB_URI;

let mongoClient: MongoClient | null = null;
let db: Db;

if (uri) {
    if (import.meta.env.PROD) {
        mongoClient = new MongoClient(uri);
    } else {
        // Im Entwicklungsmodus wird das Modul bei jedem HMR-Durchlauf neu
        // ausgewertet -- ohne diesen Zwischenspeicher entstuende jedes Mal
        // eine neue Verbindung.
        const cached = (globalThis as { _mongoClient?: MongoClient })._mongoClient;
        mongoClient = cached ?? new MongoClient(uri);
        (globalThis as { _mongoClient?: MongoClient })._mongoClient = mongoClient;
    }

    db = mongoClient.db(env.MONGODB_DB || "intern-test");

    // Verbindungsaufbau anstossen, aber nicht darauf warten.
    mongoClient.connect().catch((err) => {
        console.error("Verbindung zur Datenbank fehlgeschlagen:", err?.message ?? err);
    });
} else {
    console.warn("MONGODB_URI ist nicht gesetzt. Datenbankzugriff wird fehlschlagen.");
    db = new Proxy(
        {},
        {
            get() {
                throw new Error("MONGODB_URI ist nicht konfiguriert");
            }
        }
    ) as Db;
}

export { mongoClient, db };

/**
 * Fuehrt eine Schreibfolge in einer Transaktion aus, sofern der Server sie
 * unterstuetzt (Replica Set / Atlas). Auf einer Standalone-Instanz faellt die
 * Funktion transparent auf eine Ausfuehrung ohne Transaktion zurueck, damit die
 * Anwendung auch lokal lauffaehig bleibt.
 */
export async function withTransaction<T>(
    fn: (session: ClientSession | undefined) => Promise<T>
): Promise<T> {
    if (!mongoClient) return fn(undefined);

    const session = mongoClient.startSession();
    try {
        let result!: T;
        await session.withTransaction(async () => {
            result = await fn(session);
        });
        return result;
    } catch (err: unknown) {
        if (isTransactionUnsupported(err)) {
            console.warn(
                "MongoDB-Server unterstuetzt keine Transaktionen (kein Replica Set), fahre ohne fort."
            );
            return fn(undefined);
        }
        throw err;
    } finally {
        await session.endSession();
    }
}

/**
 * Standalone-Instanzen lehnen Transaktionen mit IllegalOperation (20) bzw.
 * einer entsprechenden Meldung ab. Nur dann wird der Fallback genutzt --
 * echte Schreibfehler muessen weiterhin durchschlagen.
 */
function isTransactionUnsupported(err: unknown): boolean {
    const code = (err as { code?: unknown })?.code;
    const message = String((err as { message?: unknown })?.message ?? "");
    return (
        code === 20 ||
        message.includes("Transaction numbers are only allowed") ||
        message.includes("Transactions are not supported") ||
        message.includes("replica set")
    );
}
