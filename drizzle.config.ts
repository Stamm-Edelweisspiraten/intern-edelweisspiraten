import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import {
    databaseFilePath,
    readDatabaseFile,
    resolveDatabaseUrl
} from "./src/lib/server/db/url.ts";

/**
 * Nur fuer drizzle-kit (Migrationen erzeugen, Studio).
 *
 * Die Verbindung wird genauso aufgeloest wie in der Anwendung und in
 * scripts/migrate.ts -- DATABASE_URL, sonst die DB_* Variablen, sonst die vom
 * Einrichtungsassistenten geschriebene Datei. Der Rueckfall auf localhost
 * bleibt: `drizzle-kit generate` braucht ueberhaupt keine Datenbank, soll aber
 * auch nicht daran scheitern, dass keine konfiguriert ist.
 */
const { url } = resolveDatabaseUrl(process.env, readDatabaseFile(databaseFilePath(process.env)));

export default defineConfig({
    schema: "./src/lib/server/db/schema/index.ts",
    out: "./drizzle",
    dialect: "postgresql",
    dbCredentials: {
        url: url ?? "postgres://localhost:5432/postgres"
    },
    casing: "snake_case",
    verbose: true,
    strict: true
});
