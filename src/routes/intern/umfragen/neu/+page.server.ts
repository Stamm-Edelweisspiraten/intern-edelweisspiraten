import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import {
    groupsWithPermission,
    requireGroupsWithPermission,
    requirePermission
} from "$lib/server/permissionGuard";
import { matchesPermission } from "$lib/permissions/match";
import {
    createSurvey,
    setSurveyFields,
    setSurveyShares,
    setSurveyStatus,
    type SurveyAudience
} from "$lib/server/surveyService";
import { listEvents } from "$lib/server/eventService";
import {
    listShareOptions,
    parseShareValues,
    sharesGrantGroupScope
} from "$lib/server/shareService";
import { parseFieldRows } from "../parseFields";

/**
 * Assistent: eine Umfrage in EINEM Schritt anlegen.
 *
 * Vorher entstand die Umfrage im Anlegen-Dialog als Entwurf, und die Fragen
 * kamen erst auf der Detailseite dazu. Wer dort abbrach, ließ einen Entwurf
 * ohne Fragen zurück -- sichtbar in der Übersicht, ohne Zweck. Deshalb steht
 * hier EIN Formular mit zwei Abschnitten und genau EINEM Speichervorgang:
 * bricht jemand ab, entsteht gar nichts.
 *
 * Die beiden Abschnitte sind eine Sache der Oberfläche. Ohne JavaScript
 * stehen sie untereinander, mit JavaScript blendet ein Schritt-Zustand um --
 * abgeschickt wird in beiden Fällen dasselbe Formular.
 */

function parseDateTime(value: string): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function parseAudience(value: string): SurveyAudience {
    return value === "member" ? "member" : "user";
}

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "surveys.view");

    /**
     * Wirft, wer Umfragen gar nicht verwalten darf. Der Assistent hat sonst
     * keinen Zweck -- und die Aktion darunter prüft dasselbe noch einmal
     * selbst, weil SvelteKit vor einer Aktion kein `load` ausführt.
     */
    const scope = requireGroupsWithPermission(event, "surveys.manage");

    // Getrennt von den Umfragerechten -- siehe Kommentar an der Terminliste.
    const eventManage = groupsWithPermission(event, "events.manage");

    const viewer = {
        id: event.locals.user?.id,
        memberIds: event.locals.user?.memberIds ?? []
    };

    const [shareOptions, upcoming] = await Promise.all([
        listShareOptions(),
        /*
         * Die Terminliste folgt den TERMIN-Rechten, nicht den Umfragerechten.
         * `manageAll: true` waere hier ein Leck: wer nur Umfragen verwalten
         * darf, saehe damit jeden Titel im Stamm, Entwuerfe eingeschlossen.
         */
        matchesPermission(event.locals.permissions ?? [], "events.view")
            ? listEvents(viewer, {
                  manageAll: eventManage === null,
                  manageGroups: eventManage,
                  range: "upcoming",
                  limit: 50
              })
            : Promise.resolve([])
    ]);

    return {
        shareOptions,
        events: upcoming.map((entry) => ({
            id: entry.id,
            title: entry.title,
            startsAt: entry.startsAt.toISOString()
        })),
        /** Ist die Verwaltung auf Gruppen begrenzt, braucht die Umfrage eine Gruppenfreigabe. */
        needsGroupShare: scope !== null,
        /** Nur diese Gruppen darf eine gruppengebundene Verwaltung freigeben. */
        manageGroups: scope
    };
};

export const actions: Actions = {
    create: async (event) => {
        const scope = requireGroupsWithPermission(event, "surveys.manage");

        const form = await event.request.formData();
        const shares = parseShareValues(form.getAll("share"));

        /**
         * Die Regel wandert unverändert aus der Übersicht mit: wer nur für
         * einzelne Gruppen verwalten darf, muss die neue Umfrage auf eine
         * davon freigeben -- sonst legt er etwas an, das er im nächsten
         * Augenblick nicht mehr bearbeiten kann. Bewusst unsymmetrisch: eine
         * Umfrage ohne Freigabe ist für alle sichtbar und deshalb nur
         * stammesweit verwaltbar.
         */
        if (!sharesGrantGroupScope(shares, scope)) {
            return fail(400, {
                error: "Bitte mindestens eine Gruppe freigeben, für die du Umfragen verwalten darfst."
            });
        }

        /**
         * Und die Gegenrichtung: eine gruppengebundene Verwaltung gibt nur
         * ihre EIGENEN Gruppen frei. Ohne diese Prüfung stellte eine
         * Meutenführung eine Umfrage in die Sippe, für die sie nichts zu sagen
         * hat -- der Weg über eine fremde Gruppe wäre offen, obwohl das Recht
         * genau dort endet. Ämter, Rollen und einzelne Personen sind davon
         * nicht berührt: sie tragen keine Verwaltung.
         */
        if (scope !== null) {
            const foreign = shares.find(
                (share) => share.targetKind === "group" && !scope.includes(share.targetId)
            );

            if (foreign) {
                return fail(400, {
                    error: "Du kannst die Umfrage nur für Gruppen freigeben, für die du Umfragen verwalten darfst."
                });
            }
        }

        const publish = String(form.get("modus") ?? "") === "published";

        const result = await createSurvey(
            {
                title: String(form.get("title") ?? ""),
                description: String(form.get("description") ?? ""),
                audience: parseAudience(String(form.get("audience") ?? "user")),
                eventId: String(form.get("eventId") ?? "") || null,
                opensAt: parseDateTime(String(form.get("opensAt") ?? "")),
                closesAt: parseDateTime(String(form.get("closesAt") ?? "")),
                anonymous: form.get("anonymous") === "on",
                multiplePerUser: form.get("multiplePerUser") === "on"
            },
            event.locals.user?.id ?? null
        );

        if (!result.ok) return fail(400, { error: result.error });

        const id = result.id!;

        // Die Freigaben gleich mitnehmen, damit die Umfrage nicht kurz für
        // alle sichtbar ist, bevor sie gesetzt werden.
        if (shares.length > 0) await setSurveyShares(id, shares);

        /**
         * Ab hier EXISTIERT die Umfrage. Schlägt etwas fehl, wird deshalb
         * trotzdem auf die Detailseite umgeleitet und der Grund dort als
         * Hinweis gezeigt -- nicht als `fail` auf dieser Seite.
         *
         * Der Grund ist der Abbruch: ein `fail` ließe den Assistenten mit
         * ausgefülltem Formular stehen, und der nächste Klick auf
         * „Veröffentlichen" legte eine ZWEITE Umfrage an. Die Detailseite
         * dagegen zeigt genau die eine, die gerade entstanden ist, samt der
         * Stelle, an der es hakt.
         */
        const fields = parseFieldRows(form);
        const saved = await setSurveyFields(id, fields);

        if (!saved.ok) {
            throw redirect(
                303,
                `/intern/umfragen/${id}?hinweis=${encodeURIComponent(
                    `Die Umfrage wurde angelegt, die Fragen aber nicht gespeichert: ${saved.error}`
                )}`
            );
        }

        if (publish) {
            const published = await setSurveyStatus(id, "published");

            if (!published.ok) {
                throw redirect(
                    303,
                    `/intern/umfragen/${id}?hinweis=${encodeURIComponent(
                        `Die Umfrage wurde als Entwurf angelegt, aber nicht veröffentlicht: ${published.error}`
                    )}`
                );
            }
        }

        throw redirect(303, `/intern/umfragen/${id}`);
    }
};
