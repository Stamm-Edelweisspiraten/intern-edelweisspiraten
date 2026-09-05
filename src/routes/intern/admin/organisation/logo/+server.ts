import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { readFile } from "$lib/server/fileStore";
import { getOrganizationSettings } from "$lib/server/settingsService";

/**
 * Logo der Organisation.
 *
 * Bewusst ohne Berechtigungspruefung ueber die Kopfzeile hinaus: die Datei
 * ist Teil des Erscheinungsbilds und wird auf jeder Seite des internen
 * Bereichs angezeigt. Der globale Gate in hooks.server.ts verlangt ohnehin
 * eine Anmeldung.
 */
export const GET: RequestHandler = async () => {
    const organization = await getOrganizationSettings();
    if (!organization.logoFileId) throw error(404, "Kein Logo hinterlegt");

    const file = await readFile(organization.logoFileId);
    if (!file) throw error(404, "Kein Logo hinterlegt");

    return new Response(new Uint8Array(file.content), {
        headers: {
            "Content-Type": file.contentType,
            "Content-Length": String(file.size),
            // Kurz zwischenspeichern: das Logo aendert sich selten, soll nach
            // einem Wechsel aber nicht tagelang haengenbleiben.
            "Cache-Control": "private, max-age=300"
        }
    });
};
