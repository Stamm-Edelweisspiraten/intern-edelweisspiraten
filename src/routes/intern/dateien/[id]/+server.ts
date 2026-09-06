import { error, redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { matchesPermission } from "$lib/permissions/match";
import { getDocument, getFolder } from "$lib/server/documentService";
import { readFile, signedUrlFor } from "$lib/server/fileStore";
import { downloadHeaders } from "$lib/server/http/download";

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
 *
 * `?download=1` erzwingt das Herunterladen -- die Vorschau bindet dieselbe
 * Adresse ohne den Parameter ein und bekommt dann `inline`.
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

    const forceDownload = event.url.searchParams.get("download") === "1";

    /**
     * Beim Objektspeicher entscheidet die vorsignierte Adresse selbst über
     * Typ und Anzeige (siehe storage/index.ts). Ein erzwungener Download geht
     * deshalb über die eigene Auslieferung -- die Kopfzeilen sollen dann von
     * hier kommen und nicht vom Speicher.
     */
    if (!forceDownload) {
        const signed = await signedUrlFor(document.fileId, { filename: document.filename });
        if (signed) throw redirect(302, signed);
    }

    const stored = await readFile(document.fileId);
    if (!stored) throw error(404, "Datei nicht gefunden");

    return new Response(new Uint8Array(stored.content), {
        status: 200,
        headers: downloadHeaders({
            contentType: document.contentType,
            filename: document.filename,
            length: stored.content.byteLength,
            forceDownload,
            // Freigegebene Unterlagen gehoeren nicht in einen Zwischenspeicher,
            // den ein spaeterer Besucher desselben Geraets noch findet.
            cacheControl: "private, no-store"
        })
    });
};
