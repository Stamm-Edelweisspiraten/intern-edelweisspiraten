import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { matchesPermission } from "$lib/permissions/match";
import {
    addDocument,
    createFolder,
    deleteDocument,
    deleteFolder,
    getFolder,
    listDocuments,
    listFolders,
    listShareOptions,
    setFolderShares,
    updateFolder
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
 */

const SHARE_KINDS: ShareTargetKind[] = ["group", "position", "role", "user"];

function isShareKind(value: string): value is ShareTargetKind {
    return (SHARE_KINDS as string[]).includes(value);
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

    const [documents, shareOptions] = await Promise.all([
        current ? listDocuments(current.id) : Promise.resolve([]),
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
                  inherited: current.inherited
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
        canUpload
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

        if (!result.ok) return fail(400, { error: result.error });
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
    }
};
