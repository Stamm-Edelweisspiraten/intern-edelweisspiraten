import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db, withTransaction } from "$lib/server/db";
import { isUuid, onlyUuids } from "$lib/server/db/ids";
import { eventResponses, eventShares, events, members } from "$lib/server/db/schema";
import {
    matchesTargets,
    resolveShareTargets,
    resolveTargetNames,
    sharesGrantGroupScope,
    type ShareTargetKind
} from "$lib/server/shareService";
import { normalizeEventColor } from "$lib/events/colors";
import { deleteFile, MAX_FILE_BYTES, storeFile } from "$lib/server/fileStore";
import { checkUpload } from "$lib/server/files/mime";

/**
 * Termine.
 *
 * Sichtbarkeit wie bei den Ordnern: ein Termin ist sichtbar, wenn eine
 * Freigabe auf eine Gruppe des Benutzers, ein Amt, das er innehat, eine
 * seiner Rollen oder ihn selbst zeigt -- oder wenn er `events.manage`
 * stammesweit hält. Ein Termin ganz ohne Freigabe gilt als für alle
 * bestimmt; das ist der übliche Fall (Stammesversammlung, Sommerlager).
 *
 * Entwürfe sieht nur, wer verwalten darf. Abgesagte Termine bleiben sichtbar
 * -- eine Absage, die verschwindet, erreicht niemanden.
 */

export type EventStatus = "draft" | "published" | "cancelled";
export type ResponseValue = "yes" | "no" | "maybe";

export interface EventShare {
    id: string;
    targetKind: ShareTargetKind;
    targetId: string;
    targetName: string;
}

export interface EventResponseEntry {
    memberId: string;
    memberName: string;
    response: ResponseValue;
    note: string;
    respondedAt: Date;
}

export interface EventEntry {
    id: string;
    title: string;
    description: string;
    location: string;
    startsAt: Date;
    endsAt: Date | null;
    allDay: boolean;
    status: EventStatus;
    /** Ist die Rückmeldung ausgeschaltet, gibt es weder Frist noch Liste. */
    responsesEnabled: boolean;
    /** Schlüssel aus $lib/events/colors -- beim Lesen immer normalisiert. */
    color: string;
    coverFileId: string | null;
    responseDeadline: Date | null;
    shares: EventShare[];
    counts: { yes: number; no: number; maybe: number };
    createdAt: Date;
}

interface Viewer {
    id?: string;
    memberIds?: string[];
}

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

interface ListOptions {
    manageAll?: boolean;
    /**
     * Gruppen, für die der Betrachter `events.manage` hält -- genau der
     * Rückgabewert von `groupsWithPermission()`.
     *
     * `null` steht dort für "stammesweit" und wirkt wie `manageAll`; `[]` und
     * `undefined` für "kein Recht". Ein Entwurf wird damit auch für eine
     * Meutenführung sichtbar, sobald er auf ihre Meute freigegeben ist.
     */
    manageGroups?: string[] | null;
    /** "upcoming" schneidet bei jetzt ab, "past" davor, "all" gar nicht. */
    range?: "upcoming" | "past" | "all";
    /** Für die Monatsansicht: nur Termine in diesem Zeitraum. */
    from?: Date;
    to?: Date;
    limit?: number;
}

/**
 * Alle für den Benutzer sichtbaren Termine.
 *
 * Drei Abfragen unabhängig von der Anzahl: Termine, Freigaben, Zählungen.
 * Die Sichtbarkeit wird danach im Speicher entschieden -- der Bestand eines
 * Stamms ist klein, und die Freigabeprüfung als SQL wäre eine Kette aus vier
 * ODER-Zweigen über drei Zuordnungstabellen.
 */
export async function listEvents(
    viewer: Viewer,
    options: ListOptions = {}
): Promise<EventEntry[]> {
    const range = options.range ?? "all";
    const now = new Date();

    const conditions = [];
    if (range === "upcoming") conditions.push(gte(events.startsAt, options.from ?? now));
    if (range === "past") conditions.push(lt(events.startsAt, options.to ?? now));
    if (range === "all" && options.from) conditions.push(gte(events.startsAt, options.from));
    if (range === "all" && options.to) conditions.push(lt(events.startsAt, options.to));

    /**
     * Entwürfe sind nur für die Verwaltung sichtbar. Wer sie überhaupt sehen
     * KÖNNTE, wird hier grob entschieden; ob ein einzelner Entwurf wirklich in
     * die verwaltete Gruppe fällt, klärt erst die Freigabeprüfung weiter
     * unten -- dafür müssen die Freigaben geladen sein.
     */
    const maySeeAnyDraft =
        options.manageAll === true ||
        options.manageGroups === null ||
        (options.manageGroups?.length ?? 0) > 0;

    if (!maySeeAnyDraft) {
        conditions.push(inArray(events.status, ["published", "cancelled"]));
    }

    const base = db
        .select()
        .from(events)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(range === "past" ? desc(events.startsAt) : asc(events.startsAt));

    const [rows, targets] = await Promise.all([
        options.limit ? base.limit(options.limit) : base,
        resolveShareTargets(viewer)
    ]);

    if (rows.length === 0) return [];

    const eventIds = rows.map((row) => row.id);

    const [shareRows, countRows] = await Promise.all([
        db
            .select({
                id: eventShares.id,
                eventId: eventShares.eventId,
                targetKind: eventShares.targetKind,
                targetId: eventShares.targetId
            })
            .from(eventShares)
            .where(inArray(eventShares.eventId, eventIds)),
        db
            .select({
                eventId: eventResponses.eventId,
                response: eventResponses.response,
                count: sql<number>`count(*)::int`
            })
            .from(eventResponses)
            .where(inArray(eventResponses.eventId, eventIds))
            .groupBy(eventResponses.eventId, eventResponses.response)
    ]);

    const sharesByEvent = new Map<string, typeof shareRows>();
    for (const share of shareRows) {
        const list = sharesByEvent.get(share.eventId) ?? [];
        list.push(share);
        sharesByEvent.set(share.eventId, list);
    }

    const countsByEvent = new Map<string, { yes: number; no: number; maybe: number }>();
    for (const row of countRows) {
        const entry = countsByEvent.get(row.eventId) ?? { yes: 0, no: 0, maybe: 0 };
        entry[row.response] = Number(row.count);
        countsByEvent.set(row.eventId, entry);
    }

    const visible = rows.filter((row) => {
        const shares = sharesByEvent.get(row.id) ?? [];
        const manages =
            options.manageAll === true ||
            sharesGrantGroupScope(shares, options.manageGroups ?? []);

        // Ein Entwurf ist nur für die zuständige Verwaltung da.
        if (row.status === "draft" && !manages) return false;
        if (options.manageAll) return true;
        // Ohne Freigabe: für alle bestimmt.
        if (shares.length === 0) return true;
        if (shares.some((share) => matchesTargets(targets, share))) return true;
        // Wer verwalten darf, sieht den Termin auch ohne eigene Freigabe.
        return manages;
    });

    const targetNames = await resolveTargetNames(
        shareRows.filter((share) => visible.some((row) => row.id === share.eventId))
    );

    return visible.map((row) => {
        const counts = countsByEvent.get(row.id) ?? { yes: 0, no: 0, maybe: 0 };

        return {
            id: row.id,
            title: row.title,
            description: row.description,
            location: row.location,
            startsAt: row.startsAt,
            endsAt: row.endsAt,
            allDay: row.allDay,
            status: row.status,
            responsesEnabled: row.responsesEnabled,
            color: normalizeEventColor(row.color),
            coverFileId: row.coverFileId,
            responseDeadline: row.responseDeadline,
            shares: (sharesByEvent.get(row.id) ?? []).map((share) => ({
                id: share.id,
                targetKind: share.targetKind,
                targetId: share.targetId,
                targetName: targetNames.get(share.targetId) ?? "Unbekannt"
            })),
            counts,
            createdAt: row.createdAt
        };
    });
}

/**
 * Ein einzelner Termin, wenn er sichtbar ist.
 *
 * Bewusst nicht ueber listEvents mit einem Zeitfenster: zwei Termine zur
 * selben Minute wuerden dabei verwechselt.
 */
export async function getEvent(
    id: string,
    viewer: Viewer,
    options: { manageAll?: boolean; manageGroups?: string[] | null } = {}
): Promise<EventEntry | null> {
    if (!isUuid(id)) return null;

    const [row] = await db.select().from(events).where(eq(events.id, id)).limit(1);
    if (!row) return null;

    const [shareRows, targets, countRows] = await Promise.all([
        db
            .select({
                id: eventShares.id,
                targetKind: eventShares.targetKind,
                targetId: eventShares.targetId
            })
            .from(eventShares)
            .where(eq(eventShares.eventId, id)),
        resolveShareTargets(viewer),
        db
            .select({
                response: eventResponses.response,
                count: sql<number>`count(*)::int`
            })
            .from(eventResponses)
            .where(eq(eventResponses.eventId, id))
            .groupBy(eventResponses.response)
    ]);

    const manages =
        options.manageAll === true ||
        sharesGrantGroupScope(shareRows, options.manageGroups ?? []);

    if (!options.manageAll) {
        if (row.status === "draft" && !manages) return null;
        // Ohne Freigabe ist der Termin fuer alle bestimmt.
        const allowed =
            manages ||
            shareRows.length === 0 ||
            shareRows.some((share) => matchesTargets(targets, share));
        if (!allowed) return null;
    }

    const counts = { yes: 0, no: 0, maybe: 0 };
    for (const entry of countRows) counts[entry.response] = Number(entry.count);

    const targetNames = await resolveTargetNames(shareRows);

    return {
        id: row.id,
        title: row.title,
        description: row.description,
        location: row.location,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        allDay: row.allDay,
        status: row.status,
        responsesEnabled: row.responsesEnabled,
        color: normalizeEventColor(row.color),
        coverFileId: row.coverFileId,
        responseDeadline: row.responseDeadline,
        shares: shareRows.map((share) => ({
            id: share.id,
            targetKind: share.targetKind,
            targetId: share.targetId,
            targetName: targetNames.get(share.targetId) ?? "Unbekannt"
        })),
        counts,
        createdAt: row.createdAt
    };
}

/**
 * Darf dieser Benutzer den Termin verwalten?
 *
 * `allowedGroups` ist der Rückgabewert von `groupsWithPermission(event,
 * "events.manage")`. Die Regel steckt in `sharesGrantGroupScope` und ist
 * bewusst unsymmetrisch: ein Termin ohne jede Freigabe ist für alle sichtbar,
 * aber für eine gruppengebundene Verwaltung nicht verwaltbar.
 */
export async function mayManageEvent(
    id: string,
    allowedGroups: string[] | null
): Promise<boolean> {
    if (allowedGroups === null) return isUuid(id);
    if (allowedGroups.length === 0) return false;
    if (!isUuid(id)) return false;

    const shareRows = await db
        .select({ targetKind: eventShares.targetKind, targetId: eventShares.targetId })
        .from(eventShares)
        .where(eq(eventShares.eventId, id));

    return sharesGrantGroupScope(shareRows, allowedGroups);
}

/**
 * Alle Rückmeldungen zu einem Termin, mit Namen -- die Teilnehmerliste.
 *
 * Ist die Rückmeldung am Termin ausgeschaltet, bleibt die Liste leer. Alte
 * Zeilen aus der Zeit davor stehen zwar noch in der Tabelle, gehören aber
 * nicht mehr in die Anzeige -- und schon gar nicht in die PDF-Teilnehmerliste.
 */
export async function listResponses(eventId: string): Promise<EventResponseEntry[]> {
    if (!isUuid(eventId)) return [];

    const [event] = await db
        .select({ responsesEnabled: events.responsesEnabled })
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1);

    if (!event || !event.responsesEnabled) return [];

    const rows = await db
        .select({
            memberId: eventResponses.memberId,
            firstname: members.firstname,
            lastname: members.lastname,
            fahrtenname: members.fahrtenname,
            response: eventResponses.response,
            note: eventResponses.note,
            respondedAt: eventResponses.respondedAt
        })
        .from(eventResponses)
        .innerJoin(members, eq(members.id, eventResponses.memberId))
        .where(eq(eventResponses.eventId, eventId))
        .orderBy(asc(members.lastname), asc(members.firstname));

    return rows.map((row) => ({
        memberId: row.memberId,
        memberName: row.fahrtenname
            ? `${row.firstname} „${row.fahrtenname}“ ${row.lastname}`
            : `${row.firstname} ${row.lastname}`,
        response: row.response,
        note: row.note,
        respondedAt: row.respondedAt
    }));
}

/** Die eigenen Rückmeldungen eines Benutzers, je verknüpftem Mitglied. */
export async function getOwnResponses(
    eventId: string,
    memberIds: string[]
): Promise<Map<string, { response: ResponseValue; note: string }>> {
    const valid = onlyUuids(memberIds);
    if (!isUuid(eventId) || valid.length === 0) return new Map();

    const rows = await db
        .select({
            memberId: eventResponses.memberId,
            response: eventResponses.response,
            note: eventResponses.note
        })
        .from(eventResponses)
        .where(
            and(eq(eventResponses.eventId, eventId), inArray(eventResponses.memberId, valid))
        );

    return new Map(rows.map((row) => [row.memberId, { response: row.response, note: row.note }]));
}

// ---------------------------------------------------------------------------
// Schreiben
// ---------------------------------------------------------------------------

export interface EventInput {
    title: string;
    description?: string;
    location?: string;
    startsAt: Date;
    endsAt?: Date | null;
    allDay?: boolean;
    status?: EventStatus;
    /** Ohne Angabe bleibt es bei der Voreinstellung der Spalte: `true`. */
    responsesEnabled?: boolean;
    /** Beliebiger Text; ungültige Werte fallen auf die Standardfarbe. */
    color?: string;
    coverFileId?: string | null;
    responseDeadline?: Date | null;
}

function validate(input: EventInput): string | null {
    if (!input.title.trim()) return "Bitte einen Titel angeben.";
    if (Number.isNaN(input.startsAt.getTime())) return "Bitte einen gültigen Beginn angeben.";

    if (input.endsAt && !Number.isNaN(input.endsAt.getTime())) {
        if (input.endsAt.getTime() < input.startsAt.getTime()) {
            return "Das Ende darf nicht vor dem Beginn liegen.";
        }
    }

    /**
     * Die Frist wird nur geprüft, wenn überhaupt zurückgemeldet wird. Sonst
     * scheitert das Speichern an einem Feld, das die Oberfläche gar nicht mehr
     * anzeigt -- ein Fehler, den niemand zuordnen kann.
     */
    const responsesEnabled = input.responsesEnabled ?? true;

    if (
        responsesEnabled &&
        input.responseDeadline &&
        !Number.isNaN(input.responseDeadline.getTime())
    ) {
        if (input.responseDeadline.getTime() > input.startsAt.getTime()) {
            return "Die Rückmeldefrist muss vor dem Termin liegen.";
        }
    }

    // Eine unbekannte Farbe ist kein Fehler, sondern wird stillschweigend zur
    // Standardfarbe -- die Anzeige soll daran nicht scheitern.
    input.color = normalizeEventColor(input.color);

    return null;
}

export async function createEvent(
    input: EventInput,
    createdBy: string | null
): Promise<{ ok: boolean; id?: string; error?: string }> {
    const error = validate(input);
    if (error) return { ok: false, error };

    const [row] = await db
        .insert(events)
        .values({
            title: input.title.trim(),
            description: input.description?.trim() ?? "",
            location: input.location?.trim() ?? "",
            startsAt: input.startsAt,
            endsAt: input.endsAt ?? null,
            allDay: input.allDay ?? false,
            status: input.status ?? "published",
            responsesEnabled: input.responsesEnabled ?? true,
            color: normalizeEventColor(input.color),
            coverFileId: isUuid(input.coverFileId) ? input.coverFileId : null,
            responseDeadline: input.responsesEnabled === false
                ? null
                : (input.responseDeadline ?? null),
            createdBy: isUuid(createdBy) ? createdBy : null
        })
        .returning({ id: events.id });

    return { ok: true, id: row.id };
}

export async function updateEvent(
    id: string,
    input: EventInput
): Promise<{ ok: boolean; error?: string }> {
    if (!isUuid(id)) return { ok: false, error: "Ungültige Kennung." };

    const error = validate(input);
    if (error) return { ok: false, error };

    const responsesEnabled = input.responsesEnabled ?? true;

    await db
        .update(events)
        .set({
            title: input.title.trim(),
            description: input.description?.trim() ?? "",
            location: input.location?.trim() ?? "",
            startsAt: input.startsAt,
            endsAt: input.endsAt ?? null,
            allDay: input.allDay ?? false,
            status: input.status ?? "published",
            responsesEnabled,
            color: normalizeEventColor(input.color),
            /**
             * Das Titelbild wird nur angefasst, wenn es ausdrücklich
             * mitgeschickt wird -- es kommt aus einem eigenen Formular
             * (`setEventCover`), und das Bearbeitungsformular kennt es nicht.
             * Ohne diese Bedingung löschte jedes Speichern das Bild.
             */
            ...(input.coverFileId === undefined
                ? {}
                : { coverFileId: isUuid(input.coverFileId) ? input.coverFileId : null }),
            // Ohne Rückmeldung ergibt eine Frist keinen Sinn mehr.
            responseDeadline: responsesEnabled ? (input.responseDeadline ?? null) : null,
            updatedAt: new Date()
        })
        .where(eq(events.id, id));

    return { ok: true };
}

/**
 * Absagen statt löschen.
 *
 * Ein abgesagter Termin bleibt in der Liste stehen -- wer schon zugesagt hat,
 * soll die Absage sehen und nicht rätseln, warum der Eintrag verschwunden
 * ist. Auch der iCal-Abruf trägt ihn dann als abgesagt aus.
 */
export async function cancelEvent(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    const rows = await db
        .update(events)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(events.id, id))
        .returning({ id: events.id });
    return rows.length > 0;
}

/**
 * Löscht den Termin -- und sein Titelbild gleich mit.
 *
 * Der Fremdschlüssel steht auf ON DELETE SET NULL und räumt deshalb nichts ab:
 * ohne diesen Schritt bliebe beim ersten gelöschten Termin mit Bild eine
 * verwaiste `files`-Zeile samt Objekt im Speicher liegen, auf die nichts mehr
 * zeigt.
 */
export async function deleteEvent(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;

    const rows = await db
        .delete(events)
        .where(eq(events.id, id))
        .returning({ id: events.id, coverFileId: events.coverFileId });

    if (rows.length === 0) return false;

    await deleteFile(rows[0].coverFileId);
    return true;
}

// ---------------------------------------------------------------------------
// Titelbild
// ---------------------------------------------------------------------------

/** Nur diese drei Typen -- ein SVG führt im Browser Skript aus. */
const COVER_TYPES = ["image/png", "image/jpeg", "image/webp"];

function isFileLike(input: unknown): input is File {
    return (
        typeof input === "object" &&
        input !== null &&
        typeof (input as File).arrayBuffer === "function" &&
        typeof (input as File).size === "number"
    );
}

/**
 * Setzt oder ersetzt das Titelbild.
 *
 * Reihenfolge wie bei der Logo-Aktion der Organisationseinstellungen: erst die
 * neue Datei ablegen, dann die Spalte umhängen, und erst danach die alte
 * löschen. Andersherum stünde nach einem Fehler ein Termin ohne Bild da,
 * dessen Datei bereits weg ist.
 */
export async function setEventCover(
    eventId: string,
    file: unknown,
    uploadedBy: string | null
): Promise<{ ok: boolean; error?: string; status?: number }> {
    if (!isUuid(eventId)) return { ok: false, error: "Ungültige Kennung.", status: 400 };

    if (!isFileLike(file) || file.size === 0) {
        return { ok: false, error: "Bitte eine Bilddatei auswählen.", status: 400 };
    }

    if (file.size > MAX_FILE_BYTES) {
        return { ok: false, error: "Das Bild ist zu groß.", status: 413 };
    }

    const content = Buffer.from(await file.arrayBuffer());
    const filename = file.name || `titelbild-${Date.now()}`;

    /**
     * Signaturprüfung inbegriffen: ein als PNG gemeldetes HTML-Dokument würde
     * sonst im Objektspeicher unter dessen Ursprung ausgeliefert, wo die
     * Schutzkopfzeilen dieser Anwendung nicht mehr greifen.
     */
    const check = checkUpload(
        { filename, declaredType: file.type, content },
        COVER_TYPES
    );
    if (!check.ok) return { ok: false, error: check.error, status: check.status };

    const newId = await storeFile({
        filename,
        contentType: check.contentType,
        content,
        uploadedBy: isUuid(uploadedBy) ? uploadedBy : undefined
    });

    /**
     * `UPDATE ... RETURNING` liefert in Postgres die NEUEN Werte -- die alte
     * Kennung muss deshalb vorher gelesen werden. Beides in einer Transaktion
     * mit `FOR UPDATE`, damit zwei gleichzeitige Uploads nicht beide dieselbe
     * Vorgängerdatei löschen und eine davon verwaist zurücklassen.
     */
    let previous: string | null | undefined;
    try {
        previous = await withTransaction(async (tx) => {
            const [row] = await tx
                .select({ coverFileId: events.coverFileId })
                .from(events)
                .where(eq(events.id, eventId))
                .limit(1)
                .for("update");

            if (!row) return undefined;

            await tx
                .update(events)
                .set({ coverFileId: newId, updatedAt: new Date() })
                .where(eq(events.id, eventId));

            return row.coverFileId;
        });
    } catch (err) {
        console.warn("Titelbild konnte nicht gesetzt werden", eventId, err);
        await deleteFile(newId);
        return { ok: false, error: "Das Bild konnte nicht gespeichert werden.", status: 500 };
    }

    if (previous === undefined) {
        // Kein solcher Termin: die eben abgelegte Datei wäre unauffindbar.
        await deleteFile(newId);
        return { ok: false, error: "Der Termin wurde nicht gefunden.", status: 404 };
    }

    await deleteFile(previous);
    return { ok: true };
}

/** Entfernt das Titelbild und räumt die Datei ab. */
export async function removeEventCover(
    eventId: string
): Promise<{ ok: boolean; error?: string }> {
    if (!isUuid(eventId)) return { ok: false, error: "Ungültige Kennung." };

    const previous = await withTransaction(async (tx) => {
        const [row] = await tx
            .select({ coverFileId: events.coverFileId })
            .from(events)
            .where(eq(events.id, eventId))
            .limit(1)
            .for("update");

        if (!row) return undefined;

        await tx
            .update(events)
            .set({ coverFileId: null, updatedAt: new Date() })
            .where(eq(events.id, eventId));

        return row.coverFileId;
    });

    if (previous === undefined) return { ok: false, error: "Der Termin wurde nicht gefunden." };

    await deleteFile(previous);
    return { ok: true };
}

export async function setEventShares(
    eventId: string,
    shares: { targetKind: ShareTargetKind; targetId: string }[]
): Promise<void> {
    if (!isUuid(eventId)) return;

    await withTransaction(async (tx) => {
        await tx.delete(eventShares).where(eq(eventShares.eventId, eventId));

        const valid = shares.filter((share) => isUuid(share.targetId));
        if (valid.length === 0) return;

        await tx
            .insert(eventShares)
            .values(valid.map((share) => ({ eventId, ...share })))
            .onConflictDoNothing();
    });
}

/**
 * Rückmeldung abgeben oder ändern.
 *
 * Prüft die Frist serverseitig: das Formular blendet sie zwar aus, aber eine
 * abgelaufene Frist muss auch dann halten, wenn jemand das Formular
 * nachbaut.
 */
export async function respond(input: {
    eventId: string;
    memberId: string;
    response: ResponseValue;
    note?: string;
    respondedBy: string | null;
}): Promise<{ ok: boolean; error?: string }> {
    if (!isUuid(input.eventId) || !isUuid(input.memberId)) {
        return { ok: false, error: "Ungültige Kennung." };
    }

    const [event] = await db
        .select({
            status: events.status,
            startsAt: events.startsAt,
            responsesEnabled: events.responsesEnabled,
            responseDeadline: events.responseDeadline
        })
        .from(events)
        .where(eq(events.id, input.eventId))
        .limit(1);

    if (!event) return { ok: false, error: "Der Termin wurde nicht gefunden." };
    if (event.status === "cancelled") {
        return { ok: false, error: "Dieser Termin wurde abgesagt." };
    }

    /**
     * Das Ausblenden im Formular genügt nicht: die Kennung des Mitglieds steht
     * im Formular, und ein nachgebauter Aufruf käme sonst durch.
     */
    if (!event.responsesEnabled) {
        return {
            ok: false,
            error: "Für diesen Termin werden keine Rückmeldungen erfasst."
        };
    }

    const deadline = event.responseDeadline ?? event.startsAt;
    if (deadline.getTime() < Date.now()) {
        return {
            ok: false,
            error: event.responseDeadline
                ? "Die Rückmeldefrist ist abgelaufen."
                : "Der Termin liegt bereits in der Vergangenheit."
        };
    }

    await db
        .insert(eventResponses)
        .values({
            eventId: input.eventId,
            memberId: input.memberId,
            response: input.response,
            note: input.note?.trim() ?? "",
            respondedBy: isUuid(input.respondedBy) ? input.respondedBy : null,
            respondedAt: new Date()
        })
        .onConflictDoUpdate({
            target: [eventResponses.eventId, eventResponses.memberId],
            set: {
                response: input.response,
                note: input.note?.trim() ?? "",
                respondedBy: isUuid(input.respondedBy) ? input.respondedBy : null,
                respondedAt: new Date()
            }
        });

    return { ok: true };
}

/** Nimmt eine Rückmeldung zurück -- der Termin gilt dann wieder als offen. */
export async function withdrawResponse(eventId: string, memberId: string): Promise<void> {
    if (!isUuid(eventId) || !isUuid(memberId)) return;
    await db
        .delete(eventResponses)
        .where(
            and(eq(eventResponses.eventId, eventId), eq(eventResponses.memberId, memberId))
        );
}
