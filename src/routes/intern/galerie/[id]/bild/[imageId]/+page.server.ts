import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import {
    groupsWithPermission,
    requireGroupsWithPermission,
    requirePermission
} from "$lib/server/permissionGuard";
import {
    canUploadTo,
    getGallery,
    getImage,
    listImages,
    mayManageGallery,
    updateImage
} from "$lib/server/galleryService";

/**
 * Ein einzelnes Bild in voller Groesse.
 *
 * Die Prüfung läuft in derselben Reihenfolge wie bei der Auslieferung: erst
 * das Bild holen, dann pruefen, dass es zur Galerie in der Adresse gehoert,
 * und erst danach die Galerie durch die Sichtbarkeitsaufloesung schicken.
 * Ohne den mittleren Schritt waere eine sichtbare Galerie der Schluessel zu
 * einem Bild aus einer fremden.
 *
 * Vor und Zurueck kommen aus der Reihenfolge der Galerie, nicht aus einer
 * eigenen Abfrage -- so stimmen sie mit dem Raster ueberein, auch wenn zwei
 * Bilder dieselbe Position tragen.
 */

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "gallery.view");

    const image = await getImage(event.params.imageId);
    if (!image) throw error(404, "Bild nicht gefunden");
    if (image.galleryId !== event.params.id) throw error(404, "Bild nicht gefunden");

    const manageGroups = groupsWithPermission(event, "gallery.manage");
    const manageAll = manageGroups === null;

    const viewer = {
        id: event.locals.user?.id,
        memberIds: event.locals.user?.memberIds ?? []
    };

    const gallery = await getGallery(image.galleryId, viewer, { manageAll, manageGroups });
    if (!gallery) throw error(403, "Keine Berechtigung");

    const images = await listImages(gallery.id);
    const index = images.findIndex((entry) => entry.id === image.id);

    const canManage = await mayManageGallery(gallery.id, manageGroups);
    const uploadGroups = groupsWithPermission(event, "gallery.upload");
    const mayUploadAnywhere = uploadGroups === null || uploadGroups.length > 0;
    const canEdit =
        mayUploadAnywhere &&
        (canManage || (await canUploadTo(gallery.id, viewer, { manageAll })));

    return {
        gallery: { id: gallery.id, title: gallery.title },
        image: {
            id: image.id,
            caption: image.caption,
            filename: image.filename,
            contentType: image.contentType,
            size: image.size,
            width: image.width,
            height: image.height,
            createdAt: image.createdAt.toISOString()
        },
        position: { index: index + 1, total: images.length },
        previousId: index > 0 ? images[index - 1].id : null,
        nextId: index >= 0 && index < images.length - 1 ? images[index + 1].id : null,
        canEdit
    };
};

export const actions: Actions = {
    /** Bildunterschrift aendern -- wer beisteuern darf, darf auch beschriften. */
    updateImage: async (event) => {
        requireGroupsWithPermission(event, "gallery.upload");

        const image = await getImage(event.params.imageId);
        if (!image || image.galleryId !== event.params.id) {
            return fail(404, { error: "Das Bild wurde nicht gefunden." });
        }

        const viewer = {
            id: event.locals.user?.id,
            memberIds: event.locals.user?.memberIds ?? []
        };
        const manageGroups = groupsWithPermission(event, "gallery.manage");
        const manageAll = manageGroups === null;

        const gallery = await getGallery(image.galleryId, viewer, { manageAll, manageGroups });
        if (!gallery) return fail(404, { error: "Die Galerie wurde nicht gefunden." });

        const allowed =
            (await mayManageGallery(gallery.id, manageGroups)) ||
            (await canUploadTo(gallery.id, viewer, { manageAll }));
        if (!allowed) return fail(403, { error: "Hier darfst du nichts ändern." });

        const form = await event.request.formData();
        const result = await updateImage(image.id, {
            caption: String(form.get("caption") ?? "")
        });

        if (!result.ok) return fail(400, { error: result.error });
        return { success: "Die Bildunterschrift wurde gespeichert." };
    }
};
