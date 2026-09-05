import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { matchesPermission } from "$lib/permissions/match";
import {
    cancelEvent,
    createEvent,
    deleteEvent,
    getEvent,
    listEvents,
    setEventShares,
    type EventStatus
} from "$lib/server/eventService";
import { listShareOptions } from "$lib/server/documentService";
import type { ShareTargetKind } from "$lib/server/shareService";

/**
 * Terminübersicht.
 *
 * Zwei Ansichten aus derselben Abfrage: eine Liste (kommend / vergangen) und
 * ein Monatsraster. Das Raster ist ein `grid-cols-7` ohne Bibliothek -- ein
 * Kalender aus sieben Spalten braucht keine.
 */

const SHARE_KINDS: ShareTargetKind[] = ["group", "position", "role", "user"];

function isShareKind(value: string): value is ShareTargetKind {
    return (SHARE_KINDS as string[]).includes(value);
}

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

    const permissions = event.locals.permissions ?? [];
    const canManage = matchesPermission(permissions, "events.manage");

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

    const entries =
        view === "monat"
            ? await listEvents(viewer, { manageAll: canManage, ...window, range: "all" })
            : await listEvents(viewer, {
                  manageAll: canManage,
                  range: showPast ? "past" : "upcoming",
                  limit: 100
              });

    const shareOptions = canManage ? await listShareOptions() : null;

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
            responseDeadline: entry.responseDeadline?.toISOString() ?? null,
            shares: entry.shares,
            counts: entry.counts
        })),
        view,
        showPast,
        month: { year, month: month + 1, from: window.from.toISOString() },
        shareOptions,
        canManage
    };
};

export const actions: Actions = {
    create: async (event) => {
        requirePermission(event, "events.manage");

        const form = await event.request.formData();
        const startsAt = parseDateTime(String(form.get("startsAt") ?? ""));

        if (!startsAt) return fail(400, { error: "Bitte einen Beginn angeben." });

        const result = await createEvent(
            {
                title: String(form.get("title") ?? ""),
                description: String(form.get("description") ?? ""),
                location: String(form.get("location") ?? ""),
                startsAt,
                endsAt: parseDateTime(String(form.get("endsAt") ?? "")),
                allDay: form.get("allDay") === "on",
                status: (String(form.get("status") ?? "published") as EventStatus) ?? "published",
                responseDeadline: parseDateTime(String(form.get("responseDeadline") ?? ""))
            },
            event.locals.user?.id ?? null
        );

        if (!result.ok) return fail(400, { error: result.error });

        // Freigaben gleich mitnehmen, damit der Termin nicht kurz für alle
        // sichtbar ist, bevor sie gesetzt werden.
        const shares = form
            .getAll("share")
            .map(String)
            .map((entry) => {
                const separator = entry.indexOf(":");
                if (separator < 0) return null;
                const kind = entry.slice(0, separator);
                if (!isShareKind(kind)) return null;
                return { targetKind: kind, targetId: entry.slice(separator + 1) };
            })
            .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

        if (shares.length > 0) await setEventShares(result.id!, shares);

        throw redirect(303, `/intern/termine/${result.id}`);
    },

    cancel: async (event) => {
        requirePermission(event, "events.manage");

        const form = await event.request.formData();
        const id = String(form.get("eventId") ?? "");

        const target = await getEvent(id, {}, { manageAll: true });
        if (!target) return fail(404, { error: "Der Termin wurde nicht gefunden." });

        await cancelEvent(id);
        return { success: `„${target.title}“ wurde abgesagt.` };
    },

    delete: async (event) => {
        requirePermission(event, "events.manage");

        const form = await event.request.formData();
        await deleteEvent(String(form.get("eventId") ?? ""));

        throw redirect(303, "/intern/termine");
    }
};
