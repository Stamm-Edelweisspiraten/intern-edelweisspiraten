import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

/**
 * Wendet alle ausstehenden Migrationen an.
 *
 * Wird sowohl von `npm run db:migrate` als auch beim Start des Containers
 * aufgerufen. Die Migrationstabelle liegt in `drizzle.__drizzle_migrations`;
 * ein zweiter Lauf ist damit folgenlos.
 */

const url = process.env.DATABASE_URL;
if (!url) {
    console.error("DATABASE_URL ist nicht gesetzt.");
    process.exit(1);
}

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
