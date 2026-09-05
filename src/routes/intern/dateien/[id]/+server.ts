import { error, redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { matchesPermission } from "$lib/permissions/match";
import { getDocument, getFolder } from "$lib/server/documentService";
import { readFile, signedUrlFor } from "$lib/server/fileStore";

/**
 * Ein Dokument abrufen.
 *
 * Die Prüfung läuft über den Ordner, nicht über das Dokument: die Freigaben
 * hängen am Ordner, und `getFolder` liefert nur, was der Benutzer sehen darf
 * -- einschließlich der Vererbung an Unterordner. Ein direkt geratener
 * Dokumentenlink kommt damit nicht weiter als die Übersicht.
 *
 * Liegt die Datei im Objektspeicher, wird auf eine kurzlebige Adresse dorthin
 * weitergeleitet: der Inhalt läuft dann nicht durch diesen Server. Sonst wird
 * er wie bisher selbst ausgeliefert.
 */
export const GET: RequestHandler = async (event) => {
    requirePermission(event, "files.view");

    const document = await getDocument(event.params.id);
    if (!document) throw error(404, "Dokument nicht gefunden");

    const folder = await getFolder(
        document.folderId,
        { id: event.locals.user?.id, memberIds: event.locals.user?.memberIds ?? [] },
        { manageAll: matchesPermission(event.locals.permissions ?? [], "files.manage") }
    );

    if (!folder) throw error(403, "Keine Berechtigung");

    const signed = await signedUrlFor(document.fileId);
    if (signed) throw redirect(302, signed);

    const stored = await readFile(document.fileId);
    if (!stored) throw error(404, "Datei nicht gefunden");

    const safe = document.filename.replace(/["\\\r\n]/g, "");

    return new Response(new Uint8Array(stored.content), {
        status: 200,
        headers: {
            "Content-Type": document.contentType || "application/octet-stream",
            "Content-Disposition": `inline; filename="${safe}"`,
            "Content-Length": String(stored.content.byteLength),
            // Freigegebene Unterlagen gehoeren nicht in einen Zwischenspeicher,
            // den ein spaeterer Besucher desselben Geraets noch findet.
            "Cache-Control": "private, no-store"
        }
    });
};
