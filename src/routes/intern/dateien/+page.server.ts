import { fail, redirect } from "@sveltejs/kit";
import type { RequestEvent } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { matchesPermission } from "$lib/permissions/match";
import {
    addDocument,
    createFolder,
    deleteDocument,
    deleteDocuments,
    deleteFolder,
    getFolder,
    listDocuments,
    listFolders,
    listShareOptions,
    moveDocument,
    moveDocuments,
    renameDocument,
    setFolderShares,
    updateFolder,
    type DocumentAccess,
    type DocumentSort,
    type SortDirection
} from "$lib/server/documentService";
import type { ShareTargetKind } from "$lib/server/shareService";

/**
 * Dateiablage.
 *
 * Ersetzt die leere Platzhalterseite unter /intern/downloads. Ordner sind
 * an Gruppen, Ämter, Rollen und einzelne Personen freigebbar; Unterordner
 * erben die Freigaben ihres Elternordners.
 *
 * Zwei Rechteebenen:
 *
 *   files.view    -- die Seite überhaupt betreten. Was sichtbar ist,
 *                    entscheiden dann die Freigaben, nicht dieses Recht.
 *   files.manage  -- Ordner anlegen, umbenennen, freigeben, löschen. Wer es
 *                    stammesweit hält, sieht auch alle Ordner.
 *   files.upload  -- hochladen, sofern die Freigabe des Ordners es zulässt.
 *
 * Jede Action prüft ihr Recht SELBST -- SvelteKit führt bei Form-Actions kein
 * load aus. Die Aktionen an Dateien prüfen zusätzlich das Schreibrecht am
 * betroffenen Ordner; beim Verschieben an Quell- UND Zielordner. Diese
 * zweite Prüfung liegt im Dienst (documentService), damit sie sich nicht
 * je Aufrufer unterscheidet.
 */

const SHARE_KINDS: ShareTargetKind[] = ["group", "position", "role", "user"];
const SORTS: DocumentSort[] = ["name", "size", "date", "type"];

function isShareKind(value: string): value is ShareTargetKind {
    return (SHARE_KINDS as string[]).includes(value);
}

function isSort(value: string): value is DocumentSort {
    return (SORTS as string[]).includes(value);
}

/** Wer fragt -- fuer die Schreibrechtpruefung im Dienst. */
function accessFor(event: RequestEvent): DocumentAccess {
    return {
        viewer: { id: event.locals.user?.id, memberIds: event.locals.user?.memberIds ?? [] },
        manageAll: matchesPermission(event.locals.permissions ?? [], "files.manage")
    };
}

/** Alle Kennungen aus einem Mehrfachfeld, ohne Leereintraege. */
function idsFrom(form: FormData, field: string): string[] {
    return form
        .getAll(field)
        .flatMap((entry) => String(entry).split(","))
        .map((entry) => entry.trim())
        .filter(Boolean);
}

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "files.view");

    const permissions = event.locals.permissions ?? [];
    const canManage = matchesPermission(permissions, "files.manage");
    const canUpload = matchesPermission(permissions, "files.upload");

    const viewer = {
        id: event.locals.user?.id,
        memberIds: event.locals.user?.memberIds ?? []
    };

    const folders = await listFolders(viewer, { manageAll: canManage });

    // Der gewählte Ordner; ohne Auswahl der erste auf oberster Ebene.
    const requested = event.url.searchParams.get("ordner");
    const current =
        (requested ? folders.find((folder) => folder.id === requested) : null) ??
        folders.find((folder) => folder.parentId === null) ??
        folders[0] ??
        null;

    // Sortierung aus der Adresszeile -- so bleibt sie beim Neuladen erhalten
    // und lässt sich verlinken.
    const sortParam = event.url.searchParams.get("sortieren") ?? "";
    const sort: DocumentSort = isSort(sortParam) ? sortParam : "date";
    const direction: SortDirection =
        event.url.searchParams.get("richtung") === "asc" ? "asc" : "desc";

    const [documents, shareOptions] = await Promise.all([
        current ? listDocuments(current.id, { sort, direction }) : Promise.resolve([]),
        canManage ? listShareOptions() : Promise.resolve(null)
    ]);

    return {
        folders: folders.map((folder) => ({
            id: folder.id,
            name: folder.name,
            description: folder.description,
            parentId: folder.parentId,
            path: folder.path,
            shares: folder.shares,
            canWrite: folder.canWrite,
            inherited: folder.inherited,
            documentCount: folder.documentCount,
            totalBytes: folder.totalBytes,
            childCount: folder.childCount
        })),
        current: current
            ? {
                  id: current.id,
                  name: current.name,
                  description: current.description,
                  parentId: current.parentId,
                  path: current.path,
                  shares: current.shares,
                  canWrite: current.canWrite,
                  inherited: current.inherited,
                  documentCount: current.documentCount,
                  totalBytes: current.totalBytes
              }
            : null,
        documents: documents.map((document) => ({
            id: document.id,
            title: document.title,
            description: document.description,
            filename: document.filename,
            contentType: document.contentType,
            size: document.size,
            createdAt: document.createdAt.toISOString(),
            createdBy: document.createdBy
        })),
        shareOptions,
        canManage,
        canUpload,
        sort,
        direction
    };
};

export const actions: Actions = {
    createFolder: async (event) => {
        requirePermission(event, "files.manage");

        const form = await event.request.formData();
        const result = await createFolder(
            {
                name: String(form.get("name") ?? ""),
                description: String(form.get("description") ?? ""),
                parentId: String(form.get("parentId") ?? "") || null
            },
            event.locals.user?.id ?? null
        );

        if (!result.ok) return fail(400, { error: result.error });
        throw redirect(303, `/intern/dateien?ordner=${result.id}`);
    },

    /**
     * Ordner umbenennen und verschieben.
     *
     * Die Action gab es schon, sie wurde aber von keiner Stelle angesprochen
     * -- die Zyklusprüfung in `updateFolder` lief damit ins Leere. Jetzt hängt
     * ein Formular daran (Modal "Ordner bearbeiten").
     */
    updateFolder: async (event) => {
        requirePermission(event, "files.manage");

        const form = await event.request.formData();
        const id = String(form.get("folderId") ?? "");

        const result = await updateFolder(id, {
            name: String(form.get("name") ?? ""),
            description: String(form.get("description") ?? ""),
            parentId: String(form.get("parentId") ?? "") || null
        });

        if (!result.ok) return fail(400, { error: result.error });
        return { success: "Der Ordner wurde gespeichert." };
    },

    deleteFolder: async (event) => {
        requirePermission(event, "files.manage");

        const form = await event.request.formData();
        const id = String(form.get("folderId") ?? "");

        const result = await deleteFolder(id);
        if (!result.ok) return fail(400, { error: result.error });

        throw redirect(303, "/intern/dateien");
    },

    /**
     * Freigaben setzen.
     *
     * Das Formular schickt je Ziel ein Kästchen `share` mit dem Wert
     * "<art>:<kennung>" und, wenn Schreibrecht gewünscht ist, ein zweites
     * Kästchen `write_<art>:<kennung>`. Zwei getrennte Felder statt eines
     * dreiwertigen, damit es ohne JavaScript bedienbar bleibt.
     */
    setShares: async (event) => {
        requirePermission(event, "files.manage");

        const form = await event.request.formData();
        const folderId = String(form.get("folderId") ?? "");

        const shares = form
            .getAll("share")
            .map(String)
            .map((entry) => {
                const separator = entry.indexOf(":");
                if (separator < 0) return null;

                const kind = entry.slice(0, separator);
                const targetId = entry.slice(separator + 1);
                if (!isShareKind(kind)) return null;

                return {
                    targetKind: kind,
                    targetId,
                    canWrite: form.get(`write_${entry}`) === "on"
                };
            })
            .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

        await setFolderShares(folderId, shares);
        return { success: "Die Freigaben wurden gespeichert." };
    },

    upload: async (event) => {
        requirePermission(event, "files.upload");

        const form = await event.request.formData();
        const folderId = String(form.get("folderId") ?? "");

        /**
         * Hochladen ist nur erlaubt, wo die Freigabe es hergibt. Der Ordner
         * wird deshalb über dieselbe Sichtbarkeitsauflösung geholt wie im
         * load -- ein untergeschobener Ordner aus dem Formular kommt so gar
         * nicht erst durch.
         */
        const folder = await getFolder(
            folderId,
            { id: event.locals.user?.id, memberIds: event.locals.user?.memberIds ?? [] },
            { manageAll: matchesPermission(event.locals.permissions ?? [], "files.manage") }
        );

        if (!folder) return fail(404, { error: "Der Ordner wurde nicht gefunden." });
        if (!folder.canWrite) {
            return fail(403, { error: "In diesem Ordner darfst du nichts ablegen." });
        }

        const result = await addDocument({
            folderId,
            file: form.get("file"),
            title: String(form.get("title") ?? ""),
            description: String(form.get("description") ?? ""),
            createdBy: event.locals.user?.id ?? null
        });

        if (!result.ok) return fail(result.status ?? 400, { error: result.error });
        return { success: "Die Datei wurde abgelegt." };
    },

    deleteDocument: async (event) => {
        requirePermission(event, "files.upload");

        const form = await event.request.formData();
        const documentId = String(form.get("documentId") ?? "");
        const folderId = String(form.get("folderId") ?? "");

        const folder = await getFolder(
            folderId,
            { id: event.locals.user?.id, memberIds: event.locals.user?.memberIds ?? [] },
            { manageAll: matchesPermission(event.locals.permissions ?? [], "files.manage") }
        );

        if (!folder?.canWrite) return fail(403, { error: "Keine Berechtigung" });

        await deleteDocument(documentId);
        return { success: "Die Datei wurde gelöscht." };
    },

    renameDocument: async (event) => {
        requirePermission(event, "files.upload");

        const form = await event.request.formData();
        const result = await renameDocument(
            String(form.get("documentId") ?? ""),
            {
                title: String(form.get("title") ?? ""),
                filename: String(form.get("filename") ?? "")
            },
            accessFor(event)
        );

        if (!result.ok) return fail(400, { error: result.error });
        return { success: "Die Datei wurde umbenannt." };
    },

    moveDocument: async (event) => {
        requirePermission(event, "files.upload");

        const form = await event.request.formData();
        const result = await moveDocument(
            String(form.get("documentId") ?? ""),
            String(form.get("targetFolderId") ?? ""),
            accessFor(event)
        );

        if (!result.ok) return fail(400, { error: result.error });
        return { success: "Die Datei wurde verschoben." };
    },

    /** Sammel-Löschen. Die Rechteprüfung läuft je Datei über ihren Ordner. */
    deleteDocuments: async (event) => {
        requirePermission(event, "files.upload");

        const form = await event.request.formData();
        const ids = idsFrom(form, "documentIds");
        if (ids.length === 0) return fail(400, { error: "Es war nichts ausgewählt." });

        const result = await deleteDocuments(ids, accessFor(event));
        if (!result.ok) return fail(403, { error: result.error });

        return {
            success: result.error
                ? `${result.deleted} Datei(en) gelöscht. ${result.error}`
                : `${result.deleted} Datei(en) wurden gelöscht.`
        };
    },

    /** Sammel-Verschieben. Quell- und Zielordner werden je Datei geprüft. */
    moveDocuments: async (event) => {
        requirePermission(event, "files.upload");

        const form = await event.request.formData();
        const ids = idsFrom(form, "documentIds");
        if (ids.length === 0) return fail(400, { error: "Es war nichts ausgewählt." });

        const result = await moveDocuments(
            ids,
            String(form.get("targetFolderId") ?? ""),
            accessFor(event)
        );

        if (!result.ok) return fail(403, { error: result.error });

        return {
            success: result.error
                ? `${result.moved} Datei(en) verschoben. ${result.error}`
                : `${result.moved} Datei(en) wurden verschoben.`
        };
    }
};
