import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { requireGroupsWithPermission } from "$lib/server/permissionGuard";
import { getResults, getSurvey, mayManageSurvey } from "$lib/server/surveyService";

/**
 * Auswertung einer Umfrage.
 *
 * Zwei Stufen: `surveys.results` muss vorliegen, und die Umfrage muss in die
 * Gruppen fallen, für die es vorliegt. `requireGroupsWithPermission` liefert
 * dafür `null` (stammesweit), `[]` (kein Recht -> 403) oder die Gruppenliste;
 * `mayManageSurvey` prüft sie gegen die Freigaben dieser einen Umfrage.
 *
 * Es gibt hier keine Aktionen -- die Seite liest nur.
 */

export const load: PageServerLoad = async (event) => {
    const scope = requireGroupsWithPermission(event, "surveys.results");
    if (!(await mayManageSurvey(event.params.id, scope))) {
        throw error(403, "Keine Berechtigung");
    }

    const [entry, results] = await Promise.all([
        // Die Rechteprüfung ist gelaufen; die Sichtbarkeitsregel darf die
        // Auswertung danach nicht noch einmal ausschließen.
        getSurvey(event.params.id, {}, { manageAll: true }),
        getResults(event.params.id)
    ]);

    if (!entry || !results) throw error(404, "Umfrage nicht gefunden");

    return {
        survey: {
            id: entry.id,
            title: entry.title,
            description: entry.description,
            status: entry.status,
            audience: entry.audience,
            anonymous: entry.anonymous,
            multiplePerUser: entry.multiplePerUser,
            eventTitle: entry.eventTitle,
            closesAt: entry.closesAt?.toISOString() ?? null
        },
        results: {
            responseCount: results.responseCount,
            /** Herkunft getrennt: über den Link ist keine Identität geprüft. */
            internCount: results.internCount,
            linkCount: results.linkCount,
            fields: results.fields.map((entry) => ({
                field: entry.field,
                answered: entry.answered,
                /**
                 * Die Bezugsgröße steht am FELD, nicht nur oben: eine
                 * nachträglich ergänzte Frage hat weniger Antworten als die
                 * Umfrage insgesamt, und „3 von 12“ sagt das, ohne dass
                 * jemand rechnen muss.
                 */
                responseCount: entry.responseCount,
                counts: entry.counts,
                yes: entry.yes,
                no: entry.no,
                average: entry.average,
                texts: entry.texts.map((text) => ({
                    value: text.value,
                    author: text.author,
                    source: text.source,
                    submittedAt: text.submittedAt.toISOString()
                })),
                /** Die Freitexte neben „Sonstiges“ -- getrennt von `texts`. */
                otherTexts: entry.otherTexts.map((text) => ({
                    value: text.value,
                    author: text.author,
                    source: text.source,
                    submittedAt: text.submittedAt.toISOString()
                }))
            }))
        }
    };
};
