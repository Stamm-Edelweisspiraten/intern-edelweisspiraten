import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import {
    groupsWithPermission,
    requireGroupsWithPermission,
    requirePermission
} from "$lib/server/permissionGuard";
import {
    createGallery,
    deleteGallery,
    listGalleries,
    mayManageGallery,
    setGalleryShares
} from "$lib/server/galleryService";
import { listEvents } from "$lib/server/eventService";
import {
    listShareOptions,
    parseShareValues,
    sharesGrantGroupScope
} from "$lib/server/shareService";

/**
 * Uebersicht der Galerien.
 *
 * Ein Kachelraster statt einer Tabelle: eine Galerie erkennt man am Bild,
 * nicht am Namen. Die Kachel zeigt das Titelbild (oder das erste Bild), die
 * Anzahl und den Termin, an dem sie haengt.
 *
 * Die Sichtbarkeit kommt vollstaendig aus `listGalleries`; hier wird nur noch
 * entschieden, welche Schaltflaechen eine Kachel bekommt. Diese Entscheidung
 * faellt SERVERSEITIG je Datensatz -- `sharesGrantGroupScope` ist der
 * reine Helfer dazu und braucht keine weitere Abfrage, weil die Freigaben
 * ohnehin schon geladen sind.
 */

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "gallery.view");

    const manageGroups = groupsWithPermission(event, "gallery.manage");
    const manageAll = manageGroups === null;
    const canManage = manageAll || manageGroups.length > 0;

    const viewer = {
        id: event.locals.user?.id,
        memberIds: event.locals.user?.memberIds ?? []
    };

    const [entries, shareOptions, events] = await Promise.all([
        listGalleries(viewer, { manageAll, manageGroups }),
        canManage ? listShareOptions() : Promise.resolve(null),
        // Nur zum Verknuepfen im Anlegeformular -- und nur, was der Betrachter
        // ohnehin sehen darf.
        canManage
            ? listEvents(viewer, { manageAll, manageGroups, range: "all", limit: 200 })
            : Promise.resolve([])
    ]);

    return {
        galleries: entries.map((entry) => ({
            id: entry.id,
            title: entry.title,
            description: entry.description,
            eventId: entry.eventId,
            eventTitle: entry.eventTitle,
            coverImageResolved: entry.coverImageResolved,
            imageCount: entry.imageCount,
            totalBytes: entry.totalBytes,
            shares: entry.shares,
            createdAt: entry.createdAt.toISOString(),
            /** Schaltflaechen je Datensatz aus Server-Angaben, nicht aus permissions. */
            canManage: manageAll || sharesGrantGroupScope(entry.shares, manageGroups)
        })),
        eventOptions: events.map((entry) => ({
            id: entry.id,
            title: entry.title,
            startsAt: entry.startsAt.toISOString()
        })),
        shareOptions,
        canManage
    };
};

/** Die Freigaben aus dem Formular: ein Feld je Ziel, dazu das Schreibhaeckchen. */
function readShares(form: FormData) {
    return parseShareValues(form.getAll("share")).map((share) => ({
        ...share,
        canWrite: form.get(`write_${share.targetKind}:${share.targetId}`) === "on"
    }));
}

export const actions: Actions = {
    create: async (event) => {
        /**
         * Bewusst nicht `requirePermission`: `gallery.manage` ist ein
         * gruppenbezogenes Recht, und eine Meutenfuehrung soll fuer ihre
         * Meute eine Galerie anlegen duerfen. Der Guard wirft nur, wenn das
         * Recht gar nicht vorliegt.
         */
        const manageGroups = requireGroupsWithPermission(event, "gallery.manage");

        const form = await event.request.formData();
        const shares = readShares(form);

        /**
         * Wer nur fuer bestimmte Gruppen verwalten darf, muss die neue Galerie
         * auch an eine davon freigeben. Sonst entstuende eine Galerie ohne
         * Freigabe -- fuer alle sichtbar, aber vom Ersteller selbst nicht mehr
         * verwaltbar (die Regel in `sharesGrantGroupScope` ist bewusst
         * unsymmetrisch).
         */
        if (manageGroups !== null && !sharesGrantGroupScope(shares, manageGroups)) {
            return fail(400, {
                error: "Bitte die Galerie an eine Gruppe freigeben, für die du zuständig bist."
            });
        }

        const result = await createGallery(
            {
                title: String(form.get("title") ?? ""),
                description: String(form.get("description") ?? ""),
                eventId: String(form.get("eventId") ?? "") || null
            },
            event.locals.user?.id ?? null
        );

        if (!result.ok) return fail(400, { error: result.error });

        // Die Freigaben gleich mitnehmen, damit die Galerie nicht kurz fuer
        // alle sichtbar ist, bevor sie gesetzt werden.
        if (shares.length > 0) await setGalleryShares(result.id!, shares);

        throw redirect(303, `/intern/galerie/${result.id}`);
    },

    delete: async (event) => {
        const manageGroups = requireGroupsWithPermission(event, "gallery.manage");

        const form = await event.request.formData();
        const id = String(form.get("galleryId") ?? "");

        if (!(await mayManageGallery(id, manageGroups))) {
            return fail(403, { error: "Diese Galerie darfst du nicht löschen." });
        }

        const result = await deleteGallery(id);
        if (!result.ok) return fail(400, { error: result.error });

        return { success: "Die Galerie wurde mit allen Bildern gelöscht." };
    }
};
