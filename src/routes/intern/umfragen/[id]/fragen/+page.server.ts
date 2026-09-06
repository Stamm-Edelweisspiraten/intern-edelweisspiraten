import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";
import { requireGroupsWithPermission } from "$lib/server/permissionGuard";
import { getSurvey, mayManageSurvey, setSurveyFields } from "$lib/server/surveyService";
import { parseFieldRows } from "../../parseFields";

/**
 * Die Fragen einer Umfrage bearbeiten.
 *
 * Vorher steckte der Editor in einem Dialog auf der Detailseite. Für elf
 * Feldtypen mit Optionen, „Sonstiges" und Grenzen ist ein Dialog zu klein --
 * und der Assistent braucht denselben Editor ohnehin. Beide Stellen binden
 * jetzt `FieldEditor.svelte` ein; das Einlesen steht in `parseFields.ts`.
 *
 * Wer hier hin darf, darf die Umfrage verwalten -- ein reines Lesen der
 * Fragenliste steht auf der Detailseite.
 */

/** Sichert die Verwaltung dieser einen Umfrage ab. */
async function requireManage(event: RequestEvent) {
    const scope = requireGroupsWithPermission(event, "surveys.manage");
    if (!(await mayManageSurvey(event.params.id, scope))) {
        throw error(403, "Keine Berechtigung");
    }
}

export const load: PageServerLoad = async (event) => {
    await requireManage(event);

    /*
     * Die Rechtepruefung ist gelaufen; die Sichtbarkeitsregel darf die
     * Bearbeitung danach nicht noch einmal ausschliessen. Dieselbe Machart
     * wie in der Auswertung; die Rechte klaert allein `requireManage`.
     */
    const entry = await getSurvey(event.params.id, {}, { manageAll: true });
    if (!entry) throw error(404, "Umfrage nicht gefunden");

    return {
        survey: {
            id: entry.id,
            title: entry.title,
            status: entry.status,
            responseCount: entry.responseCount,
            fields: entry.fields
        },
        /** Sobald Antworten vorliegen, sind Löschen und Typwechsel gesperrt. */
        fieldsLocked: entry.responseCount > 0
    };
};

export const actions: Actions = {
    setFields: async (event) => {
        await requireManage(event);

        const form = await event.request.formData();
        const result = await setSurveyFields(event.params.id, parseFieldRows(form));

        if (!result.ok) return fail(400, { error: result.error });

        return { success: "Die Fragen wurden gespeichert." };
    }
};
