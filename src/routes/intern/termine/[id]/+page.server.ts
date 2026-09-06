import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";
import {
    groupsWithPermission,
    requireGroupsWithPermission,
    requirePermission
} from "$lib/server/permissionGuard";
import { matchesPermission } from "$lib/permissions/match";
import {
    cancelEvent,
    deleteEvent,
    getEvent,
    getOwnResponses,
    listResponses,
    mayManageEvent,
    removeEventCover,
    respond,
    setEventCover,
    setEventShares,
    updateEvent,
    withdrawResponse,
    type EventStatus,
    type ResponseValue
} from "$lib/server/eventService";
import {
    listShareOptions,
    parseShareValues,
    sharesGrantGroupScope
} from "$lib/server/shareService";
import { getMembersByIds } from "$lib/server/memberService";
import { listGalleries } from "$lib/server/galleryService";

/**
 * Ein Termin mit Rückmeldung und Teilnehmerliste.
 *
 * Rückmeldungen hängen am Mitglied, nicht am Zugang: Eltern melden für ihre
 * Kinder zurück. Wer zwei Kinder im Stamm hat, sieht deshalb zwei Zeilen.
 *
 * `events.manage` kann stammesweit oder nur für einzelne Gruppen vorliegen.
 * Jede schreibende Aktion prüft deshalb zweistufig: erst
 * `requireGroupsWithPermission` (wirft, wenn das Recht nirgends gilt), dann
 * `mayManageEvent` gegen die Freigaben genau dieses Termins.
 */

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

    const manageGroups = groupsWithPermission(event, "events.manage");
    const memberIds = event.locals.user?.memberIds ?? [];

    const entry = await getEvent(
        event.params.id,
        { id: event.locals.user?.id, memberIds },
        { manageAll: manageGroups === null, manageGroups }
    );

    if (!entry) throw error(404, "Termin nicht gefunden");

    // Je Datensatz vom Server entschieden (Design-Blatt §9).
    const canManage = sharesGrantGroupScope(entry.shares, manageGroups);

    /**
     * Galerien zu diesem Termin.
     *
     * Bewusst über `listGalleries` mit demselben Betrachter statt über eine
     * einfache Zählung: eine Galerie kann enger freigegeben sein als der
     * Termin, und dann darf sie hier auch nicht auftauchen. Wer den Termin
     * verwalten darf, verwaltet damit nicht automatisch die Galerie -- die
     * Kachel führt nur hin, die Rechte klärt die Galerieseite selbst.
     */
    const galleryManage = groupsWithPermission(event, "gallery.manage");

    const [responses, ownResponses, ownMembers, shareOptions, galleries] = await Promise.all([
        // Die Teilnehmerliste sieht nur, wer den Termin verwaltet -- sonst
        // wüsste jeder, wer abgesagt hat.
        canManage ? listResponses(entry.id) : Promise.resolve([]),
        getOwnResponses(entry.id, memberIds),
        getMembersByIds(memberIds),
        canManage ? listShareOptions() : Promise.resolve(null),
        matchesPermission(event.locals.permissions ?? [], "gallery.view") ||
        (galleryManage?.length ?? 0) > 0
            ? listGalleries(
                  { id: event.locals.user?.id, memberIds },
                  {
                      eventId: entry.id,
                      manageAll: galleryManage === null,
                      manageGroups: galleryManage
                  }
              )
            : Promise.resolve([])
    ]);

    /**
     * Anders als beim Anlegen wird die Gruppenliste hier NICHT auf die eigenen
     * Gruppen gekürzt: eine Freigabe ist eine Sichtbarkeitsangabe, und ein
     * gekürztes Formular würde bestehende Freigaben auf andere Gruppen beim
     * nächsten Speichern stillschweigend verlieren. Die Aktion sorgt
     * stattdessen dafür, dass mindestens eine eigene Gruppe stehen bleibt.
     */

    const deadline = entry.responseDeadline ?? entry.startsAt;
    const canRespond =
        entry.responsesEnabled &&
        entry.status !== "cancelled" &&
        deadline.getTime() > Date.now();

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
            responsesEnabled: entry.responsesEnabled,
            color: entry.color,
            coverFileId: entry.coverFileId,
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
        galleries: galleries.map((gallery) => ({
            id: gallery.id,
            title: gallery.title,
            imageCount: gallery.imageCount,
            coverImageId: gallery.coverImageResolved
        })),
        shareOptions,
        canManage,
        canRespond
    };
};

/**
 * Der immer gleiche Vorspann jeder schreibenden Aktion: das Recht muss
 * irgendwo vorliegen UND auf diesen Termin passen.
 */
async function requireManage(event: RequestEvent): Promise<void> {
    const scope = requireGroupsWithPermission(event, "events.manage");
    if (!(await mayManageEvent(event.params.id ?? "", scope))) {
        throw error(403, "Keine Berechtigung");
    }
}

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
        await requireManage(event);

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
            responsesEnabled: form.get("responsesEnabled") === "on",
            color: String(form.get("color") ?? ""),
            responseDeadline: parseDateTime(String(form.get("responseDeadline") ?? ""))
        });

        if (!result.ok) return fail(400, { error: result.error });

        /**
         * Das Titelbild steckt im selben Formular (`multipart/form-data`),
         * aber hinter einer eigenen Prüfung: Größe, Typ und Signatur. Es wird
         * erst nach dem erfolgreichen Speichern angefasst -- ein abgewiesenes
         * Formular soll das vorhandene Bild nicht austauschen.
         */
        const cover = form.get("cover");
        if (cover instanceof File && cover.size > 0) {
            const stored = await setEventCover(
                event.params.id,
                cover,
                event.locals.user?.id ?? null
            );
            if (!stored.ok) return fail(stored.status ?? 400, { error: stored.error });
        }

        return { success: "Der Termin wurde gespeichert." };
    },

    removeCover: async (event) => {
        await requireManage(event);

        const result = await removeEventCover(event.params.id);
        if (!result.ok) return fail(400, { error: result.error });

        return { success: "Das Titelbild wurde entfernt." };
    },

    setShares: async (event) => {
        const scope = requireGroupsWithPermission(event, "events.manage");
        if (!(await mayManageEvent(event.params.id, scope))) {
            throw error(403, "Keine Berechtigung");
        }

        const form = await event.request.formData();
        const shares = parseShareValues(form.getAll("share"));

        /**
         * Eine gruppengebundene Verwaltung darf sich nicht selbst aussperren:
         * ohne eine eigene Gruppe in der Liste wäre der Termin unmittelbar
         * nach dem Speichern für sie nicht mehr bearbeitbar.
         */
        if (scope !== null && !sharesGrantGroupScope(shares, scope)) {
            return fail(400, {
                error: "Bitte mindestens eine Gruppe auswählen, für die du Termine verwalten darfst."
            });
        }

        await setEventShares(event.params.id, shares);
        return { success: "Die Freigaben wurden gespeichert." };
    },

    cancel: async (event) => {
        await requireManage(event);
        await cancelEvent(event.params.id);
        return { success: "Der Termin wurde abgesagt." };
    },

    delete: async (event) => {
        await requireManage(event);
        await deleteEvent(event.params.id);
        throw redirect(303, "/intern/termine");
    }
};
