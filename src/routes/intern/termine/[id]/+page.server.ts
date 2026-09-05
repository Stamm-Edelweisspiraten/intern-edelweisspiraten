import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { matchesPermission } from "$lib/permissions/match";
import {
    cancelEvent,
    deleteEvent,
    getEvent,
    getOwnResponses,
    listResponses,
    respond,
    setEventShares,
    updateEvent,
    withdrawResponse,
    type EventStatus,
    type ResponseValue
} from "$lib/server/eventService";
import { listShareOptions } from "$lib/server/documentService";
import { getMembersByIds } from "$lib/server/memberService";
import type { ShareTargetKind } from "$lib/server/shareService";

/**
 * Ein Termin mit Rückmeldung und Teilnehmerliste.
 *
 * Rückmeldungen hängen am Mitglied, nicht am Zugang: Eltern melden für ihre
 * Kinder zurück. Wer zwei Kinder im Stamm hat, sieht deshalb zwei Zeilen.
 */

const SHARE_KINDS: ShareTargetKind[] = ["group", "position", "role", "user"];

function isShareKind(value: string): value is ShareTargetKind {
    return (SHARE_KINDS as string[]).includes(value);
}

function isResponse(value: string): value is ResponseValue {
    return value === "yes" || value === "no" || value === "maybe";
}

function parseDateTime(value: string): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "events.view");

    const canManage = matchesPermission(event.locals.permissions ?? [], "events.manage");
    const memberIds = event.locals.user?.memberIds ?? [];

    const entry = await getEvent(
        event.params.id,
        { id: event.locals.user?.id, memberIds },
        { manageAll: canManage }
    );

    if (!entry) throw error(404, "Termin nicht gefunden");

    const [responses, ownResponses, ownMembers, shareOptions] = await Promise.all([
        // Die Teilnehmerliste sieht nur, wer den Termin verwaltet -- sonst
        // wüsste jeder, wer abgesagt hat.
        canManage ? listResponses(entry.id) : Promise.resolve([]),
        getOwnResponses(entry.id, memberIds),
        getMembersByIds(memberIds),
        canManage ? listShareOptions() : Promise.resolve(null)
    ]);

    const deadline = entry.responseDeadline ?? entry.startsAt;
    const canRespond = entry.status !== "cancelled" && deadline.getTime() > Date.now();

    return {
        event: {
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
        },
        responses: responses.map((response) => ({
            memberId: response.memberId,
            memberName: response.memberName,
            response: response.response,
            note: response.note,
            respondedAt: response.respondedAt.toISOString()
        })),
        ownMembers: ownMembers.map((member) => ({
            id: member.id,
            name: member.fahrtenname
                ? `${member.firstname} „${member.fahrtenname}“ ${member.lastname}`
                : `${member.firstname} ${member.lastname}`,
            response: ownResponses.get(member.id)?.response ?? null,
            note: ownResponses.get(member.id)?.note ?? ""
        })),
        shareOptions,
        canManage,
        canRespond
    };
};

export const actions: Actions = {
    respond: async (event) => {
        requirePermission(event, "events.view");

        const form = await event.request.formData();
        const memberId = String(form.get("memberId") ?? "");
        const value = String(form.get("response") ?? "");

        /**
         * Nur für die eigenen verknüpften Mitglieder. Ohne diese Prüfung
         * könnte jeder für jedes Mitglied zusagen -- die Kennung steht im
         * Formular.
         */
        if (!event.locals.user?.memberIds?.includes(memberId)) {
            throw error(403, "Für dieses Mitglied darfst du nicht zurückmelden.");
        }

        if (value === "withdraw") {
            await withdrawResponse(event.params.id, memberId);
            return { success: "Die Rückmeldung wurde zurückgenommen." };
        }

        if (!isResponse(value)) return fail(400, { error: "Ungültige Rückmeldung." });

        const result = await respond({
            eventId: event.params.id,
            memberId,
            response: value,
            note: String(form.get("note") ?? ""),
            respondedBy: event.locals.user?.id ?? null
        });

        if (!result.ok) return fail(400, { error: result.error });
        return { success: "Die Rückmeldung wurde gespeichert." };
    },

    update: async (event) => {
        requirePermission(event, "events.manage");

        const form = await event.request.formData();
        const startsAt = parseDateTime(String(form.get("startsAt") ?? ""));
        if (!startsAt) return fail(400, { error: "Bitte einen Beginn angeben." });

        const result = await updateEvent(event.params.id, {
            title: String(form.get("title") ?? ""),
            description: String(form.get("description") ?? ""),
            location: String(form.get("location") ?? ""),
            startsAt,
            endsAt: parseDateTime(String(form.get("endsAt") ?? "")),
            allDay: form.get("allDay") === "on",
            status: String(form.get("status") ?? "published") as EventStatus,
            responseDeadline: parseDateTime(String(form.get("responseDeadline") ?? ""))
        });

        if (!result.ok) return fail(400, { error: result.error });
        return { success: "Der Termin wurde gespeichert." };
    },

    setShares: async (event) => {
        requirePermission(event, "events.manage");

        const form = await event.request.formData();

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

        await setEventShares(event.params.id, shares);
        return { success: "Die Freigaben wurden gespeichert." };
    },

    cancel: async (event) => {
        requirePermission(event, "events.manage");
        await cancelEvent(event.params.id);
        return { success: "Der Termin wurde abgesagt." };
    },

    delete: async (event) => {
        requirePermission(event, "events.manage");
        await deleteEvent(event.params.id);
        throw redirect(303, "/intern/termine");
    }
};
