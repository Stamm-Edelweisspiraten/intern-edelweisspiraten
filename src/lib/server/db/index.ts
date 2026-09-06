import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "$env/dynamic/private";
import * as schema from "./schema";
import { postgresErrorCode } from "./errors";
import {
    databaseFilePath,
    describeDatabase,
    readDatabaseFile,
    resolveDatabaseUrl,
    type DatabaseDescription,
    type DatabaseSource
} from "./url";

/**
 * Datenbankverbindung.
 *
 * Wie zuvor bei MongoDB wird hier NICHT auf den Verbindungsaufbau gewartet:
 * postgres.js baut die Verbindung beim ersten Zugriff auf. Ein `await` auf
 * Modulebene liess frueher schon den Produktionsbuild scheitern, weil dabei
 * keine Datenbank erreichbar ist.
 *
 * Woher die Verbindung kommt, entscheidet ./url.ts:
 *
 *   DATABASE_URL  ->  einzelne DB_* Variablen  ->  Setup-Konfiguration (Datei)  ->  keine
 *
 * Ohne jede Konfiguration wird ein Proxy zurueckgegeben, der bei jedem Zugriff
 * mit einer verstaendlichen Meldung wirft -- ein Build oder ein `svelte-check`
 * bleibt dadurch moeglich.
 */

export type Database = PostgresJsDatabase<typeof schema>;

interface Connection {
    url: string | null;
    source: DatabaseSource;
    error: string | null;
}

/**
 * Loest die Verbindung auf.
 *
 * Ein Fehler (etwa ein falsches DB_TYPE) darf hier nicht nach oben durch: er
 * wuerde den Build zerlegen. Er wird gemerkt und stattdessen bei jedem
 * Datenbankzugriff geworfen -- dort ist er zu sehen und stoert nichts anderes.
 */
function resolveConnection(): Connection {
    try {
        const fileConfig = readDatabaseFile(databaseFilePath(env));
        return { ...resolveDatabaseUrl(env, fileConfig), error: null };
    } catch (err) {
        return {
            url: null,
            source: "none",
            error: err instanceof Error ? err.message : String(err)
        };
    }
}

function unavailableReason(connection: Connection): string {
    return (
        connection.error ??
        "Keine Datenbank konfiguriert. Erwartet wird DATABASE_URL, ein Satz DB_* Variablen oder die Einrichtung unter /setup."
    );
}

let connection = resolveConnection();
const poolMax = Number(env.DATABASE_POOL_MAX ?? 10);

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
        max: poolMax,
        idle_timeout: 30,
        connect_timeout: 10,
        // Bezeichner und Enum-Werte sind ASCII; das erspart Ueberraschungen
        // bei abweichender Server-Locale.
        onnotice: () => {}
    });
}

function connect(connectionString: string): Database {
    if (import.meta.env.PROD) {
        sql = createClient(connectionString);
        return drizzle(sql, { schema });
    }

    // Im Entwicklungsmodus wird das Modul bei jedem HMR-Durchlauf neu
    // ausgewertet -- ohne diesen Zwischenspeicher entstuende jedes Mal ein
    // neuer Verbindungspool.
    const cache = globalThis as unknown as GlobalCache;
    sql = cache._pgClient ?? createClient(connectionString);
    const instance = cache._pgDb ?? drizzle(sql, { schema });
    cache._pgClient = sql;
    cache._pgDb = instance;
    return instance;
}

/**
 * Zweiter Versuch waehrend des Betriebs.
 *
 * Der Einrichtungsassistent unter /setup schreibt die Verbindung erst, waehrend
 * der Prozess schon laeuft. Ohne diesen Nachschlag bliebe es bis zum Neustart
 * bei "keine Datenbank" -- der Assistent koennte seine eigene Konfiguration
 * nicht benutzen und wuerde sich im Kreis drehen. Beim Build aendert das
 * nichts: dort ergibt auch der zweite Versuch nichts und der Proxy wirft wie
 * bisher.
 */
let lateDatabase: Database | null = null;

function connectLate(): Database | null {
    if (lateDatabase) return lateDatabase;

    const retry = resolveConnection();
    if (!retry.url) return null;

    connection = retry;
    lateDatabase = connect(retry.url);
    return lateDatabase;
}

if (connection.url) {
    database = connect(connection.url);
} else {
    console.warn(unavailableReason(connection));
    database = new Proxy(
        {},
        {
            get(_target, property) {
                const resolved = connectLate();
                if (!resolved) throw new Error(unavailableReason(connection));

                const value = Reflect.get(resolved as object, property);
                return typeof value === "function" ? value.bind(resolved) : value;
            }
        }
    ) as Database;
}

export const db = database;
export { sql, schema };

/** Was die Administrationsseite ueber die Verbindung anzeigen darf. */
export interface DatabaseInfo {
    configured: boolean;
    /** Woher die Verbindung stammt. */
    source: DatabaseSource;
    /** Host, Port, Datenbank, Benutzer, SSL -- ohne Passwort. */
    description: DatabaseDescription | null;
    /** Groesse des Verbindungspools (DATABASE_POOL_MAX). */
    poolMax: number;
    /** Wo die Setup-Konfiguration erwartet wird. */
    configFile: string;
    /** Grund, falls die Aufloesung fehlschlug. */
    error: string | null;
}

/**
 * Herkunft und Eckdaten der Verbindung.
 *
 * Bewusst eine Funktion und kein Wert: der Stand kann sich nach einer
 * nachtraeglichen Aufloesung noch aendern. Das Passwort ist nie enthalten --
 * describeDatabase gibt es gar nicht erst heraus.
 */
export function databaseInfo(): DatabaseInfo {
    return {
        configured: connection.url !== null,
        source: connection.source,
        description: connection.url ? describeDatabase(connection.url) : null,
        poolMax,
        configFile: databaseFilePath(env),
        error: connection.error
    };
}

/**
 * Uebersetzt einen Verbindungsfehler in einen Satz, mit dem jemand etwas
 * anfangen kann.
 *
 * Die Rohmeldungen von postgres.js sind englisch und nennen entweder nur einen
 * Fehlercode (28P01) oder einen Betriebssystemfehler (ECONNREFUSED). Beides
 * hilft bei der Ersteinrichtung nicht weiter -- dort ist fast immer eines von
 * vier Dingen falsch: Host, Port, Zugangsdaten oder der Datenbankname.
 */
export function describeConnectionError(err: unknown): string {
    // Verbindungsfehler koennen ebenfalls verpackt ankommen.
    const code = postgresErrorCode(err);
    const detail = err instanceof Error ? err.message : String(err);

    switch (code) {
        case "ENOTFOUND":
        case "EAI_AGAIN":
            return "Der angegebene Host ist nicht auflösbar. Bitte den Namen prüfen.";
        case "ECONNREFUSED":
            return "Der Host nimmt keine Verbindung an. Läuft dort ein PostgreSQL-Server auf diesem Port?";
        case "ETIMEDOUT":
        case "CONNECT_TIMEOUT":
            return "Der Server hat nicht geantwortet. Vermutlich blockiert eine Firewall den Port.";
        case "28P01":
            return "Benutzername oder Passwort wurden nicht akzeptiert.";
        case "28000":
            return "Die Anmeldung wurde abgelehnt. Vermutlich lässt pg_hba.conf diesen Zugang nicht zu.";
        case "3D000":
            return "Die angegebene Datenbank existiert auf diesem Server nicht.";
        case "42501":
            return "Der Zugang darf diese Datenbank nicht benutzen.";
        case "42P01":
            return "Die Verbindung steht, aber die Tabellen fehlen. Die Migrationen wurden noch nicht angewendet.";
        case "3F000":
            return "Das Schema fehlt. Die Migrationen wurden noch nicht angewendet.";
        default:
            return `Die Verbindung ist fehlgeschlagen: ${detail}`;
    }
}

export interface ConnectionTest {
    ok: boolean;
    message: string;
    /** Version des Servers, sofern die Abfrage gelang. */
    serverVersion: string | null;
}

/**
 * Prueft eine Verbindung mit einer eigenen, kurzlebigen Sitzung.
 *
 * Bewusst nicht ueber den gemeinsamen Pool: geprueft werden sollen ja gerade
 * Zugangsdaten, die noch nicht in Betrieb sind. `max: 1` und ein kurzer
 * Zeitablauf sorgen dafuer, dass ein falscher Host die Seite nicht minutenlang
 * haengen laesst.
 */
export async function testConnection(connectionString: string): Promise<ConnectionTest> {
    const client = postgres(connectionString, {
        max: 1,
        connect_timeout: 5,
        idle_timeout: 5,
        onnotice: () => {}
    });

    try {
        const rows = await client<{ server_version: string }[]>`show server_version`;
        return {
            ok: true,
            message: "Die Verbindung steht.",
            serverVersion: rows[0]?.server_version ?? null
        };
    } catch (err) {
        return { ok: false, message: describeConnectionError(err), serverVersion: null };
    } finally {
        // Ein Fehler beim Schliessen darf das Ergebnis nicht ueberschreiben.
        await client.end({ timeout: 5 }).catch(() => {});
    }
}

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
