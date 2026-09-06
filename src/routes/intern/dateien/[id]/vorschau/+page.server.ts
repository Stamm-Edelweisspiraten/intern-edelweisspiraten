import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { matchesPermission } from "$lib/permissions/match";
import { getDocument, getFolder } from "$lib/server/documentService";
import { readFile } from "$lib/server/fileStore";
import { isValidUtf8Text } from "$lib/server/files/mime";
import { renderMarkdown } from "$lib/server/markdown";
import { MAX_PREVIEW_BYTES } from "$lib/components/files/fileMeta";

/**
 * Vorschau einer Datei als eigene Seite -- damit sich eine Vorschau
 * verlinken laesst (Chatnachricht, Lesezeichen, Rundmail).
 *
 * Dieselbe Rechtepruefung wie ueberall in diesem Bereich: ueber den ORDNER,
 * nicht ueber das Dokument. Die Freigaben haengen am Ordner und vererben sich
 * an Unterordner; `getFolder` liefert nur, was der Betrachter sehen darf.
 *
 * Text und Markdown werden hier schon geladen, damit die Seite ohne einen
 * zweiten Abruf steht. Bilder und PDF holt der Browser wie gewohnt vom
 * Download-Endpunkt.
 */

const TEXT_TYPES = [
    "text/plain",
    "text/csv",
    "text/markdown",
    "application/json",
    "text/yaml",
    "application/yaml"
];

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "files.view");

    const document = await getDocument(event.params.id);
    if (!document) throw error(404, "Dokument nicht gefunden");

    const folder = await getFolder(
        document.folderId,
        { id: event.locals.user?.id, memberIds: event.locals.user?.memberIds ?? [] },
        { manageAll: matchesPermission(event.locals.permissions ?? [], "files.manage") }
    );

    if (!folder) throw error(403, "Keine Berechtigung");

    const type = (document.contentType ?? "").split(";")[0].trim().toLowerCase();

    let content: { text: string; html: string | null } | null = null;
    let contentError: string | null = null;

    if (TEXT_TYPES.includes(type)) {
        if (document.size > MAX_PREVIEW_BYTES) {
            contentError = "Die Datei ist für die Vorschau zu groß. Bitte herunterladen.";
        } else {
            const stored = await readFile(document.fileId);
            if (!stored) {
                contentError = "Die Datei wurde nicht gefunden.";
            } else if (!isValidUtf8Text(stored.content)) {
                contentError = "Der Inhalt ist kein lesbarer Text.";
            } else {
                const text = stored.content.toString("utf8");
                content = { text, html: type === "text/markdown" ? renderMarkdown(text) : null };
            }
        }
    }

    return {
        document: {
            id: document.id,
            title: document.title,
            filename: document.filename,
            contentType: document.contentType,
            size: document.size
        },
        folder: { id: folder.id, name: folder.name, path: folder.path },
        content,
        contentError
    };
};
