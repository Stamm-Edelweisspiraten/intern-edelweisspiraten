import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import {
    groupsWithPermission,
    requireGroupsWithPermission,
    requirePermission
} from "$lib/server/permissionGuard";
import {
    cancelEvent,
    createEvent,
    deleteEvent,
    getEvent,
    listEvents,
    mayManageEvent,
    setEventShares,
    type EventStatus
} from "$lib/server/eventService";
import {
    groupTargets,
    listShareOptions,
    parseShareValues,
    sharesGrantGroupScope
} from "$lib/server/shareService";

/**
 * Terminübersicht.
 *
 * Zwei Ansichten aus derselben Abfrage: eine Liste (kommend / vergangen) und
 * ein Monatsraster. Das Raster ist ein `grid-cols-7` ohne Bibliothek -- ein
 * Kalender aus sieben Spalten braucht keine.
 *
 * `events.manage` gilt stammesweit ODER für einzelne Gruppen. Deshalb steht
 * hier nirgends mehr ein blankes `requirePermission(..., "events.manage")`:
 * die Route arbeitet durchweg mit dem Ergebnis von `groupsWithPermission()`
 * und entscheidet je Termin über seine Freigaben (Design-Blatt §9 -- die
 * Schaltflächen je Datensatz kommen vom Server, nicht aus `permissions`).
 */

/**
 * Ein Datum aus dem Formular in einen Zeitpunkt.
 *
 * `<input type="datetime-local">` liefert Ortszeit ohne Zeitzone; `new Date()`
 * deutet das als Ortszeit des Servers. Für einen Stamm mit einem Server in
 * derselben Zeitzone ist das richtig -- und alles andere wäre eine
 * Zeitzonenverwaltung, die niemand pflegen will.
 */
function parseDateTime(value: string): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

/** Der erste und der letzte Tag des angezeigten Monatsrasters. */
function monthWindow(year: number, month: number): { from: Date; to: Date } {
    const first = new Date(year, month, 1);
    // Das Raster beginnt am Montag vor dem Ersten.
    const offset = (first.getDay() + 6) % 7;
    const from = new Date(year, month, 1 - offset);
    // Sechs Wochen decken jeden Monat ab, auch einen 31-tägigen ab Sonntag.
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 42);
    return { from, to };
}

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "events.view");

    /**
     * null = stammesweit, [] = kein Recht, [...] = nur diese Gruppen. Der Wert
     * geht sowohl in die Abfrage (Entwürfe der eigenen Gruppen sind sichtbar)
     * als auch in die Schaltflächen je Termin.
     */
    const manageGroups = groupsWithPermission(event, "events.manage");
    const canManageAny = manageGroups === null || manageGroups.length > 0;

    const viewer = {
        id: event.locals.user?.id,
        memberIds: event.locals.user?.memberIds ?? []
    };

    const view = event.url.searchParams.get("ansicht") === "monat" ? "monat" : "liste";
    const showPast = event.url.searchParams.get("zeitraum") === "vergangen";

    const now = new Date();
    const year = Number(event.url.searchParams.get("jahr")) || now.getFullYear();
    const month = Number(event.url.searchParams.get("monat") ?? String(now.getMonth() + 1)) - 1;

    const window = monthWindow(year, month);

    const scope = { manageAll: manageGroups === null, manageGroups };

    const entries =
        view === "monat"
            ? await listEvents(viewer, { ...scope, ...window, range: "all" })
            : await listEvents(viewer, {
                  ...scope,
                  range: showPast ? "past" : "upcoming",
                  limit: 100
              });

    const options = canManageAny ? await listShareOptions() : null;

    /**
     * Wer nur für einzelne Gruppen verwalten darf, bekommt auch nur diese zur
     * Auswahl. Sonst böte das Formular Gruppen an, die die Aktion gleich
     * darauf abweist.
     */
    const shareOptions =
        options && manageGroups !== null
            ? { ...options, groups: options.groups.filter((g) => manageGroups.includes(g.id)) }
            : options;

    return {
        events: entries.map((entry) => ({
            id: entry.id,
            title: entry.title,
            description: entry.description,
            location: entry.location,
            startsAt: entry.startsAt.toISOString(),
            endsAt: entry.endsAt?.toISOString() ?? null,
            allDay: entry.allDay,
            status: entry.status,
            responsesEnabled: entry.responsesEnabled,
            color: entry.color,
            coverFileId: entry.coverFileId,
            responseDeadline: entry.responseDeadline?.toISOString() ?? null,
            shares: entry.shares,
            counts: entry.counts,
            // Je Datensatz vom Server entschieden, nicht aus `permissions`.
            canManage: sharesGrantGroupScope(entry.shares, manageGroups)
        })),
        view,
        showPast,
        month: { year, month: month + 1, from: window.from.toISOString() },
        shareOptions,
        canManage: canManageAny,
        /** true, wenn das Recht nur für einzelne Gruppen gilt. */
        groupBound: manageGroups !== null
    };
};

export const actions: Actions = {
    create: async (event) => {
        // Wirft bereits, wenn das Recht nirgends vorliegt.
        const scope = requireGroupsWithPermission(event, "events.manage");

        const form = await event.request.formData();
        const startsAt = parseDateTime(String(form.get("startsAt") ?? ""));

        if (!startsAt) return fail(400, { error: "Bitte einen Beginn angeben." });

        const shares = parseShareValues(form.getAll("share"));

        /**
         * Wer `events.manage` nur gruppengebunden hält, muss mindestens eine
         * dieser Gruppen freigeben: ein Termin ohne Freigabe wäre sonst sofort
         * ein stammesweiter Termin, den derselbe Benutzer anschließend nicht
         * mehr bearbeiten dürfte (siehe `sharesGrantGroupScope`).
         */
        if (scope !== null) {
            const chosen = groupTargets(shares);

            if (chosen.some((id) => !scope.includes(id))) {
                return fail(400, {
                    error: "Du darfst nur für deine eigenen Gruppen freigeben."
                });
            }

            if (!sharesGrantGroupScope(shares, scope)) {
                return fail(400, {
                    error: "Bitte mindestens eine Gruppe auswählen, für die du Termine verwalten darfst."
                });
            }
        }

        const responsesEnabled = form.get("responsesEnabled") === "on";

        const result = await createEvent(
            {
                title: String(form.get("title") ?? ""),
                description: String(form.get("description") ?? ""),
                location: String(form.get("location") ?? ""),
                startsAt,
                endsAt: parseDateTime(String(form.get("endsAt") ?? "")),
                allDay: form.get("allDay") === "on",
                status: (String(form.get("status") ?? "published") as EventStatus) ?? "published",
                responsesEnabled,
                color: String(form.get("color") ?? ""),
                responseDeadline: parseDateTime(String(form.get("responseDeadline") ?? ""))
            },
            event.locals.user?.id ?? null
        );

        if (!result.ok) return fail(400, { error: result.error });

        // Freigaben gleich mitnehmen, damit der Termin nicht kurz für alle
        // sichtbar ist, bevor sie gesetzt werden.
        if (shares.length > 0) await setEventShares(result.id!, shares);

        throw redirect(303, `/intern/termine/${result.id}`);
    },

    cancel: async (event) => {
        const scope = requireGroupsWithPermission(event, "events.manage");

        const form = await event.request.formData();
        const id = String(form.get("eventId") ?? "");

        if (!(await mayManageEvent(id, scope))) throw error(403, "Keine Berechtigung");

        const target = await getEvent(id, {}, { manageAll: true });
        if (!target) return fail(404, { error: "Der Termin wurde nicht gefunden." });

        await cancelEvent(id);
        return { success: `„${target.title}“ wurde abgesagt.` };
    },

    delete: async (event) => {
        const scope = requireGroupsWithPermission(event, "events.manage");

        const form = await event.request.formData();
        const id = String(form.get("eventId") ?? "");

        if (!(await mayManageEvent(id, scope))) throw error(403, "Keine Berechtigung");

        await deleteEvent(id);

        throw redirect(303, "/intern/termine");
    }
};
