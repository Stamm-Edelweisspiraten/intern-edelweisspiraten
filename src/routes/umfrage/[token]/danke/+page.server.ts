import type { PageServerLoad } from "./$types";
import { resolvePublicSurvey } from "$lib/server/surveyService";

/**
 * Die Bestaetigung nach einer Antwort ueber den oeffentlichen Link.
 *
 * Eigene Adresse statt einer Erfolgsmeldung ueber dem noch stehenden
 * Formular: nur so fuehrt ein Neuladen nicht zu "Formular erneut senden?"
 * und damit zu einer zweiten Antwort (Post/Redirect/Get).
 *
 * Das Token wird hier noch einmal aufgeloest -- aber nur, um den Titel zu
 * zeigen. Ist der Link inzwischen widerrufen, bleibt die Seite trotzdem
 * freundlich: die Antwort IST eingegangen, und wer gerade abgeschickt hat,
 * soll nicht vor einem Fehler stehen. Deshalb hier ausdruecklich KEIN 404.
 */
export const load: PageServerLoad = async (event) => {
    const entry = await resolvePublicSurvey(event.params.token);

    return {
        title: entry?.title ?? null
    };
};
