import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * Nur fuer drizzle-kit (Migrationen erzeugen, Studio). Die Anwendung selbst
 * liest DATABASE_URL ueber $env/dynamic/private.
 */
export default defineConfig({
    schema: "./src/lib/server/db/schema/index.ts",
    out: "./drizzle",
    dialect: "postgresql",
    dbCredentials: {
        url: process.env.DATABASE_URL ?? "postgres://localhost:5432/postgres"
    },
    casing: "snake_case",
    verbose: true,
    strict: true
});
