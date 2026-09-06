import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireGroupsWithPermission } from "$lib/server/permissionGuard";
import { exportResponsesCsv, getSurvey, mayManageSurvey } from "$lib/server/surveyService";
import { downloadHeaders } from "$lib/server/http/download";

/**
 * Alle Antworten einer Umfrage als CSV.
 *
 * Dieselbe zweistufige Prüfung wie die Auswertungsseite: `surveys.results`
 * und danach die Gruppenbindung gegen die Freigaben dieser Umfrage. Ein
 * Datei-Abruf ist kein `load` -- er muss sein Recht selbst prüfen.
 *
 * Trenner, BOM und der Schutz vor Formeln stecken in `exportResponsesCsv`
 * bzw. `$lib/server/csv`; die Kopfzeilen kommen aus `downloadHeaders`, damit
 * ein Umfragetitel mit Anführungszeichen keine weitere Kopfzeile einschleust.
 */

/** Dateiname aus dem Titel: ASCII, klein, mit Bindestrichen. */
function slugify(title: string): string {
    const slug = title
        .toLowerCase()
        .replace(/ä/g, "ae")
        .replace(/ö/g, "oe")
        .replace(/ü/g, "ue")
        .replace(/ß/g, "ss")
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    return slug || "umfrage";
}

export const GET: RequestHandler = async (event) => {
    const scope = requireGroupsWithPermission(event, "surveys.results");
    if (!(await mayManageSurvey(event.params.id, scope))) {
        throw error(403, "Keine Berechtigung");
    }

    const entry = await getSurvey(event.params.id, {}, { manageAll: true });
    if (!entry) throw error(404, "Umfrage nicht gefunden");

    const csv = await exportResponsesCsv(entry.id);

    return new Response(csv, {
        headers: downloadHeaders({
            contentType: "text/csv; charset=utf-8",
            filename: `umfrage-${slugify(entry.title)}.csv`,
            forceDownload: true
        })
    });
};
