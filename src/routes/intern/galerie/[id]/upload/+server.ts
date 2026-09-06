import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
    groupsWithPermission,
    requireGroupsWithPermission
} from "$lib/server/permissionGuard";
import {
    addImage,
    canUploadTo,
    getGallery,
    mayManageGallery
} from "$lib/server/galleryService";

/**
 * Hochladen per Ziehen und Ablegen -- EIN Bild je Anfrage.
 *
 * Eine Anfrage je Bild ist Absicht: der Fortschritt laesst sich so je Bild
 * anzeigen, ein Fehlschlag betrifft nur das eine, und der Anfragekoerper
 * bleibt klein. Die Oberflaeche schickt hoechstens drei gleichzeitig.
 *
 * Felder: `file` (das Original), `thumb` (das im Browser verkleinerte
 * Vorschaubild, optional), `caption`, `width`, `height`.
 *
 * Die Absicherung ist dieselbe wie in der Formular-Action: erst das Recht
 * `gallery.upload`, dann die Galerie ueber `getGallery` -- also durch die
 * vollstaendige Sichtbarkeitsaufloesung. Eine im Formularfeld untergeschobene
 * Kennung kommt so gar nicht erst durch. Danach entscheidet das
 * Schreibhaeckchen der Freigabe.
 *
 * ACHTUNG BETRIEB: `adapter-node` begrenzt den Anfragekoerper ohne
 * `BODY_SIZE_LIMIT` auf 512 KB und antwortet dann SELBST mit 413 -- diese
 * Funktion wird in dem Fall nie erreicht. Die Oberflaeche muss deshalb auch
 * einen 413 ohne JSON-Koerper verstehen. Mit `BODY_SIZE_LIMIT=12M` bleibt
 * Platz fuer 10 MB Original, ein Vorschaubild und den multipart-Aufschlag.
 */

/** Eine positive ganze Zahl aus dem Formular -- oder undefined. */
function readNumber(value: FormDataEntryValue | null): number | undefined {
    const parsed = Number(String(value ?? ""));
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
}

export const POST: RequestHandler = async (event) => {
    requireGroupsWithPermission(event, "gallery.upload");

    let form: FormData;
    try {
        form = await event.request.formData();
    } catch {
        // Kommt vor, wenn der Server den Koerper abgeschnitten hat.
        return json({ error: "Das Bild ist zu groß." }, { status: 413 });
    }

    const viewer = {
        id: event.locals.user?.id,
        memberIds: event.locals.user?.memberIds ?? []
    };
    const manageGroups = groupsWithPermission(event, "gallery.manage");
    const manageAll = manageGroups === null;

    const gallery = await getGallery(event.params.id, viewer, { manageAll, manageGroups });
    if (!gallery) return json({ error: "Die Galerie wurde nicht gefunden." }, { status: 404 });

    const allowed =
        (await mayManageGallery(gallery.id, manageGroups)) ||
        (await canUploadTo(gallery.id, viewer, { manageAll }));

    if (!allowed) {
        return json({ error: "In diese Galerie darfst du nichts hochladen." }, { status: 403 });
    }

    const result = await addImage({
        galleryId: gallery.id,
        file: form.get("file"),
        thumb: form.get("thumb"),
        caption: String(form.get("caption") ?? ""),
        width: readNumber(form.get("width")),
        height: readNumber(form.get("height")),
        uploadedBy: event.locals.user?.id ?? null
    });

    if (!result.ok) return json({ error: result.error }, { status: result.status ?? 400 });

    return json({ ok: true, id: result.id }, { status: 201 });
};
