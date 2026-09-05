import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db, withTransaction } from "$lib/server/db";
import { isUuid, onlyUuids } from "$lib/server/db/ids";
import {
    eventResponses,
    eventShares,
    events,
    groups,
    members,
    positions,
    roles,
    users
} from "$lib/server/db/schema";
import {
    matchesTargets,
    resolveShareTargets,
    type ShareTargetKind
} from "$lib/server/shareService";

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

    // Entwürfe sind nur für die Verwaltung sichtbar.
    if (!options.manageAll) {
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
        if (options.manageAll) return true;
        const shares = sharesByEvent.get(row.id) ?? [];
        // Ohne Freigabe: für alle bestimmt.
        if (shares.length === 0) return true;
        return shares.some((share) => matchesTargets(targets, share));
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
    options: { manageAll?: boolean } = {}
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

    if (!options.manageAll) {
        if (row.status === "draft") return null;
        // Ohne Freigabe ist der Termin fuer alle bestimmt.
        const allowed =
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

/** Die Namen hinter den Freigabezielen -- vier Tabellen, vier Abfragen. */
async function resolveTargetNames(
    shares: { targetKind: ShareTargetKind; targetId: string }[]
): Promise<Map<string, string>> {
    const names = new Map<string, string>();

    const byKind = { group: [], position: [], role: [], user: [] } as Record<
        ShareTargetKind,
        string[]
    >;
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

/** Alle Rückmeldungen zu einem Termin, mit Namen -- die Teilnehmerliste. */
export async function listResponses(eventId: string): Promise<EventResponseEntry[]> {
    if (!isUuid(eventId)) return [];

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

    if (input.responseDeadline && !Number.isNaN(input.responseDeadline.getTime())) {
        if (input.responseDeadline.getTime() > input.startsAt.getTime()) {
            return "Die Rückmeldefrist muss vor dem Termin liegen.";
        }
    }

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
            responseDeadline: input.responseDeadline ?? null,
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
            responseDeadline: input.responseDeadline ?? null,
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

export async function deleteEvent(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    const rows = await db.delete(events).where(eq(events.id, id)).returning({ id: events.id });
    return rows.length > 0;
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
            responseDeadline: events.responseDeadline
        })
        .from(events)
        .where(eq(events.id, input.eventId))
        .limit(1);

    if (!event) return { ok: false, error: "Der Termin wurde nicht gefunden." };
    if (event.status === "cancelled") {
        return { ok: false, error: "Dieser Termin wurde abgesagt." };
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
