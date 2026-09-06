import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";
import {
    resolvePublicSurvey,
    submitResponse,
    type SubmittedAnswer,
    type SurveyEntry
} from "$lib/server/surveyService";
import { expectsAnswer } from "$lib/surveys/fields";
import { checkRateLimit, RATE_LIMITS, rateLimitKey } from "$lib/server/auth/rateLimit";

/**
 * Eine Umfrage beantworten -- OHNE Anmeldung.
 *
 * Die einzige schreibende Stelle des Portals, die ohne Sitzung auskommt.
 * Deshalb steht hier ausführlich, was sie traegt und was nicht:
 *
 *   - **Kein Guard aus `permissionGuard.ts`.** Fuer eine Anfrage ohne Sitzung
 *     sind `locals.user`, `permissions` und `grants` leer; jeder Guard wiese
 *     bedingungslos ab und saehe dabei aus wie Schutz. Das Recht ergibt sich
 *     allein aus dem Token -- dieselbe Lage wie beim Kalenderabruf.
 *   - **Der Pfad liegt auf oberster Ebene**, nicht unter `/intern/umfragen`.
 *     Dort erzwingt `routeGuards.test.ts` fuer jede Aktion einen Guard; eine
 *     Ausnahme mitten im Modul wuerde die Regel fuer alles daneben aufweichen.
 *     `"/umfrage"` steht dafuer in `PUBLIC_PREFIXES` von `hooks.server.ts`.
 *   - **Das Token ist die eigentliche Absicherung**: 32 zufaellige Byte, in
 *     der Datenbank nur als sha256-Abdruck. Die Ratenbegrenzung fangt nur
 *     stumpfes Fluten ab und ist hinter einem Reverse Proxy ohne
 *     `ADDRESS_HEADER` wirkungslos -- siehe README.
 *   - **Der Pfad enthaelt das Token**, weshalb `handleError` ihn vor dem
 *     Protokollieren auf `/umfrage/[token]` kuerzt. Ohne das schriebe jede
 *     404 auf einen abgelaufenen Link einen benutzbaren Ausweis ins Log.
 *
 * Der Formular-POST ist zusaetzlich durch die Origin-Pruefung von
 * adapter-node gedeckt; deshalb ist es ein echtes Formular und kein `fetch`.
 */

/** Alles, was der Aufrufer ueber eine nicht (mehr) gueltige Adresse erfaehrt. */
const NOT_AVAILABLE = "Diese Umfrage ist über diesen Link nicht (mehr) erreichbar.";

/**
 * Warum durchgehend 404 und nicht 410 fuer "abgelaufen"?
 *
 * Ein eigener Status waere ein Orakel ueber fremde Tokens. Der TEXT
 * unterscheidet trotzdem -- aber erst, NACHDEM das Token aufgeloest wurde:
 * wer den Link hat, darf erfahren, dass er abgelaufen ist, statt vor einem
 * "gibt es nicht" zu stehen. Wer ihn nicht hat, erfaehrt nichts.
 */
function unavailable(): never {
    throw error(404, NOT_AVAILABLE);
}

/** Der Zustand einer aufgeloesten Umfrage -- oder ein Grund, sie zu sperren. */
function closedReason(entry: SurveyEntry): string | null {
    if (entry.status === "draft") {
        return "Diese Umfrage ist noch nicht veröffentlicht.";
    }
    if (entry.status === "closed") {
        return "Diese Umfrage ist abgeschlossen und nimmt keine Antworten mehr an.";
    }
    if (entry.opensAt && entry.opensAt.getTime() > Date.now()) {
        return "Diese Umfrage ist noch nicht geöffnet.";
    }
    if (entry.closesAt && entry.closesAt.getTime() < Date.now()) {
        return "Der Antwortzeitraum ist abgelaufen.";
    }
    return null;
}

/**
 * Loest das Token auf und begrenzt dabei die Aufrufe.
 *
 * Gezaehlt wird ueber den Umfrage-Schluessel, NICHT ueber das Token: der
 * Schluessel steht im Klartext in `login_attempts`, und ein Token gehoert dort
 * nicht hinein. Vor dem Aufloesen ist die Umfrage aber noch unbekannt --
 * deshalb erst aufloesen, dann zaehlen.
 */
async function resolve(event: RequestEvent): Promise<SurveyEntry> {
    const entry = await resolvePublicSurvey(event.params.token);
    if (!entry) unavailable();
    return entry;
}

export const load: PageServerLoad = async (event) => {
    const entry = await resolve(event);

    return {
        survey: {
            id: entry.id,
            title: entry.title,
            description: entry.description,
            nameMode: entry.publicNameMode,
            anonymous: entry.anonymous,
            closesAt: entry.closesAt?.toISOString() ?? null,
            /*
             * Die Fragen -- und NUR sie. Freigaben, Antwortzahl und
             * Terminbezug gehen niemanden etwas an, der die Umfrage bloss
             * ueber den Link kennt.
             */
            fields: entry.fields.map((field) => ({
                id: field.id,
                type: field.type,
                label: field.label,
                help: field.help,
                required: field.required,
                options: field.options,
                allowOther: field.allowOther,
                minValue: field.minValue,
                maxValue: field.maxValue
            }))
        },
        closedReason: closedReason(entry)
    };
};

export const actions: Actions = {
    default: async (event) => {
        /*
         * Erneut aufloesen statt dem Formular zu glauben: zwischen dem
         * Anzeigen der Seite und dem Absenden kann der Link widerrufen worden
         * sein, und ein `load` schuetzt eine Aktion ohnehin nicht.
         */
        const entry = await resolve(event);

        const blocked = closedReason(entry);
        if (blocked) return fail(400, { error: blocked });

        const limitKey = rateLimitKey.surveyPublic(entry.id, event.getClientAddress());
        const limit = await checkRateLimit(limitKey, RATE_LIMITS.surveyPublic);

        if (!limit.allowed) {
            return fail(429, {
                error: `Es sind zu viele Antworten von dieser Verbindung eingegangen. Bitte in ${Math.ceil(
                    limit.retryAfterSeconds / 60
                )} Minuten erneut versuchen.`
            });
        }

        const form = await event.request.formData();

        /*
         * Eine Zwischenueberschrift wird uebersprungen: sie traegt kein
         * Eingabefeld, und eine leere Antwortzeile dazu waere Datenmuell.
         */
        const answers: SubmittedAnswer[] = entry.fields
            .filter((field) => expectsAnswer(field.type))
            .map((field) => {
                const raw = form.getAll(`f_${field.id}`).map(String);
                const other = String(form.get(`f_${field.id}__other`) ?? "");

                return field.type === "multi"
                    ? { fieldId: field.id, values: raw, otherValue: other }
                    : { fieldId: field.id, value: raw[0] ?? "", otherValue: other };
            });

        const publicName = String(form.get("publicName") ?? "");

        const result = await submitResponse({
            surveyId: entry.id,
            userId: null,
            source: "link",
            publicName,
            answers
        });

        if (!result.ok) {
            return fail(400, {
                error: result.error,
                fieldErrors: result.fieldErrors,
                /*
                 * Zurueckgegeben, damit das Formular nicht leer neu aufbaut.
                 * Der Name steht bewusst dabei: ihn erneut eintippen zu
                 * muessen, weil eine andere Frage fehlte, waere aergerlich.
                 */
                publicName
            });
        }

        /*
         * Post/Redirect/Get: ohne die Weiterleitung fragt ein Neuladen
         * "Formular erneut senden?" und legt eine zweite Antwort an. Die
         * Antwortkennung steht NICHT in der Adresse -- sie waere durchzaehlbar.
         */
        throw redirect(303, `/umfrage/${event.params.token}/danke`);
    }
};
