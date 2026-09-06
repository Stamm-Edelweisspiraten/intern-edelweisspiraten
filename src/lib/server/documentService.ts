import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, withTransaction } from "$lib/server/db";
import { isUuid } from "$lib/server/db/ids";
import {
    documents,
    files,
    folderShares,
    folders,
    groups,
    positions,
    roles,
    users
} from "$lib/server/db/schema";
import { deleteFile, storeFile, MAX_FILE_BYTES } from "$lib/server/fileStore";
import { checkUpload, extensionOf, isBlockedExtension } from "$lib/server/files/mime";
import {
    matchesTargets,
    resolveShareTargets,
    type ShareTargetKind,
    type ShareTargets
} from "$lib/server/shareService";

/**
 * Ordner und Dokumente.
 *
 * Sichtbarkeit: ein Ordner ist sichtbar, wenn eine Freigabe auf eine Gruppe
 * des Benutzers, ein Amt, das er innehat, eine seiner Rollen oder ihn selbst
 * zeigt -- oder wenn er `files.manage` stammesweit hält.
 *
 * **Unterordner erben.** Die Vererbung wird nicht je Ordner nachgeschlagen,
 * sondern einmal aufgelöst: alle Ordner und alle Freigaben werden in zwei
 * Abfragen geladen, dann wandert die Sichtbarkeit den Baum hinunter. Der
 * Bestand ist klein (Ordner eines Stamms, nicht eines Konzerns); eine Abfrage
 * je Ordner wäre bei zwanzig Ordnern zwanzig Abfragen für eine Seite.
 */

export interface FolderShare {
    id: string;
    targetKind: ShareTargetKind;
    targetId: string;
    targetName: string;
    canWrite: boolean;
}

export interface FolderNode {
    id: string;
    name: string;
    description: string;
    parentId: string | null;
    /** Pfad von der Wurzel, für die Brotkrume. */
    path: { id: string; name: string }[];
    /** Direkt an diesem Ordner hängende Freigaben. */
    shares: FolderShare[];
    /** true, wenn hier hochgeladen werden darf. */
    canWrite: boolean;
    /** true, wenn die Sichtbarkeit vom Elternordner kommt. */
    inherited: boolean;
    documentCount: number;
    /** Summe der Dateigroessen in diesem Ordner, ohne Unterordner. */
    totalBytes: number;
    childCount: number;
    createdAt: Date;
}

export interface DocumentEntry {
    id: string;
    folderId: string;
    title: string;
    description: string;
    filename: string;
    contentType: string;
    size: number;
    fileId: string;
    createdAt: Date;
    createdBy: string | null;
}

interface Viewer {
    id?: string;
    memberIds?: string[];
}

// ---------------------------------------------------------------------------
// Sichtbarkeit
// ---------------------------------------------------------------------------

interface FolderRow {
    id: string;
    name: string;
    description: string;
    parentId: string | null;
    createdAt: Date;
}

interface ShareRow {
    id: string;
    folderId: string;
    targetKind: ShareTargetKind;
    targetId: string;
    canWrite: boolean;
}

/**
 * Berechnet für jeden Ordner, ob er sichtbar ist und ob geschrieben werden
 * darf -- einschließlich der Vererbung an Unterordner.
 *
 * `manageAll` (also `files.manage` stammesweit) sieht und schreibt überall;
 * die Freigaben werden dann gar nicht erst ausgewertet.
 */
function resolveVisibility(
    allFolders: FolderRow[],
    shares: ShareRow[],
    targets: ShareTargets,
    manageAll: boolean
): Map<string, { visible: boolean; canWrite: boolean; inherited: boolean }> {
    const result = new Map<string, { visible: boolean; canWrite: boolean; inherited: boolean }>();

    if (manageAll) {
        for (const folder of allFolders) {
            result.set(folder.id, { visible: true, canWrite: true, inherited: false });
        }
        return result;
    }

    // Eigene Freigaben je Ordner zusammenfassen.
    const own = new Map<string, { visible: boolean; canWrite: boolean }>();
    for (const share of shares) {
        if (!matchesTargets(targets, share)) continue;
        const current = own.get(share.folderId) ?? { visible: false, canWrite: false };
        own.set(share.folderId, {
            visible: true,
            // Mehrere Freigaben auf denselben Ordner: die großzügigste gilt.
            canWrite: current.canWrite || share.canWrite
        });
    }

    const byId = new Map(allFolders.map((folder) => [folder.id, folder]));

    /**
     * Von jedem Ordner aus nach oben laufen, bis eine Freigabe greift. Der
     * Besuchszähler bricht einen Zyklus ab -- ein Ordner, der über Umwege
     * sein eigener Elternordner ist, käme sonst nie zum Ende. Das Schema
     * verhindert das nicht, weil parent_id auf dieselbe Tabelle zeigt.
     */
    for (const folder of allFolders) {
        let node: FolderRow | undefined = folder;
        let depth = 0;
        let found: { visible: boolean; canWrite: boolean } | null = null;
        let inherited = false;

        while (node && depth < 64) {
            const direct = own.get(node.id);
            if (direct) {
                found = direct;
                inherited = node.id !== folder.id;
                break;
            }
            node = node.parentId ? byId.get(node.parentId) : undefined;
            depth += 1;
        }

        result.set(folder.id, {
            visible: Boolean(found),
            canWrite: found?.canWrite ?? false,
            inherited
        });
    }

    return result;
}

/** Die Namen hinter den Freigabezielen -- vier Tabellen, vier Abfragen. */
async function resolveTargetNames(
    shares: ShareRow[]
): Promise<Map<string, string>> {
    const names = new Map<string, string>();

    const byKind = {
        group: [] as string[],
        position: [] as string[],
        role: [] as string[],
        user: [] as string[]
    };

    for (const share of shares) byKind[share.targetKind]?.push(share.targetId);

    const [groupRows, positionRows, roleRows, userRows] = await Promise.all([
        byKind.group.length
            ? db
                  .select({ id: groups.id, name: groups.name })
                  .from(groups)
                  .where(inArray(groups.id, byKind.group))
            : Promise.resolve([]),
        byKind.position.length
            ? db
                  .select({ id: positions.id, name: positions.name })
                  .from(positions)
                  .where(inArray(positions.id, byKind.position))
            : Promise.resolve([]),
        byKind.role.length
            ? db
                  .select({ id: roles.id, name: roles.name })
                  .from(roles)
                  .where(inArray(roles.id, byKind.role))
            : Promise.resolve([]),
        byKind.user.length
            ? db
                  .select({ id: users.id, name: users.name })
                  .from(users)
                  .where(inArray(users.id, byKind.user))
            : Promise.resolve([])
    ]);

    for (const row of [...groupRows, ...positionRows, ...roleRows, ...userRows]) {
        names.set(row.id, row.name);
    }

    return names;
}

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

/**
 * Alle für den Benutzer sichtbaren Ordner, als flache Liste mit Pfad.
 *
 * Zwei Abfragen für den Baum, zwei für die Zählungen, eine je Zielart für die
 * Namen -- unabhängig davon, wie viele Ordner es gibt.
 */
export async function listFolders(
    viewer: Viewer,
    options: { manageAll?: boolean } = {}
): Promise<FolderNode[]> {
    const [allFolders, allShares, targets] = await Promise.all([
        db
            .select({
                id: folders.id,
                name: folders.name,
                description: folders.description,
                parentId: folders.parentId,
                createdAt: folders.createdAt
            })
            .from(folders)
            .orderBy(asc(folders.name)),
        db
            .select({
                id: folderShares.id,
                folderId: folderShares.folderId,
                targetKind: folderShares.targetKind,
                targetId: folderShares.targetId,
                canWrite: folderShares.canWrite
            })
            .from(folderShares),
        resolveShareTargets(viewer)
    ]);

    const visibility = resolveVisibility(
        allFolders,
        allShares,
        targets,
        options.manageAll === true
    );

    const visible = allFolders.filter((folder) => visibility.get(folder.id)?.visible);
    if (visible.length === 0) return [];

    const visibleIds = new Set(visible.map((folder) => folder.id));

    const [documentCounts, targetNames] = await Promise.all([
        // Anzahl UND Groesse in einer Abfrage -- die Uebersicht zeigt beides.
        db
            .select({
                folderId: documents.folderId,
                count: sql<number>`count(*)::int`,
                bytes: sql<number>`coalesce(sum(${files.size}), 0)::bigint`
            })
            .from(documents)
            .innerJoin(files, eq(files.id, documents.fileId))
            .where(inArray(documents.folderId, [...visibleIds]))
            .groupBy(documents.folderId),
        resolveTargetNames(allShares.filter((share) => visibleIds.has(share.folderId)))
    ]);

    const counts = new Map(documentCounts.map((row) => [row.folderId, Number(row.count)]));
    const bytes = new Map(documentCounts.map((row) => [row.folderId, Number(row.bytes)]));
    const byId = new Map(allFolders.map((folder) => [folder.id, folder]));

    const childCounts = new Map<string, number>();
    for (const folder of allFolders) {
        if (!folder.parentId) continue;
        if (!visibleIds.has(folder.id)) continue;
        childCounts.set(folder.parentId, (childCounts.get(folder.parentId) ?? 0) + 1);
    }

    const sharesByFolder = new Map<string, ShareRow[]>();
    for (const share of allShares) {
        const list = sharesByFolder.get(share.folderId) ?? [];
        list.push(share);
        sharesByFolder.set(share.folderId, list);
    }

    return visible.map((folder) => {
        const state = visibility.get(folder.id)!;

        // Der Pfad zeigt nur, was der Benutzer selbst sehen darf.
        const path: { id: string; name: string }[] = [];
        let node = folder.parentId ? byId.get(folder.parentId) : undefined;
        let depth = 0;
        while (node && depth < 64) {
            if (visibleIds.has(node.id)) path.unshift({ id: node.id, name: node.name });
            node = node.parentId ? byId.get(node.parentId) : undefined;
            depth += 1;
        }

        return {
            id: folder.id,
            name: folder.name,
            description: folder.description,
            parentId: folder.parentId,
            path,
            shares: (sharesByFolder.get(folder.id) ?? []).map((share) => ({
                id: share.id,
                targetKind: share.targetKind,
                targetId: share.targetId,
                targetName: targetNames.get(share.targetId) ?? "Unbekannt",
                canWrite: share.canWrite
            })),
            canWrite: state.canWrite,
            inherited: state.inherited,
            documentCount: counts.get(folder.id) ?? 0,
            totalBytes: bytes.get(folder.id) ?? 0,
            childCount: childCounts.get(folder.id) ?? 0,
            createdAt: folder.createdAt
        };
    });
}

/**
 * Ein einzelner Ordner, wenn er sichtbar ist -- sonst null.
 *
 * Bewusst über listFolders: die Vererbung ist genau einmal umgesetzt, und ein
 * direkter Zugriff über die Adresszeile läuft durch dieselbe Prüfung wie die
 * Übersicht.
 */
export async function getFolder(
    id: string,
    viewer: Viewer,
    options: { manageAll?: boolean } = {}
): Promise<FolderNode | null> {
    if (!isUuid(id)) return null;
    const all = await listFolders(viewer, options);
    return all.find((folder) => folder.id === id) ?? null;
}

/** Wonach die Dateiliste sortiert wird. */
export type DocumentSort = "name" | "size" | "date" | "type";
export type SortDirection = "asc" | "desc";

export interface ListDocumentOptions {
    sort?: DocumentSort;
    direction?: SortDirection;
}

export async function listDocuments(
    folderId: string,
    options: ListDocumentOptions = {}
): Promise<DocumentEntry[]> {
    if (!isUuid(folderId)) return [];

    /**
     * Sortiert wird in der Datenbank, nicht im Browser: die Liste ist
     * vollstaendig, aber ein Ordner mit vielen Dateien soll nicht erst
     * uebertragen und dann umgeschichtet werden.
     */
    const direction = options.direction === "asc" ? asc : desc;
    const column = {
        name: documents.title,
        size: files.size,
        date: documents.createdAt,
        type: files.contentType
    }[options.sort ?? "date"];

    const rows = await db
        .select({
            id: documents.id,
            folderId: documents.folderId,
            title: documents.title,
            description: documents.description,
            createdAt: documents.createdAt,
            createdBy: users.name,
            fileId: files.id,
            filename: files.filename,
            contentType: files.contentType,
            size: files.size
        })
        .from(documents)
        .innerJoin(files, eq(files.id, documents.fileId))
        .leftJoin(users, eq(users.id, documents.createdBy))
        .where(eq(documents.folderId, folderId))
        // Der Titel als zweites Kriterium haelt die Reihenfolge stabil, wenn
        // mehrere Dateien in derselben Sekunde abgelegt wurden.
        .orderBy(direction(column), asc(documents.title));

    return rows.map((row) => ({
        id: row.id,
        folderId: row.folderId,
        title: row.title,
        description: row.description,
        filename: row.filename,
        contentType: row.contentType,
        size: row.size,
        fileId: row.fileId,
        createdAt: row.createdAt,
        createdBy: row.createdBy
    }));
}

/** Das Dokument samt seines Ordners -- für die Rechteprüfung beim Abruf. */
export async function getDocument(id: string) {
    if (!isUuid(id)) return null;

    const [row] = await db
        .select({
            id: documents.id,
            folderId: documents.folderId,
            title: documents.title,
            fileId: documents.fileId,
            filename: files.filename,
            contentType: files.contentType,
            size: files.size
        })
        .from(documents)
        .innerJoin(files, eq(files.id, documents.fileId))
        .where(eq(documents.id, id))
        .limit(1);

    return row ?? null;
}

// ---------------------------------------------------------------------------
// Schreiben
// ---------------------------------------------------------------------------

export interface FolderInput {
    name: string;
    description?: string;
    parentId?: string | null;
}

export async function createFolder(
    input: FolderInput,
    createdBy: string | null
): Promise<{ ok: boolean; id?: string; error?: string }> {
    const name = input.name.trim();
    if (!name) return { ok: false, error: "Bitte einen Namen für den Ordner angeben." };

    const parentId = isUuid(input.parentId) ? input.parentId : null;

    const [row] = await db
        .insert(folders)
        .values({
            name,
            description: input.description?.trim() ?? "",
            parentId,
            createdBy: isUuid(createdBy) ? createdBy : null
        })
        .returning({ id: folders.id });

    return { ok: true, id: row.id };
}

export async function updateFolder(
    id: string,
    input: Partial<FolderInput>
): Promise<{ ok: boolean; error?: string }> {
    if (!isUuid(id)) return { ok: false, error: "Ungültige Kennung." };

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) {
        const name = input.name.trim();
        if (!name) return { ok: false, error: "Der Name darf nicht leer sein." };
        update.name = name;
    }
    if (input.description !== undefined) update.description = input.description.trim();

    if (input.parentId !== undefined) {
        const parentId = isUuid(input.parentId) ? input.parentId : null;

        if (parentId === id) {
            return { ok: false, error: "Ein Ordner kann nicht in sich selbst liegen." };
        }
        if (parentId && (await isDescendant(parentId, id))) {
            return {
                ok: false,
                error: "Ein Ordner kann nicht in einen seiner eigenen Unterordner verschoben werden."
            };
        }
        update.parentId = parentId;
    }

    await db.update(folders).set(update).where(eq(folders.id, id));
    return { ok: true };
}

/**
 * Liegt `candidate` unterhalb von `ancestor`?
 *
 * Verhindert, dass ein Ordner in seinen eigenen Unterordner wandert -- der
 * Zweig wäre danach von der Wurzel aus nicht mehr erreichbar und würde in der
 * Sichtbarkeitsauflösung im Kreis laufen.
 */
async function isDescendant(candidate: string, ancestor: string): Promise<boolean> {
    const rows = await db
        .select({ id: folders.id, parentId: folders.parentId })
        .from(folders);
    const byId = new Map(rows.map((row) => [row.id, row.parentId]));

    let current: string | null | undefined = candidate;
    let depth = 0;
    while (current && depth < 64) {
        if (current === ancestor) return true;
        current = byId.get(current) ?? null;
        depth += 1;
    }
    return false;
}

/**
 * Löscht einen Ordner samt Unterordnern, Dokumenten und Dateien.
 *
 * Die Datenbank räumt Unterordner und Dokumente über CASCADE ab; die
 * zugehörigen Dateien müssen einzeln fallen, damit auch die Objekte im
 * Speicher verschwinden. Deshalb werden die Kennungen VOR dem Löschen
 * eingesammelt.
 */
export async function deleteFolder(id: string): Promise<{ ok: boolean; error?: string }> {
    if (!isUuid(id)) return { ok: false, error: "Ungültige Kennung." };

    const rows = await db.select({ id: folders.id, parentId: folders.parentId }).from(folders);
    const childrenOf = new Map<string, string[]>();
    for (const row of rows) {
        if (!row.parentId) continue;
        const list = childrenOf.get(row.parentId) ?? [];
        list.push(row.id);
        childrenOf.set(row.parentId, list);
    }

    const affected: string[] = [];
    const queue = [id];
    while (queue.length > 0 && affected.length < 1000) {
        const current = queue.shift()!;
        if (affected.includes(current)) continue;
        affected.push(current);
        queue.push(...(childrenOf.get(current) ?? []));
    }

    const fileRows = await db
        .select({ fileId: documents.fileId })
        .from(documents)
        .where(inArray(documents.folderId, affected));

    await db.delete(folders).where(eq(folders.id, id));

    for (const row of fileRows) await deleteFile(row.fileId);

    return { ok: true };
}

export async function setFolderShares(
    folderId: string,
    shares: { targetKind: ShareTargetKind; targetId: string; canWrite: boolean }[]
): Promise<void> {
    if (!isUuid(folderId)) return;

    await withTransaction(async (tx) => {
        await tx.delete(folderShares).where(eq(folderShares.folderId, folderId));

        const valid = shares.filter((share) => isUuid(share.targetId));
        if (valid.length === 0) return;

        await tx
            .insert(folderShares)
            .values(
                valid.map((share) => ({
                    folderId,
                    targetKind: share.targetKind,
                    targetId: share.targetId,
                    canWrite: share.canWrite
                }))
            )
            .onConflictDoNothing();
    });
}

/**
 * Was in die Dateiablage darf.
 *
 * Neu dazugekommen sind die Formate, die die Vorschau anzeigen kann:
 * `text/markdown` (gerendert), `application/json` und YAML (als Text) sowie
 * `image/gif`. Bewusst NICHT dabei ist `image/svg+xml`: ein SVG ist ein
 * XML-Dokument mit Skriptfaehigkeit. Die eigene Route entschaerft es zwar
 * ueber `downloadHeaders()`, aber sobald ein Objektspeicher eingerichtet ist,
 * liefert dieser die Datei unter SEINEM Ursprung aus -- und dort greifen die
 * eigenen Kopfzeilen nicht mehr.
 *
 * Ebenfalls nicht dabei: `text/html`, `application/xhtml+xml`, alles
 * Ausfuehrbare. Die Endungen dazu stehen in `$lib/server/files/mime`.
 */
export const ALLOWED_DOCUMENT_TYPES = [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "text/plain",
    "text/csv",
    "text/markdown",
    "application/json",
    "text/yaml",
    "application/yaml",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.oasis.opendocument.text",
    "application/vnd.oasis.opendocument.spreadsheet"
];

export async function addDocument(input: {
    folderId: string;
    file: unknown;
    title?: string;
    description?: string;
    createdBy: string | null;
}): Promise<{ ok: boolean; id?: string; error?: string; status?: number }> {
    const file = input.file;

    if (
        typeof file !== "object" ||
        file === null ||
        typeof (file as File).arrayBuffer !== "function"
    ) {
        return { ok: false, error: "Es wurde keine Datei ausgewählt.", status: 400 };
    }

    const upload = file as File;
    if (upload.size === 0) return { ok: false, error: "Die Datei ist leer.", status: 400 };
    if (upload.size > MAX_FILE_BYTES) {
        return { ok: false, error: "Die Datei ist zu groß (höchstens 10 MB).", status: 413 };
    }

    const buffer = Buffer.from(await upload.arrayBuffer());
    const filename = sanitizeFilename(upload.name);

    /**
     * Der gemeldete Typ wird gegen die ersten Bytes geprueft. Vorher landete
     * alles Unbekannte still als "application/octet-stream" im Speicher -- eine
     * .exe war damit eine gueltige Ablage.
     */
    const check = checkUpload(
        { filename, declaredType: upload.type, content: buffer },
        ALLOWED_DOCUMENT_TYPES
    );

    if (!check.ok) return { ok: false, error: check.error, status: check.status };
    const contentType = check.contentType;

    const fileId = await storeFile({
        filename,
        contentType,
        content: buffer,
        uploadedBy: input.createdBy ?? undefined
    });

    try {
        const [row] = await db
            .insert(documents)
            .values({
                folderId: input.folderId,
                fileId,
                title: input.title?.trim() || filename,
                description: input.description?.trim() ?? "",
                createdBy: isUuid(input.createdBy) ? input.createdBy : null
            })
            .returning({ id: documents.id });

        return { ok: true, id: row.id };
    } catch (err) {
        // Ohne Zeile ist die Datei nicht erreichbar -- also wieder weg damit.
        await deleteFile(fileId);
        throw err;
    }
}

export async function deleteDocument(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;

    const [row] = await db
        .delete(documents)
        .where(eq(documents.id, id))
        .returning({ fileId: documents.fileId });

    if (!row) return false;

    await deleteFile(row.fileId);
    return true;
}

// ---------------------------------------------------------------------------
// Umbenennen, verschieben, sammeln
// ---------------------------------------------------------------------------

/**
 * Wer fragt -- damit die Schreibrechtpruefung IM Dienst liegt und nicht nur
 * in der aufrufenden Route. Jede Route prueft zusaetzlich ihr eigenes Recht;
 * hier geht es um die Freigabe des betroffenen Ordners.
 */
export interface DocumentAccess {
    viewer: Viewer;
    manageAll?: boolean;
}

/**
 * Ein Dateiname, wie er in `Content-Disposition` und in der Liste erscheint.
 *
 * Pfadanteile fliegen raus -- nicht, weil daraus je ein Pfad gebaut wuerde
 * (der Objektschluessel entsteht allein aus der UUID), sondern damit der Name
 * beim Speichern im Browser nicht in ein anderes Verzeichnis zeigt.
 */
function sanitizeFilename(value: string | null | undefined): string {
    const cleaned = (value ?? "")
        .replace(/[\\/]+/g, "_")
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .replace(/^\.+/, "")
        .trim();

    return cleaned || "dokument";
}

/** Liefert den Ordner, wenn dort geschrieben werden darf. */
async function writableFolder(
    folderId: string,
    access: DocumentAccess
): Promise<{ ok: true; folder: FolderNode } | { ok: false; error: string }> {
    const folder = await getFolder(folderId, access.viewer, { manageAll: access.manageAll });
    if (!folder) return { ok: false, error: "Der Ordner wurde nicht gefunden." };
    if (!folder.canWrite) {
        return { ok: false, error: "In diesem Ordner darfst du nichts verändern." };
    }
    return { ok: true, folder };
}

/**
 * Titel und Dateiname aendern.
 *
 * Die ENDUNG bleibt, wie sie ist. Sonst liesse sich eine abgelegte Textdatei
 * nachtraeglich in "bericht.html" umbenennen -- der Typ in der Datenbank
 * bliebe zwar text/plain, aber ein spaeterer Betrachter (und mancher
 * Objektspeicher) richtet sich nach der Endung.
 */
export async function renameDocument(
    id: string,
    input: { title?: string; filename?: string },
    access: DocumentAccess
): Promise<{ ok: boolean; error?: string }> {
    if (!isUuid(id)) return { ok: false, error: "Ungültige Kennung." };

    const document = await getDocument(id);
    if (!document) return { ok: false, error: "Die Datei wurde nicht gefunden." };

    const source = await writableFolder(document.folderId, access);
    if (!source.ok) return source;

    const title = input.title?.trim();
    if (input.title !== undefined && !title) {
        return { ok: false, error: "Der Titel darf nicht leer sein." };
    }

    let filename: string | undefined;
    if (input.filename !== undefined) {
        filename = sanitizeFilename(input.filename);

        if (isBlockedExtension(filename)) {
            return { ok: false, error: "Diese Dateiendung wird nicht angenommen." };
        }
        if (extensionOf(filename) !== extensionOf(document.filename)) {
            return { ok: false, error: "Die Dateiendung darf nicht geändert werden." };
        }
    }

    await withTransaction(async (tx) => {
        if (title) await tx.update(documents).set({ title }).where(eq(documents.id, id));
        if (filename) {
            await tx.update(files).set({ filename }).where(eq(files.id, document.fileId));
        }
    });

    return { ok: true };
}

/**
 * Eine Datei in einen anderen Ordner legen.
 *
 * Geprueft werden BEIDE Seiten: ohne Schreibrecht im Quellordner darf sie
 * nicht weg, ohne Schreibrecht im Zielordner nicht hin. Nur eine der beiden
 * Pruefungen waere ein Weg, Dateien in einen fremden Ordner zu schieben oder
 * aus einem fremden herauszuholen.
 */
export async function moveDocument(
    id: string,
    targetFolderId: string,
    access: DocumentAccess
): Promise<{ ok: boolean; error?: string }> {
    if (!isUuid(id)) return { ok: false, error: "Ungültige Kennung." };
    if (!isUuid(targetFolderId)) return { ok: false, error: "Kein Zielordner ausgewählt." };

    const document = await getDocument(id);
    if (!document) return { ok: false, error: "Die Datei wurde nicht gefunden." };

    if (document.folderId === targetFolderId) return { ok: true };

    const source = await writableFolder(document.folderId, access);
    if (!source.ok) return source;

    const target = await writableFolder(targetFolderId, access);
    if (!target.ok) {
        return { ok: false, error: "In den Zielordner darfst du nichts ablegen." };
    }

    await db.update(documents).set({ folderId: targetFolderId }).where(eq(documents.id, id));
    return { ok: true };
}

/** Wie deleteDocument, aber fuer eine Auswahl -- mit Rechtepruefung je Datei. */
export async function deleteDocuments(
    ids: string[],
    access: DocumentAccess
): Promise<{ ok: boolean; deleted: number; error?: string }> {
    let deleted = 0;
    let refused = 0;

    for (const id of ids) {
        if (!isUuid(id)) continue;

        const document = await getDocument(id);
        if (!document) continue;

        const source = await writableFolder(document.folderId, access);
        if (!source.ok) {
            refused += 1;
            continue;
        }

        if (await deleteDocument(id)) deleted += 1;
    }

    if (deleted === 0 && refused > 0) {
        return { ok: false, deleted, error: "Keine der Dateien durfte gelöscht werden." };
    }
    if (refused > 0) {
        return {
            ok: true,
            deleted,
            error: `${refused} Datei(en) wurden übersprungen – dort fehlt das Schreibrecht.`
        };
    }

    return { ok: true, deleted };
}

/** Wie moveDocument, aber fuer eine Auswahl. */
export async function moveDocuments(
    ids: string[],
    targetFolderId: string,
    access: DocumentAccess
): Promise<{ ok: boolean; moved: number; error?: string }> {
    let moved = 0;
    let refused = 0;
    let lastError = "";

    for (const id of ids) {
        const result = await moveDocument(id, targetFolderId, access);
        if (result.ok) {
            moved += 1;
        } else {
            refused += 1;
            lastError = result.error ?? "";
        }
    }

    if (moved === 0) {
        return { ok: false, moved, error: lastError || "Es wurde nichts verschoben." };
    }
    if (refused > 0) {
        return { ok: true, moved, error: `${refused} Datei(en) wurden übersprungen.` };
    }

    return { ok: true, moved };
}

// ---------------------------------------------------------------------------
// Auswahllisten fuer die Freigabe
// ---------------------------------------------------------------------------

/**
 * Die waehlbaren Freigabeziele stehen jetzt im shareService -- Ordner,
 * Termine, Umfragen und Galerien brauchen dieselbe Liste. Hier bleibt der
 * Name als Re-Export stehen, damit bestehende Aufrufer unveraendert bleiben.
 */
export { listShareOptions } from "$lib/server/shareService";
