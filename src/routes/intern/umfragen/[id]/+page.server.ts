import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";
import { env } from "$env/dynamic/private";
import {
    groupsWithPermission,
    requireGroupsWithPermission,
    requirePermission
} from "$lib/server/permissionGuard";
import { matchesPermission } from "$lib/permissions/match";
import {
    createPublicLink,
    deleteSurvey,
    getOwnResponses,
    getSurvey,
    mayManageSurvey,
    normalizeNameMode,
    revokePublicLink,
    setSurveyShares,
    setSurveyStatus,
    submitResponse,
    updatePublicLink,
    updateSurvey,
    withdrawResponse,
    type SubmittedAnswer,
    type SurveyAudience
} from "$lib/server/surveyService";
import { listEvents } from "$lib/server/eventService";
import { getMembersByIds } from "$lib/server/memberService";
import {
    listShareOptions,
    parseShareValues,
    sharesGrantGroupScope
} from "$lib/server/shareService";
import { expectsAnswer } from "$lib/surveys/fields";

/**
 * Eine Umfrage: ausfüllen, verwalten, Fragen bearbeiten.
 *
 * Jede Aktion prüft ihr Recht selbst -- SvelteKit führt bei einer Form-Action
 * KEIN `load` aus, ein Guard im `load` schützt sie also nicht. Für die
 * Verwaltung steht immer dasselbe Paar: die Gruppenbindung aus
 * `requireGroupsWithPermission` und danach `mayManageSurvey` für genau diese
 * Umfrage.
 */

function parseDateTime(value: string): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function parseAudience(value: string): SurveyAudience {
    return value === "member" ? "member" : "user";
}

/**
 * Vorhandene Antworten in die Form, die `SurveyForm` vorbelegt.
 *
 * `answered` sagt, OB schon etwas abgegeben wurde -- die Seite unterscheidet
 * daran „noch nichts abgegeben“ von „abgegeben, aber alle freiwilligen Felder
 * leer gelassen“. Die Werte selbst stehen getrennt nach Auswahl (`values`)
 * und dem Freitext neben „Sonstiges“ (`otherValues`), genau wie die
 * Formularkomponente sie erwartet.
 */
function prefill(answers: SubmittedAnswer[] | undefined): {
    answered: boolean;
    values: Record<string, string | string[]>;
    otherValues: Record<string, string>;
} {
    const values: Record<string, string | string[]> = {};
    const otherValues: Record<string, string> = {};

    for (const answer of answers ?? []) {
        values[answer.fieldId] = answer.values ?? answer.value ?? "";
        if (answer.otherValue) otherValues[answer.fieldId] = answer.otherValue;
    }

    return { answered: answers !== undefined, values, otherValues };
}

/** Die Adresse des öffentlichen Links -- wie beim Kalenderabo gebaut. */
function publicUrl(event: RequestEvent, token: string): string {
    const base = (env.PUBLIC_APP_URL || event.url.origin).replace(/\/+$/, "");
    return `${base}/umfrage/${token}`;
}

/**
 * Die Umfrage, so wie das `load` sie sieht.
 *
 * MUSS in jeder Aktion mit denselben Optionen aufgerufen werden wie im `load`.
 * Genau daran hing ein Fehler, der beim ersten Gebrauch auftrat: `respond`
 * rief `getSurvey` ohne `manageAll`/`manageGroups` auf. Wer eine Umfrage nur
 * kraft Verwaltungsrecht sah -- etwa weil sie an eine fremde Rolle freigegeben
 * war --, bekam das Formular angezeigt, beim Absenden aber ein "nicht
 * gefunden": die Sichtbarkeitspruefung lief ein zweites Mal, diesmal ohne die
 * Verwaltung. Deshalb steht die Aufloesung nur noch hier.
 */
async function loadVisible(event: RequestEvent) {
    const manageGroups = groupsWithPermission(event, "surveys.manage");

    return getSurvey(
        event.params.id,
        {
            id: event.locals.user?.id,
            memberIds: event.locals.user?.memberIds ?? []
        },
        { manageAll: manageGroups === null, manageGroups }
    );
}

/** Sichert die Verwaltung dieser einen Umfrage ab. */
async function requireManage(event: RequestEvent) {
    const scope = requireGroupsWithPermission(event, "surveys.manage");
    if (!(await mayManageSurvey(event.params.id, scope))) {
        throw error(403, "Keine Berechtigung");
    }
}

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "surveys.view");

    const manageGroups = groupsWithPermission(event, "surveys.manage");
    const resultGroups = groupsWithPermission(event, "surveys.results");
    // Getrennt von den Umfragerechten -- siehe Kommentar an der Terminliste.
    const eventManage = groupsWithPermission(event, "events.manage");

    const memberIds = event.locals.user?.memberIds ?? [];
    const viewer = { id: event.locals.user?.id, memberIds };

    // Derselbe Weg wie in jeder Aktion -- siehe Kommentar an `loadVisible`.
    const entry = await loadVisible(event);

    if (!entry) throw error(404, "Umfrage nicht gefunden");

    const canManage = sharesGrantGroupScope(entry.shares, manageGroups);
    const canResults = sharesGrantGroupScope(entry.shares, resultGroups);

    const [ownMembers, ownResponses, shareOptions, upcoming] = await Promise.all([
        entry.audience === "member" ? getMembersByIds(memberIds) : Promise.resolve([]),
        getOwnResponses(entry.id, { userId: event.locals.user?.id ?? null, memberIds }),
        canManage ? listShareOptions() : Promise.resolve(null),
        /*
         * Die Terminliste folgt den TERMIN-Rechten, nicht den Umfragerechten.
         * `manageAll: true` waere hier ein Leck: wer nur Umfragen verwalten
         * darf, saehe damit jeden Titel im Stamm, Entwuerfe eingeschlossen.
         */
        canManage && matchesPermission(event.locals.permissions ?? [], "events.view")
            ? listEvents(viewer, {
                  manageAll: eventManage === null,
                  manageGroups: eventManage,
                  range: "upcoming",
                  limit: 50
              })
            : Promise.resolve([])
    ]);

    const now = Date.now();
    const open =
        entry.status === "published" &&
        (!entry.opensAt || entry.opensAt.getTime() <= now) &&
        (!entry.closesAt || entry.closesAt.getTime() >= now);

    /**
     * Warum nicht geantwortet werden kann -- als fertiger Satz, damit die
     * Seite ihn nicht aus Einzelteilen zusammensetzen muss.
     */
    const closedReason =
        entry.status === "draft"
            ? "Diese Umfrage ist noch ein Entwurf und nimmt keine Antworten an."
            : entry.status === "closed"
              ? "Diese Umfrage ist abgeschlossen und nimmt keine Antworten mehr an."
              : entry.opensAt && entry.opensAt.getTime() > now
                ? "Diese Umfrage ist noch nicht geöffnet."
                : entry.closesAt && entry.closesAt.getTime() < now
                  ? "Der Antwortzeitraum ist abgelaufen."
                  : null;

    return {
        survey: {
            id: entry.id,
            title: entry.title,
            description: entry.description,
            status: entry.status,
            audience: entry.audience,
            anonymous: entry.anonymous,
            multiplePerUser: entry.multiplePerUser,
            eventId: entry.eventId,
            eventTitle: entry.eventTitle,
            opensAt: entry.opensAt?.toISOString() ?? null,
            closesAt: entry.closesAt?.toISOString() ?? null,
            fields: entry.fields,
            shares: entry.shares,
            responseCount: entry.responseCount,
            createdAt: entry.createdAt.toISOString(),
            /**
             * Der Zustand der externen Freigabe -- das TOKEN steht bewusst
             * NICHT dabei. Es verlässt den Dienst genau einmal, im Ergebnis
             * der Aktion `issueLink`; käme es aus dem `load`, stünde es bei
             * jedem Neuladen im ausgelieferten HTML.
             */
            publicEnabled: entry.publicEnabled,
            publicNameMode: entry.publicNameMode,
            publicExpiresAt: entry.publicExpiresAt?.toISOString() ?? null,
            hasPublicLink: entry.hasPublicLink
        },
        /**
         * Für wen dieser Zugang antworten darf -- im Zugangs-Modus genau
         * einmal, im Mitglieder-Modus je verknüpftem Mitglied ein eigener
         * Block. Die vorhandene Antwort steckt gleich mit drin, damit die
         * Seite nichts nachschlagen muss.
         */
        subjects:
            entry.audience === "member"
                ? ownMembers.map((member) => ({
                      key: `m:${member.id}`,
                      memberId: member.id,
                      name: member.fahrtenname
                          ? `${member.firstname} „${member.fahrtenname}“ ${member.lastname}`
                          : `${member.firstname} ${member.lastname}`,
                      ...prefill(ownResponses.get(`m:${member.id}`))
                  }))
                : [
                      {
                          key: "u",
                          memberId: null as string | null,
                          name: null as string | null,
                          ...prefill(ownResponses.get(`u:${event.locals.user?.id ?? ""}`))
                      }
                  ],
        events: upcoming.map((item) => ({
            id: item.id,
            title: item.title,
            startsAt: item.startsAt.toISOString()
        })),
        shareOptions,
        canManage,
        canResults,
        canRespond: open,
        closedReason,
        /**
         * Sobald Antworten vorliegen, sind Löschen und Typwechsel gesperrt --
         * Ergänzen und Umbenennen bleiben erlaubt.
         */
        fieldsLocked: entry.responseCount > 0,
        /**
         * Ein Hinweis aus der Adresse -- der Assistent leitet hierher um, wenn
         * die Umfrage zwar entstanden ist, aber die Fragen oder das
         * Veröffentlichen daran gescheitert sind.
         */
        notice: event.url.searchParams.get("hinweis")
    };
};

export const actions: Actions = {
    respond: async (event) => {
        requirePermission(event, "surveys.view");

        const form = await event.request.formData();
        const memberId = String(form.get("memberId") ?? "");

        const entry = await loadVisible(event);

        if (!entry) throw error(404, "Umfrage nicht gefunden");

        /**
         * Im Mitglieder-Modus nur für die eigenen verknüpften Mitglieder. Ohne
         * diese Prüfung könnte jeder für jedes Mitglied antworten -- die
         * Kennung steht im Formular.
         */
        if (entry.audience === "member") {
            if (!event.locals.user?.memberIds?.includes(memberId)) {
                throw error(403, "Für dieses Mitglied darfst du nicht antworten.");
            }
        }

        /**
         * Die Feldnamen stehen so in `$lib/components/surveys`
         * (`surveyFieldName`, `surveyOtherName`). Sie werden hier von Hand
         * gebaut, weil ein Import aus dem Komponentenverzeichnis den
         * Svelte-Zweig in die Serverdatei zöge -- geändert werden sie nur
         * gemeinsam.
         *
         * Zwischenüberschriften werden übersprungen: sie tragen kein
         * Eingabefeld, und eine leere Antwort auf ein `section` machte aus
         * einer Gliederung eine unbeantwortbare Pflichtfrage.
         */
        const answers: SubmittedAnswer[] = entry.fields
            .filter((field) => expectsAnswer(field.type))
            .map((field) => {
                const raw = form.getAll(`f_${field.id}`).map(String);
                const otherValue = String(form.get(`f_${field.id}__other`) ?? "");

                return field.type === "multi"
                    ? { fieldId: field.id, values: raw, otherValue }
                    : { fieldId: field.id, value: raw[0] ?? "", otherValue };
            });

        const result = await submitResponse({
            surveyId: entry.id,
            userId: event.locals.user?.id ?? null,
            memberId: entry.audience === "member" ? memberId : null,
            answers
        });

        if (!result.ok) {
            return fail(400, {
                error: result.error,
                fieldErrors: result.fieldErrors,
                /** Damit die Seite die Fehler am richtigen Block anzeigt. */
                subject: entry.audience === "member" ? `m:${memberId}` : "u"
            });
        }

        return { success: "Deine Antwort wurde gespeichert." };
    },

    withdraw: async (event) => {
        requirePermission(event, "surveys.view");

        const form = await event.request.formData();
        const memberId = String(form.get("memberId") ?? "");

        const entry = await loadVisible(event);

        if (!entry) throw error(404, "Umfrage nicht gefunden");

        if (entry.audience === "member") {
            if (!event.locals.user?.memberIds?.includes(memberId)) {
                throw error(403, "Für dieses Mitglied darfst du nicht antworten.");
            }
        }

        const result = await withdrawResponse(entry.id, {
            userId: event.locals.user?.id ?? null,
            memberId: entry.audience === "member" ? memberId : null
        });

        if (!result.ok) return fail(400, { error: result.error });
        return { success: "Die Antwort wurde zurückgenommen." };
    },

    update: async (event) => {
        await requireManage(event);

        const form = await event.request.formData();

        const result = await updateSurvey(event.params.id, {
            title: String(form.get("title") ?? ""),
            description: String(form.get("description") ?? ""),
            audience: parseAudience(String(form.get("audience") ?? "user")),
            eventId: String(form.get("eventId") ?? "") || null,
            opensAt: parseDateTime(String(form.get("opensAt") ?? "")),
            closesAt: parseDateTime(String(form.get("closesAt") ?? "")),
            anonymous: form.get("anonymous") === "on",
            multiplePerUser: form.get("multiplePerUser") === "on"
        });

        if (!result.ok) return fail(400, { error: result.error });
        return { success: "Die Umfrage wurde gespeichert." };
    },

    setShares: async (event) => {
        await requireManage(event);

        const form = await event.request.formData();
        await setSurveyShares(event.params.id, parseShareValues(form.getAll("share")));

        return { success: "Die Freigaben wurden gespeichert." };
    },

    /**
     * Die externe Freigabe: erzeugen, ändern, widerrufen.
     *
     * Getrennt statt in einer Aktion mit Schalter, weil sie sich in ihrer
     * Folge unterscheiden. `issueLink` ERSETZT das Token -- ein bereits
     * verschickter Link stirbt dabei --, `updateLink` lässt es leben. Wer nur
     * das Ablaufdatum verschiebt, soll den Link nicht versehentlich
     * ungültig machen.
     */
    issueLink: async (event) => {
        await requireManage(event);

        const form = await event.request.formData();

        const result = await createPublicLink(event.params.id, {
            nameMode: normalizeNameMode(String(form.get("nameMode") ?? "")),
            expiresAt: parseDateTime(String(form.get("publicExpiresAt") ?? ""))
        });

        if (!result.ok) return fail(400, { error: result.error });

        return {
            success: "Der Link wurde erzeugt. Ein zuvor verschickter Link gilt nicht mehr.",
            // Genau einmal sichtbar -- gespeichert ist nur der Abdruck.
            linkUrl: publicUrl(event, result.token!)
        };
    },

    updateLink: async (event) => {
        await requireManage(event);

        const form = await event.request.formData();

        const result = await updatePublicLink(event.params.id, {
            nameMode: normalizeNameMode(String(form.get("nameMode") ?? "")),
            // Ein leeres Feld hebt den Ablauf auf; `null` ist hier Absicht.
            expiresAt: parseDateTime(String(form.get("publicExpiresAt") ?? ""))
        });

        if (!result.ok) return fail(400, { error: result.error });

        return { success: "Die Einstellungen des Links wurden gespeichert." };
    },

    revokeLink: async (event) => {
        await requireManage(event);

        const result = await revokePublicLink(event.params.id);
        if (!result.ok) return fail(400, { error: result.error });

        return { success: "Der externe Link wurde widerrufen und gilt nicht mehr." };
    },

    publish: async (event) => {
        await requireManage(event);

        const result = await setSurveyStatus(event.params.id, "published");
        if (!result.ok) return fail(400, { error: result.error });

        return { success: "Die Umfrage ist jetzt veröffentlicht." };
    },

    close: async (event) => {
        await requireManage(event);

        const result = await setSurveyStatus(event.params.id, "closed");
        if (!result.ok) return fail(400, { error: result.error });

        return { success: "Die Umfrage nimmt keine Antworten mehr an." };
    },

    delete: async (event) => {
        await requireManage(event);

        await deleteSurvey(event.params.id);
        throw redirect(303, "/intern/umfragen");
    }
};
