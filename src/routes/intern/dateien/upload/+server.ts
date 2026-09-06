import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { matchesPermission } from "$lib/permissions/match";
import { addDocument, getFolder } from "$lib/server/documentService";

/**
 * Hochladen per Ziehen und Ablegen -- eine Datei je Anfrage.
 *
 * Eine Datei je Anfrage ist Absicht: der Fortschritt laesst sich so je Datei
 * anzeigen, ein Fehlschlag betrifft nur die eine, und der Anfragekoerper
 * bleibt klein. Die Oberflaeche schickt hoechstens drei gleichzeitig.
 *
 * Die Absicherung ist dieselbe wie in der Formular-Action: erst das Recht
 * `files.upload`, dann der Ordner ueber `getFolder` -- also durch die
 * vollstaendige Sichtbarkeitsaufloesung. Ein untergeschobener Ordner aus dem
 * Formularfeld kommt so gar nicht erst durch, und ohne `canWrite` ist
 * Schluss.
 *
 * ACHTUNG BETRIEB: `adapter-node` begrenzt den Anfragekoerper ohne
 * `BODY_SIZE_LIMIT` auf 512 KB und antwortet dann SELBST mit 413 -- diese
 * Funktion wird in dem Fall nie erreicht. Die Oberflaeche muss deshalb auch
 * einen 413 ohne JSON-Koerper verstehen.
 */
export const POST: RequestHandler = async (event) => {
    requirePermission(event, "files.upload");

    let form: FormData;
    try {
        form = await event.request.formData();
    } catch {
        // Kommt vor, wenn der Server den Koerper abgeschnitten hat.
        return json({ error: "Die Datei ist zu groß." }, { status: 413 });
    }

    const folderId = String(form.get("folderId") ?? "");

    const folder = await getFolder(
        folderId,
        { id: event.locals.user?.id, memberIds: event.locals.user?.memberIds ?? [] },
        { manageAll: matchesPermission(event.locals.permissions ?? [], "files.manage") }
    );

    if (!folder) return json({ error: "Der Ordner wurde nicht gefunden." }, { status: 404 });
    if (!folder.canWrite) {
        return json({ error: "In diesem Ordner darfst du nichts ablegen." }, { status: 403 });
    }

    const result = await addDocument({
        folderId,
        file: form.get("file"),
        title: String(form.get("title") ?? ""),
        description: String(form.get("description") ?? ""),
        createdBy: event.locals.user?.id ?? null
    });

    if (!result.ok) {
        return json({ error: result.error }, { status: result.status ?? 400 });
    }

    return json({ id: result.id, ok: true }, { status: 201 });
};
