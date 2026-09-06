import fs from "node:fs";
import path from "node:path";

/**
 * Aufloesung der Datenbankverbindung, ohne jeden Bezug zu SvelteKit.
 *
 * Der Grund fuer die Trennung ist derselbe wie bei crypto/aes.ts und steht in
 * scripts/seed.ts ausgeschrieben: die Anwendungsmodule lesen DATABASE_URL ueber
 * `$env/dynamic/private`, einen Alias, den es ausserhalb von Vite nicht gibt.
 * scripts/migrate.ts und drizzle.config.ts laufen aber genau dort -- ohne diese
 * Trennung muessten sie die Aufloesung ein zweites Mal nachbauen und wuerden
 * frueher oder spaeter von der Anwendung abweichen.
 *
 * Reihenfolge der Quellen:
 *
 *   DATABASE_URL  ->  einzelne DB_* Variablen  ->  Setup-Konfiguration (Datei)  ->  keine
 *
 * Die vollstaendige URL steht bewusst an erster Stelle: sie ist der Weg, den
 * Container, CI und Hoster vorgeben, und muss alles andere ueberstimmen. Die
 * einzelnen DB_* Variablen sind fuer Umgebungen gedacht, die Host, Benutzer und
 * Passwort getrennt einspeisen (Kubernetes-Secrets, Docker-Secrets); sie greifen
 * nur, wenn mindestens DB_HOST und DB_NAME gesetzt sind -- ein halb gefuellter
 * Satz Variablen ergaebe sonst eine URL, die auf localhost zeigt und niemanden
 * darauf hinweist. Die Datei schliesslich schreibt der Einrichtungsassistent
 * unter /setup; sie ist der Weg fuer Installationen, die niemand von Hand
 * konfiguriert.
 *
 * Diese Anwendung setzt PostgreSQL voraus -- Schema, Migrationen (plpgsql,
 * DEFERRABLE INITIALLY DEFERRED) und CI sind darauf gebaut. DB_TYPE wird
 * deshalb nur gelesen, um eine falsche Erwartung sofort sichtbar zu machen,
 * statt still auf den Default zu fallen.
 */

/** Voreinstellung, wenn kein Port angegeben ist. */
const DEFAULT_PORT = 5432;

/** Voreinstellung fuer die vom Einrichtungsassistenten geschriebene Datei. */
const DEFAULT_CONFIG_FILE = "./data/database.json";

/** Was DB_TYPE enthalten darf. Alles andere ist ein Fehler, kein Default. */
const SUPPORTED_TYPES = ["postgres", "postgresql"];

/** Einzelteile einer Verbindung. */
export interface DatabaseParts {
    host: string;
    port?: number;
    name: string;
    user?: string;
    password?: string;
    ssl?: boolean;
}

/**
 * Inhalt der Setup-Datei.
 *
 * Entweder ein vollstaendiger Connection String oder die Einzelteile -- der
 * Assistent laesst beides zu, weil ein Hoster oft genau eine URL herausgibt.
 */
export interface DatabaseFileConfig {
    url?: string;
    host?: string;
    port?: number;
    name?: string;
    user?: string;
    password?: string;
    ssl?: boolean;
}

export type DatabaseSource = "env-url" | "env-parts" | "file" | "none";

export interface ResolvedDatabase {
    url: string | null;
    source: DatabaseSource;
}

/** Beschreibung einer Verbindung OHNE Passwort. */
export interface DatabaseDescription {
    host: string;
    port: number;
    database: string;
    user: string;
    ssl: boolean;
}

/** Wo die vom Einrichtungsassistenten geschriebene Datei liegt. */
export function databaseFilePath(env: Record<string, string | undefined>): string {
    const configured = env.DB_CONFIG_FILE?.trim();
    return configured ? configured : DEFAULT_CONFIG_FILE;
}

function parseBoolean(raw: string | undefined | null, fallback: boolean): boolean {
    if (raw === undefined || raw === null) return fallback;

    const value = raw.trim().toLowerCase();
    if (value === "") return fallback;

    return ["1", "true", "yes", "on", "require", "verify-ca", "verify-full"].includes(value);
}

function parsePort(raw: string | undefined): number | undefined {
    const value = raw?.trim();
    if (!value) return undefined;

    const port = Number(value);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`DB_PORT="${raw}" ist keine gueltige Portnummer.`);
    }
    return port;
}

/**
 * Prueft DB_TYPE, sobald die Variable ueberhaupt gesetzt ist.
 *
 * Absichtlich vor jeder anderen Auswertung: wer DB_TYPE=mysql setzt, erwartet
 * MySQL. Diese Erwartung still zu uebergehen und trotzdem PostgreSQL zu
 * verbinden waere die unangenehmste Art, das herauszufinden.
 */
function assertSupportedType(raw: string | undefined): void {
    const value = raw?.trim().toLowerCase();
    if (!value) return;

    if (!SUPPORTED_TYPES.includes(value)) {
        throw new Error(
            `DB_TYPE="${raw}" wird nicht unterstuetzt. Diese Anwendung setzt PostgreSQL ` +
                `voraus; erlaubt sind "postgres" und "postgresql".`
        );
    }
}

/**
 * Baut eine Verbindungs-URL aus Einzelteilen.
 *
 * Benutzername, Passwort und Datenbankname werden kodiert. Das ist keine
 * Kosmetik: ein `@` im Passwort beendet sonst den Benutzerteil, ein `/` beendet
 * den Host, und die entstehende URL zeigt auf einen Server, den es nicht gibt
 * -- mit einer Fehlermeldung, die nirgends auf das Passwort deutet. Der Host
 * bleibt unkodiert, damit IPv6-Adressen in Klammern erhalten bleiben.
 */
export function buildDatabaseUrl(parts: DatabaseParts): string {
    const host = parts.host?.trim() ?? "";
    if (!host) throw new Error("Es ist kein Datenbank-Host angegeben.");

    const name = parts.name?.trim() ?? "";
    if (!name) throw new Error("Es ist kein Datenbankname angegeben.");

    const user = parts.user?.trim() ?? "";
    const password = parts.password ?? "";
    const credentials = user
        ? `${encodeURIComponent(user)}${password ? `:${encodeURIComponent(password)}` : ""}@`
        : "";

    // IPv6 gehoert in eckige Klammern, sonst verschluckt der Doppelpunkt den Port.
    const authority = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
    const port = parts.port ?? DEFAULT_PORT;
    const query = parts.ssl ? "?sslmode=require" : "";

    return `postgresql://${credentials}${authority}:${port}/${encodeURIComponent(name)}${query}`;
}

/**
 * Ermittelt die zu verwendende Verbindung.
 *
 *   DATABASE_URL  ->  einzelne DB_* Variablen  ->  Setup-Konfiguration (Datei)  ->  keine
 *
 * Wirft nur bei einer widerspruechlichen Angabe (DB_TYPE, DB_PORT). Fehlt jede
 * Konfiguration, ist das kein Fehler, sondern `{ url: null, source: "none" }` --
 * ein Build ohne Datenbank muss moeglich bleiben.
 */
export function resolveDatabaseUrl(
    env: Record<string, string | undefined>,
    fileConfig?: DatabaseFileConfig | null
): ResolvedDatabase {
    assertSupportedType(env.DB_TYPE);

    const direct = env.DATABASE_URL?.trim();
    if (direct) return { url: direct, source: "env-url" };

    const host = env.DB_HOST?.trim();
    const name = env.DB_NAME?.trim();
    if (host && name) {
        return {
            url: buildDatabaseUrl({
                host,
                port: parsePort(env.DB_PORT),
                name,
                user: env.DB_USER,
                password: env.DB_PASSWORD,
                ssl: parseBoolean(env.DB_SSL, false)
            }),
            source: "env-parts"
        };
    }

    if (fileConfig) {
        const fromFile = fileConfig.url?.trim();
        if (fromFile) return { url: fromFile, source: "file" };

        const fileHost = fileConfig.host?.trim();
        const fileName = fileConfig.name?.trim();
        if (fileHost && fileName) {
            return {
                url: buildDatabaseUrl({
                    host: fileHost,
                    port: fileConfig.port,
                    name: fileName,
                    user: fileConfig.user,
                    password: fileConfig.password,
                    ssl: fileConfig.ssl === true
                }),
                source: "file"
            };
        }
    }

    return { url: null, source: "none" };
}

/**
 * Zerlegt eine Verbindungs-URL in ihre anzeigbaren Bestandteile.
 *
 * Das Passwort wird bewusst nicht zurueckgegeben -- auch nicht maskiert. Was
 * nicht herauskommt, kann auch nicht versehentlich in einem Log oder auf einer
 * Seite landen. Liefert `null`, wenn sich die URL nicht lesen laesst.
 */
export function describeDatabase(url: string): DatabaseDescription | null {
    try {
        const parsed = new URL(url);
        const sslMode = parsed.searchParams.get("sslmode");
        const sslFlag = parsed.searchParams.get("ssl");

        return {
            host: parsed.hostname,
            port: parsed.port ? Number(parsed.port) : DEFAULT_PORT,
            database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
            user: decodeURIComponent(parsed.username),
            ssl: (sslMode !== null && sslMode !== "disable") || parseBoolean(sslFlag, false)
        };
    } catch {
        return null;
    }
}

/**
 * Liest die Setup-Datei.
 *
 * Eine fehlende Datei ist der Normalfall vor der Einrichtung und deshalb kein
 * Fehler. Eine kaputte Datei wird gemeldet, bringt den Start aber nicht um:
 * die Umgebungsvariablen koennen die Verbindung trotzdem liefern.
 */
export function readDatabaseFile(filePath: string): DatabaseFileConfig | null {
    try {
        const parsed: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
        return parsed as DatabaseFileConfig;
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        console.warn(`Die Datenbankkonfiguration ${filePath} ist unlesbar:`, err);
        return null;
    }
}

/**
 * Schreibt die Setup-Datei.
 *
 * Rechte 0600, weil dort ein Passwort im Klartext steht. Unter Windows bleibt
 * das wirkungslos, schadet aber nicht; unter Linux -- also im Container -- ist
 * es der Unterschied zwischen "nur der Dienst" und "jeder auf dem Rechner".
 */
export function writeDatabaseFile(filePath: string, config: DatabaseFileConfig): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(config, null, 4)}\n`, { mode: 0o600 });

    try {
        // writeFileSync setzt den Modus nur beim Anlegen; eine bereits
        // vorhandene Datei behielte sonst ihre alten Rechte.
        fs.chmodSync(filePath, 0o600);
    } catch {
        // Unter Windows nicht unterstuetzt.
    }
}
