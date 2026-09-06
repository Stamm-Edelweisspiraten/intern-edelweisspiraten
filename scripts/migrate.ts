import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import {
    databaseFilePath,
    readDatabaseFile,
    resolveDatabaseUrl
} from "../src/lib/server/db/url.ts";

/**
 * Wendet alle ausstehenden Migrationen an.
 *
 * Wird sowohl von `npm run db:migrate` als auch beim Start des Containers
 * aufgerufen. Die Migrationstabelle liegt in `drizzle.__drizzle_migrations`;
 * ein zweiter Lauf ist damit folgenlos.
 *
 * Laeuft unter `node --experimental-strip-types` -- deshalb ein relativer
 * Import mit Dateiendung statt eines Pfad-Alias, und deshalb ein Modul, das
 * ohne `$env/dynamic/private` auskommt. Die Aufloesung ist dieselbe wie in der
 * Anwendung: DATABASE_URL, sonst die DB_* Variablen, sonst die vom
 * Einrichtungsassistenten geschriebene Datei.
 */

const QUELLEN = {
    "env-url": "DATABASE_URL",
    "env-parts": "den DB_* Variablen",
    file: "der Setup-Konfiguration",
    none: "nichts"
} as const;

let url: string | null = null;
let source: keyof typeof QUELLEN = "none";

try {
    const resolved = resolveDatabaseUrl(
        process.env,
        readDatabaseFile(databaseFilePath(process.env))
    );
    url = resolved.url;
    source = resolved.source;
} catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
}

if (!url) {
    console.error(
        "Keine Datenbank konfiguriert. Erwartet wird DATABASE_URL, ein Satz DB_* Variablen oder die Einrichtung unter /setup."
    );
    process.exit(1);
}

console.log(`Verbindung aus ${QUELLEN[source]}.`);

// max: 1 -- Migrationen laufen streng nacheinander.
const client = postgres(url, { max: 1, onnotice: () => {} });

try {
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
    console.log("Migrationen angewendet.");
} catch (err) {
    console.error("Migration fehlgeschlagen:", err);
    process.exit(1);
} finally {
    await client.end();
}
