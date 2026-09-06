import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { requireAnyPermission } from "$lib/server/permissionGuard";
import {
    getStorageConfigView,
    normalizePrefix,
    saveStorageConfig,
    storageFromEnv
} from "$lib/server/storage/settings";
import { resetStorageClient, testStorage } from "$lib/server/storage";
import { countPendingMigration, migrateFilesToStorage } from "$lib/server/fileStore";
import { hasEncryptionKey } from "$lib/server/crypto";

/**
 * Objektspeicher einrichten.
 *
 * Drei Vorgänge: speichern, Verbindung prüfen, Dateien umziehen. Der
 * Verbindungstest schreibt und liest ein Testobjekt -- ein Zugang mit reinem
 * Leserecht besteht sonst die Prüfung und scheitert erst bei der ersten
 * hochgeladenen Datei.
 *
 * Der geheime Schlüssel wird nie an die Seite geschickt. Bleibt das Feld
 * leer, bleibt der hinterlegte Schlüssel unverändert.
 */

const GUARD = ["admin.view", "system.settings.update"] as const;

export const load: PageServerLoad = async (event) => {
    requireAnyPermission(event, ["admin.view", "system.settings.view"]);

    const [config, pending] = await Promise.all([
        getStorageConfigView(),
        countPendingMigration()
    ]);

    return {
        config,
        pending,
        hasEncryptionKey: hasEncryptionKey(),
        fromEnv: storageFromEnv()
    };
};

export const actions: Actions = {
    save: async (event) => {
        requireAnyPermission(event, GUARD);

        const form = await event.request.formData();
        const actor = event.locals.user?.email ?? "system";

        const result = await saveStorageConfig(
            {
                endpoint: String(form.get("endpoint") ?? "").trim(),
                region: String(form.get("region") ?? "").trim(),
                bucket: String(form.get("bucket") ?? "").trim(),
                accessKeyId: String(form.get("accessKeyId") ?? "").trim(),
                secretAccessKey: String(form.get("secretAccessKey") ?? ""),
                prefix: normalizePrefix(String(form.get("prefix") ?? "")),
                forcePathStyle: form.get("forcePathStyle") === "on"
            },
            actor
        );

        if (!result.ok) return fail(400, { error: result.error });

        // Der zwischengespeicherte Client trägt noch die alten Zugangsdaten.
        resetStorageClient();

        return { success: "Die Einstellungen wurden gespeichert." };
    },

    test: async (event) => {
        requireAnyPermission(event, GUARD);

        const result = await testStorage();
        if (!result.ok) return fail(400, { error: result.error });

        return {
            success: result.error
                ? `Verbindung erfolgreich. ${result.error}`
                : "Verbindung erfolgreich: schreiben, lesen und löschen funktionieren."
        };
    },

    /**
     * Überträgt alle Dateien, die noch in der Datenbank liegen.
     *
     * Wiederholbar: was oben liegt, trägt einen Schlüssel und wird
     * übersprungen. Ein zweiter Lauf meldet deshalb 0 übertragene Dateien.
     */
    migrate: async (event) => {
        requireAnyPermission(event, GUARD);

        const report = await migrateFilesToStorage();

        if (report.errors.length > 0 && report.moved === 0) {
            return fail(400, { error: report.errors.join(" ") });
        }

        const parts = [`${report.moved} von ${report.pending} Dateien übertragen`];
        if (report.bytes > 0) parts.push(`${Math.round(report.bytes / 1024)} kB`);
        if (report.failed > 0) parts.push(`${report.failed} fehlgeschlagen`);

        return {
            success: `${parts.join(", ")}.`,
            errors: report.errors
        };
    }
};
