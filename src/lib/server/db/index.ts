import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "$env/dynamic/private";
import * as schema from "./schema";

/**
 * Datenbankverbindung.
 *
 * Wie zuvor bei MongoDB wird hier NICHT auf den Verbindungsaufbau gewartet:
 * postgres.js baut die Verbindung beim ersten Zugriff auf. Ein `await` auf
 * Modulebene liess frueher schon den Produktionsbuild scheitern, weil dabei
 * keine Datenbank erreichbar ist.
 *
 * Ohne DATABASE_URL wird ein Proxy zurueckgegeben, der bei jedem Zugriff mit
 * einer verstaendlichen Meldung wirft -- ein Build oder ein `svelte-check`
 * bleibt dadurch moeglich.
 */

export type Database = PostgresJsDatabase<typeof schema>;

const url = env.DATABASE_URL;

interface GlobalCache {
    _pgClient?: postgres.Sql;
    _pgDb?: Database;
}

let sql: postgres.Sql | null = null;
let database: Database;

function createClient(connectionString: string): postgres.Sql {
    return postgres(connectionString, {
        // Ein Pool je Prozess. adapter-node laeuft eingliedrig, mehr Verbindungen
        // bringen nichts und belasten nur die Datenbank.
        max: Number(env.DATABASE_POOL_MAX ?? 10),
        idle_timeout: 30,
        connect_timeout: 10,
        // Bezeichner und Enum-Werte sind ASCII; das erspart Ueberraschungen
        // bei abweichender Server-Locale.
        onnotice: () => {}
    });
}

if (url) {
    if (import.meta.env.PROD) {
        sql = createClient(url);
        database = drizzle(sql, { schema });
    } else {
        // Im Entwicklungsmodus wird das Modul bei jedem HMR-Durchlauf neu
        // ausgewertet -- ohne diesen Zwischenspeicher entstuende jedes Mal ein
        // neuer Verbindungspool.
        const cache = globalThis as unknown as GlobalCache;
        sql = cache._pgClient ?? createClient(url);
        database = cache._pgDb ?? drizzle(sql, { schema });
        cache._pgClient = sql;
        cache._pgDb = database;
    }
} else {
    console.warn("DATABASE_URL ist nicht gesetzt. Datenbankzugriff wird fehlschlagen.");
    database = new Proxy(
        {},
        {
            get() {
                throw new Error("DATABASE_URL ist nicht konfiguriert");
            }
        }
    ) as Database;
}

export const db = database;
export { sql, schema };

/**
 * Fuehrt eine Schreibfolge in einer Transaktion aus.
 *
 * Gegenueber der MongoDB-Fassung entfaellt die Erkennung, ob der Server
 * Transaktionen ueberhaupt beherrscht: PostgreSQL kann sie immer. Damit
 * entfallen auch die ausgleichenden Gegenbuchungen, die vorher noetig waren,
 * wenn ein Schritt nach einem bereits geschriebenen Schritt fehlschlug.
 */
export async function withTransaction<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => fn(tx as unknown as Database));
}

/** Kurzform fuer Funktionen, die wahlweise in einer Transaktion laufen. */
export type Executor = Database;
