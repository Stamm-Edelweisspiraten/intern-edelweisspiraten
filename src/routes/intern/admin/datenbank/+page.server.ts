import fs from "node:fs";
import { fail } from "@sveltejs/kit";
import { sql } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types";
import { requireAnyPermission } from "$lib/server/permissionGuard";
import { databaseInfo, db, describeConnectionError } from "$lib/server/db";

/**
 * Konfigurationsuebersicht der Datenbank.
 *
 * Bewusst eine reine Anzeige: die Verbindung laesst sich hier nicht wechseln.
 * Der Verbindungspool entsteht beim Laden des Moduls und wird prozessweit
 * geteilt -- ein Wechsel im Betrieb liesse offene Transaktionen und den
 * Sitzungsspeicher an zwei Datenbanken haengen, und ohne Migration und
 * Datenumzug waere er schlicht Datenverlust. Was zu tun ist, steht auf der
 * Seite: Umgebungsvariable setzen, neu starten.
 *
 * Das Passwort taucht hier nirgends auf -- auch nicht maskiert aus der URL
 * zurueckgerechnet.
 */

/** Ein Eintrag aus drizzle/meta/_journal.json. */
interface JournalEntry {
    idx: number;
    when: number;
    tag: string;
}

/** Zeile aus drizzle.__drizzle_migrations. `created_at` ist ein bigint und
 *  kommt deshalb als Zeichenkette zurueck. */
type MigrationRow = Record<string, unknown> & {
    hash: string;
    created_at: string | number;
};

/**
 * Liest das Journal der Migrationsdateien.
 *
 * Die Liste im Ordner ist die Soll-Seite, die Tabelle
 * `drizzle.__drizzle_migrations` die Ist-Seite. Verglichen wird ueber den
 * Zeitstempel: die Tabelle haelt in `created_at` genau das `when` aus dem
 * Journal, der Dateiname steht dort nicht.
 */
function readJournal(): JournalEntry[] {
    try {
        const raw = fs.readFileSync("./drizzle/meta/_journal.json", "utf8");
        const parsed = JSON.parse(raw) as { entries?: JournalEntry[] };
        return parsed.entries ?? [];
    } catch {
        // Im fertigen Build kann der Ordner fehlen; dann bleibt die Anzeige
        // auf die angewendeten Migrationen beschraenkt.
        return [];
    }
}

export const load: PageServerLoad = async (event) => {
    requireAnyPermission(event, ["admin.view", "system.settings.view"]);

    const info = databaseInfo();
    const journal = readJournal();

    let serverVersion: string | null = null;
    let reachable = false;
    let connectionError: string | null = null;
    let appliedRows: MigrationRow[] = [];
    let migrationsError: string | null = null;

    try {
        const rows = await db.execute<{ server_version: string }>(sql`show server_version`);
        serverVersion = rows[0]?.server_version ?? null;
        reachable = true;
    } catch (err) {
        connectionError = describeConnectionError(err);
    }

    if (reachable) {
        try {
            appliedRows = await db.execute<MigrationRow>(
                sql`select hash, created_at from drizzle.__drizzle_migrations order by created_at`
            );
        } catch {
            // Die Tabelle entsteht erst mit der ersten Migration.
            migrationsError = "Es wurde noch keine Migration angewendet.";
        }
    }

    const appliedStamps = new Set(appliedRows.map((row) => Number(row.created_at)));

    const migrations = journal.map((entry) => ({
        tag: entry.tag,
        applied: appliedStamps.has(entry.when),
        appliedAt: appliedStamps.has(entry.when) ? new Date(entry.when).toISOString() : null
    }));

    const lastStamp = appliedRows.length
        ? Number(appliedRows[appliedRows.length - 1].created_at)
        : null;

    return {
        info: {
            configured: info.configured,
            source: info.source,
            host: info.description?.host ?? null,
            port: info.description?.port ?? null,
            database: info.description?.database ?? null,
            user: info.description?.user ?? null,
            ssl: info.description?.ssl ?? false,
            poolMax: info.poolMax,
            configFile: info.configFile,
            error: info.error
        },
        server: { reachable, version: serverVersion, error: connectionError },
        migrations: {
            entries: migrations,
            /** Angewendet, aber ohne zugehoerige Datei -- ein Hinweis auf einen Rueckbau. */
            appliedCount: appliedRows.length,
            pendingCount: migrations.filter((entry) => !entry.applied).length,
            lastAppliedAt: lastStamp ? new Date(lastStamp).toISOString() : null,
            error: migrationsError
        }
    };
};

export const actions: Actions = {
    /**
     * Prueft die Verbindung, die die Anwendung wirklich benutzt.
     *
     * Absichtlich ueber den bestehenden Pool und nicht ueber eine frisch
     * aufgebaute Sitzung: die Frage lautet "arbeitet der Pool?", nicht "waere
     * eine Verbindung moeglich?".
     */
    test: async (event) => {
        requireAnyPermission(event, ["admin.view", "system.settings.update"]);

        const started = Date.now();
        try {
            const rows = await db.execute<{ server_version: string }>(sql`show server_version`);
            const elapsed = Date.now() - started;
            const version = rows[0]?.server_version;

            return {
                success: version
                    ? `Die Verbindung steht: PostgreSQL ${version}, Antwort in ${elapsed} ms.`
                    : `Die Verbindung steht, Antwort in ${elapsed} ms.`
            };
        } catch (err) {
            return fail(400, { error: describeConnectionError(err) });
        }
    }
};
