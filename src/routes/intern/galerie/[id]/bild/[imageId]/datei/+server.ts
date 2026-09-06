import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { groupsWithPermission, requirePermission } from "$lib/server/permissionGuard";
import { getGallery, getImage } from "$lib/server/galleryService";
import { readFile, signedUrlFor } from "$lib/server/fileStore";
import { downloadHeaders } from "$lib/server/http/download";

/**
 * Die Auslieferung eines Galeriebildes.
 *
 * Zwei Schalter in der Adresse:
 *
 *   ?klein=1     -- das Vorschaubild, falls eines da ist. Sonst das Original.
 *   ?download=1  -- erzwingt das Herunterladen ueber diesen Server.
 *
 * Drei Dinge sind hier bewusst so und nicht anders:
 *
 *   1. Ein Bild, dessen `galleryId` nicht zur Adresse passt, gibt 404. Ohne
 *      diese Pruefung waere eine Galerie, die man sehen darf, der Schluessel
 *      zu einem Bild aus einer, die man nicht sehen darf -- die Bildkennung
 *      steht ja in der Adresse.
 *
 *   2. Die Weiterleitung auf die signierte Adresse ist eine eigene `Response`
 *      und KEIN `throw redirect`. Ein geworfener Redirect traegt keine
 *      eigenen Kopfzeilen, und ohne `Cache-Control` fragt der Browser bei
 *      jedem Scrollen im Raster erneut hier an. 60 Sekunden liegen sicher
 *      unter der Lebensdauer der signierten Adresse (300 Sekunden).
 *
 *   3. Beim Ausliefern durch diesen Server wird `cacheControl` ausdruecklich
 *      mitgegeben. `downloadHeaders` setzt sonst `private, no-store` -- fuer
 *      Mitgliedsunterlagen richtig, fuer ein Raster aus vierzig
 *      Vorschaubildern verheerend: jedes Scrollen laedt alles neu.
 */

/** Wie lange ein Bild im Zwischenspeicher des Browsers bleiben darf. */
const IMAGE_CACHE = "private, max-age=300";
/** Kuerzer als die Lebensdauer der signierten Adresse (300 s). */
const REDIRECT_CACHE = "private, max-age=60";

export const GET: RequestHandler = async (event) => {
    requirePermission(event, "gallery.view");

    const image = await getImage(event.params.imageId);
    if (!image) throw error(404, "Bild nicht gefunden");
    if (image.galleryId !== event.params.id) throw error(404, "Bild nicht gefunden");

    const manageGroups = groupsWithPermission(event, "gallery.manage");

    const gallery = await getGallery(
        image.galleryId,
        { id: event.locals.user?.id, memberIds: event.locals.user?.memberIds ?? [] },
        { manageAll: manageGroups === null, manageGroups }
    );

    if (!gallery) throw error(403, "Keine Berechtigung");

    const small = event.url.searchParams.get("klein") === "1";
    const forceDownload = event.url.searchParams.get("download") === "1";

    // Der Rueckfall auf das Original steht in dieser einen Zeile: ohne
    // JavaScript entsteht nie ein Vorschaubild.
    const fileId = small && image.thumbFileId ? image.thumbFileId : image.fileId;

    /**
     * Beim Objektspeicher entscheidet die vorsignierte Adresse selbst ueber
     * Typ und Anzeige. Ein erzwungener Download geht deshalb ueber die eigene
     * Auslieferung -- die Kopfzeilen sollen dann von hier kommen.
     */
    if (!forceDownload) {
        const signed = await signedUrlFor(fileId, { filename: image.filename });
        if (signed) {
            return new Response(null, {
                status: 302,
                headers: { Location: signed, "Cache-Control": REDIRECT_CACHE }
            });
        }
    }

    const stored = await readFile(fileId);
    if (!stored) throw error(404, "Datei nicht gefunden");

    return new Response(new Uint8Array(stored.content), {
        status: 200,
        headers: downloadHeaders({
            contentType: stored.contentType,
            filename: image.filename,
            length: stored.content.byteLength,
            forceDownload,
            cacheControl: IMAGE_CACHE
        })
    });
};
