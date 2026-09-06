import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";
import {
    groupsWithPermission,
    requireGroupsWithPermission,
    requirePermission
} from "$lib/server/permissionGuard";
import {
    addImage,
    canUploadTo,
    deleteGallery,
    deleteImage,
    getGallery,
    getImage,
    listImages,
    mayManageGallery,
    moveImage,
    reorderImages,
    setCoverImage,
    setGalleryShares,
    updateGallery,
    updateImage
} from "$lib/server/galleryService";
import { listEvents } from "$lib/server/eventService";
import { listShareOptions, parseShareValues } from "$lib/server/shareService";

/**
 * Eine Galerie mit ihren Bildern.
 *
 * Jede Aktion prueft ihr Recht SELBST -- SvelteKit fuehrt bei Form-Actions
 * kein `load` aus, eine Absicherung dort schuetzt sie also nicht. Die
 * Reihenfolge ist ueberall dieselbe: erst das Recht, dann die Galerie ueber
 * `getGallery` bzw. `mayManageGallery`, erst dann die Aenderung. Damit kommt
 * eine im Formular untergeschobene Kennung nicht weiter als die Uebersicht.
 */

/** Der Blick des Anfragenden, wie ihn die Dienste erwarten. */
function viewerOf(locals: App.Locals) {
    return { id: locals.user?.id, memberIds: locals.user?.memberIds ?? [] };
}

/** Die Freigaben aus dem Formular: ein Feld je Ziel, dazu das Schreibhaeckchen. */
function readShares(form: FormData) {
    return parseShareValues(form.getAll("share")).map((share) => ({
        ...share,
        canWrite: form.get(`write_${share.targetKind}:${share.targetId}`) === "on"
    }));
}

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "gallery.view");

    const manageGroups = groupsWithPermission(event, "gallery.manage");
    const manageAll = manageGroups === null;

    const viewer = viewerOf(event.locals);

    const gallery = await getGallery(event.params.id, viewer, { manageAll, manageGroups });
    if (!gallery) throw error(404, "Galerie nicht gefunden");

    const canManage = await mayManageGallery(gallery.id, manageGroups);

    /**
     * Hochladen braucht zweierlei: das Recht `gallery.upload` (stammesweit
     * oder fuer eine Gruppe) UND eine Freigabe mit Schreibhaeckchen. Wer die
     * Galerie verwalten darf, darf ohnehin.
     */
    const uploadGroups = groupsWithPermission(event, "gallery.upload");
    const mayUploadAnywhere = uploadGroups === null || uploadGroups.length > 0;
    const canUpload =
        mayUploadAnywhere &&
        (canManage || (await canUploadTo(gallery.id, viewer, { manageAll })));

    const [images, shareOptions, events] = await Promise.all([
        listImages(gallery.id),
        canManage ? listShareOptions() : Promise.resolve(null),
        canManage
            ? listEvents(viewer, { manageAll, manageGroups, range: "all", limit: 200 })
            : Promise.resolve([])
    ]);

    return {
        gallery: {
            id: gallery.id,
            title: gallery.title,
            description: gallery.description,
            eventId: gallery.eventId,
            eventTitle: gallery.eventTitle,
            coverImageId: gallery.coverImageId,
            coverImageResolved: gallery.coverImageResolved,
            imageCount: gallery.imageCount,
            totalBytes: gallery.totalBytes,
            shares: gallery.shares,
            createdAt: gallery.createdAt.toISOString()
        },
        images: images.map((image) => ({
            id: image.id,
            caption: image.caption,
            position: image.position,
            filename: image.filename,
            contentType: image.contentType,
            size: image.size,
            width: image.width,
            height: image.height,
            hasThumb: image.thumbFileId !== null,
            createdAt: image.createdAt.toISOString()
        })),
        eventOptions: events.map((entry) => ({
            id: entry.id,
            title: entry.title,
            startsAt: entry.startsAt.toISOString()
        })),
        shareOptions,
        canManage,
        canUpload
    };
};

/**
 * Erzwingt das Verwaltungsrecht fuer genau diese Galerie.
 *
 * `requireGroupsWithPermission` wirft, wenn das Recht gar nicht vorliegt;
 * `mayManageGallery` entscheidet danach, ob die Gruppenbindung fuer DIESE
 * Galerie reicht.
 */
async function requireManage(event: RequestEvent) {
    const manageGroups = requireGroupsWithPermission(event, "gallery.manage");
    if (!(await mayManageGallery(event.params.id, manageGroups))) {
        throw error(403, "Keine Berechtigung");
    }
}

export const actions: Actions = {
    /**
     * Hochladen ohne JavaScript.
     *
     * Der Weg mit JavaScript geht ueber `[id]/upload/+server.ts` -- ein Bild
     * je Anfrage, mit Fortschritt und Vorschaubild. Hier kommt nie ein
     * Vorschaubild an; die Anzeige faellt dann auf das Original zurueck.
     */
    upload: async (event) => {
        requireGroupsWithPermission(event, "gallery.upload");

        const viewer = viewerOf(event.locals);
        const manageGroups = groupsWithPermission(event, "gallery.manage");
        const manageAll = manageGroups === null;

        const gallery = await getGallery(event.params.id, viewer, { manageAll, manageGroups });
        if (!gallery) return fail(404, { error: "Die Galerie wurde nicht gefunden." });

        const allowed =
            (await mayManageGallery(gallery.id, manageGroups)) ||
            (await canUploadTo(gallery.id, viewer, { manageAll }));
        if (!allowed) return fail(403, { error: "Hier darfst du nichts hochladen." });

        let form: FormData;
        try {
            form = await event.request.formData();
        } catch {
            // Kommt vor, wenn der Server den Koerper abgeschnitten hat.
            return fail(413, { error: "Das Bild ist zu groß." });
        }

        const result = await addImage({
            galleryId: gallery.id,
            file: form.get("file"),
            caption: String(form.get("caption") ?? ""),
            uploadedBy: event.locals.user?.id ?? null
        });

        if (!result.ok) return fail(result.status ?? 400, { error: result.error });
        return { success: "Das Bild wurde hinzugefügt." };
    },

    update: async (event) => {
        await requireManage(event);

        const form = await event.request.formData();
        const result = await updateGallery(event.params.id, {
            title: String(form.get("title") ?? ""),
            description: String(form.get("description") ?? ""),
            eventId: String(form.get("eventId") ?? "") || null
        });

        if (!result.ok) return fail(400, { error: result.error });
        return { success: "Die Galerie wurde gespeichert." };
    },

    setShares: async (event) => {
        await requireManage(event);

        const form = await event.request.formData();
        await setGalleryShares(event.params.id, readShares(form));

        return { success: "Die Freigaben wurden gespeichert." };
    },

    setCover: async (event) => {
        await requireManage(event);

        const form = await event.request.formData();
        const raw = String(form.get("imageId") ?? "");

        const result = await setCoverImage(event.params.id, raw || null);
        if (!result.ok) return fail(400, { error: result.error });

        return { success: raw ? "Das Titelbild wurde gesetzt." : "Das Titelbild wurde entfernt." };
    },

    /**
     * Bildunterschrift aendern.
     *
     * Reicht `gallery.upload` -- wer ein Bild beisteuern darf, darf auch
     * beschriften. Geprueft wird zusaetzlich, dass das Bild wirklich zu
     * dieser Galerie gehoert: sonst waere die Galerie, die man bearbeiten
     * darf, der Schluessel zu einem Bild aus einer fremden.
     */
    updateImage: async (event) => {
        requireGroupsWithPermission(event, "gallery.upload");

        const viewer = viewerOf(event.locals);
        const manageGroups = groupsWithPermission(event, "gallery.manage");
        const manageAll = manageGroups === null;

        const gallery = await getGallery(event.params.id, viewer, { manageAll, manageGroups });
        if (!gallery) return fail(404, { error: "Die Galerie wurde nicht gefunden." });

        const allowed =
            (await mayManageGallery(gallery.id, manageGroups)) ||
            (await canUploadTo(gallery.id, viewer, { manageAll }));
        if (!allowed) return fail(403, { error: "Hier darfst du nichts ändern." });

        const form = await event.request.formData();
        const imageId = String(form.get("imageId") ?? "");

        const image = await getImage(imageId);
        if (!image || image.galleryId !== gallery.id) {
            return fail(404, { error: "Das Bild wurde nicht gefunden." });
        }

        const result = await updateImage(imageId, { caption: String(form.get("caption") ?? "") });
        if (!result.ok) return fail(400, { error: result.error });

        return { success: "Die Bildunterschrift wurde gespeichert." };
    },

    deleteImage: async (event) => {
        await requireManage(event);

        const form = await event.request.formData();
        const imageId = String(form.get("imageId") ?? "");

        const image = await getImage(imageId);
        if (!image || image.galleryId !== event.params.id) {
            return fail(404, { error: "Das Bild wurde nicht gefunden." });
        }

        const result = await deleteImage(imageId);
        if (!result.ok) return fail(400, { error: result.error });

        return { success: "Das Bild wurde gelöscht." };
    },

    move: async (event) => {
        await requireManage(event);

        const form = await event.request.formData();
        const imageId = String(form.get("imageId") ?? "");
        const direction = String(form.get("direction") ?? "") === "down" ? "down" : "up";

        const image = await getImage(imageId);
        if (!image || image.galleryId !== event.params.id) {
            return fail(404, { error: "Das Bild wurde nicht gefunden." });
        }

        const result = await moveImage(imageId, direction);
        if (!result.ok) return fail(400, { error: result.error });

        return { success: "Die Reihenfolge wurde geändert." };
    },

    reorder: async (event) => {
        await requireManage(event);

        const form = await event.request.formData();
        const ids = form.getAll("order").map(String);

        const result = await reorderImages(event.params.id, ids);
        if (!result.ok) return fail(400, { error: result.error });

        return { success: "Die Reihenfolge wurde gespeichert." };
    },

    deleteGallery: async (event) => {
        await requireManage(event);

        const result = await deleteGallery(event.params.id);
        if (!result.ok) return fail(400, { error: result.error });

        throw redirect(303, "/intern/galerie");
    }
};
