import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { matchesPermission } from "$lib/permissions/match";
import { getDocument, getFolder } from "$lib/server/documentService";
import { readFile } from "$lib/server/fileStore";
import { baseType, isValidUtf8Text } from "$lib/server/files/mime";
import { renderMarkdown } from "$lib/server/markdown";
import { MAX_PREVIEW_BYTES } from "$lib/components/files/fileMeta";

/**
 * Der Textinhalt einer Datei -- fuer die Vorschau.
 *
 * Getrennt vom Download-Endpunkt, weil hier nichts ausgeliefert, sondern
 * gelesen wird: die Antwort ist JSON, nie die Datei selbst. Damit kann der
 * Inhalt auch nicht versehentlich im Browser als Dokument landen.
 *
 * Die Rechtepruefung laeuft wie ueberall in diesem Bereich ueber den ORDNER
 * (`getFolder`), nicht ueber das Dokument -- die Freigaben haengen am Ordner
 * und vererben sich an Unterordner.
 *
 * Markdown wird HIER gerendert, nicht im Browser: der Renderer
 * ($lib/server/markdown) escapt zuerst den gesamten Text und setzt danach nur
 * die erlaubten Auszeichnungen. Rohes HTML aus einer hochgeladenen Datei
 * erreicht den Dokumentbaum damit nie.
 */

const TEXT_TYPES = [
    "text/plain",
    "text/csv",
    "text/markdown",
    "application/json",
    "text/yaml",
    "application/yaml"
];

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

    const type = baseType(document.contentType);
    if (!TEXT_TYPES.includes(type)) {
        return json(
            { error: "Diese Datei lässt sich nicht als Text anzeigen.", tooLarge: false },
            { status: 415 }
        );
    }

    if (document.size > MAX_PREVIEW_BYTES) {
        return json(
            {
                error: "Die Datei ist für die Vorschau zu groß. Bitte herunterladen.",
                tooLarge: true,
                limit: MAX_PREVIEW_BYTES
            },
            { status: 413 }
        );
    }

    const stored = await readFile(document.fileId);
    if (!stored) throw error(404, "Datei nicht gefunden");

    if (!isValidUtf8Text(stored.content)) {
        return json(
            { error: "Der Inhalt ist kein lesbarer Text.", tooLarge: false },
            { status: 415 }
        );
    }

    const text = stored.content.toString("utf8");

    return json(
        {
            contentType: type,
            filename: document.filename,
            text,
            // Nur fuer Markdown; sonst zeigt die Vorschau den Text unveraendert.
            html: type === "text/markdown" ? renderMarkdown(text) : null
        },
        { headers: { "Cache-Control": "private, no-store" } }
    );
};
