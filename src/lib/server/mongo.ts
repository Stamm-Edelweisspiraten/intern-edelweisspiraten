import { MongoClient, type ClientSession, type Db } from "mongodb";
import { env } from "$env/dynamic/private";

const uri = env.MONGODB_URI;

let mongoClient: MongoClient | null = null;
let db: Db;

if (uri) {
    const client = new MongoClient(uri);
    let clientPromise: Promise<MongoClient>;

    if (import.meta.env.PROD) {
        clientPromise = client.connect();
    } else {
        // Im Dev-Modus wird das Modul bei HMR neu ausgewertet -- die Verbindung
        // wird deshalb global zwischengespeichert.
        if (!(globalThis as any)._mongoClientPromise) {
            (globalThis as any)._mongoClientPromise = client.connect();
        }
        clientPromise = (globalThis as any)._mongoClientPromise;
    }

    mongoClient = await clientPromise;
    db = mongoClient.db(env.MONGODB_DB || "intern-test");
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
                'MongoDB-Server unterstuetzt keine Transaktionen (kein Replica Set), fahre ohne fort.'
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
    const message = String((err as { message?: unknown })?.message ?? '');
    return (
        code === 20 ||
        message.includes('Transaction numbers are only allowed') ||
        message.includes('Transactions are not supported') ||
        message.includes('replica set')
    );
}
