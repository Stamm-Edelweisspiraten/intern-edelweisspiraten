import { asc, eq, inArray } from "drizzle-orm";
import { db } from "$lib/server/db";
import { isUuid, onlyUuids } from "$lib/server/db/ids";
import {
    groups,
    memberGroups,
    positionMembers,
    positions,
    roles,
    userRoles,
    users
} from "$lib/server/db/schema";

/**
 * Auflösung der Freigabeziele eines Benutzers.
 *
 * Ordner und Termine werden auf dieselben vier Arten freigegeben -- an eine
 * Gruppe, an ein Amt, an eine Rolle oder an eine einzelne Person. Wer etwas
 * sehen darf, entscheidet sich deshalb an derselben Frage: auf welche Ziele
 * passt dieser Benutzer?
 *
 * Beide Bereiche benutzen diese Funktion, damit die Sichtbarkeitsregel nur
 * an einer Stelle steht. Die Alternative -- je Bereich eine eigene Auflösung
 * -- war beim Gruppenbezug der Rechte schon einmal der Fehler: neun Routen,
 * neun Abweichungen.
 */

export type ShareTargetKind = "group" | "position" | "role" | "user";

export interface ShareTargets {
    /** Gruppen, in denen ein verknüpftes Mitglied ist. */
    groups: string[];
    /** Ämter, die der Benutzer über seine Mitglieder innehat. */
    positions: string[];
    /** Rollen des Benutzers, unabhängig vom Gruppenbezug der Zuweisung. */
    roles: string[];
    /** Der Benutzer selbst. */
    users: string[];
}

const EMPTY: ShareTargets = { groups: [], positions: [], roles: [], users: [] };

/**
 * Drei Abfragen, parallel. Sie hängen nicht voneinander ab, und die
 * Ergebnisse sind klein -- ein Benutzer hat selten mehr als eine Handvoll
 * Gruppen, Ämter und Rollen.
 */
export async function resolveShareTargets(
    user: { id?: string; memberIds?: string[] } | null
): Promise<ShareTargets> {
    if (!user?.id) return EMPTY;

    const memberIds = onlyUuids(user.memberIds ?? []);

    const [groupRows, positionRows, roleRows] = await Promise.all([
        memberIds.length === 0
            ? Promise.resolve([])
            : db
                  .selectDistinct({ groupId: memberGroups.groupId })
                  .from(memberGroups)
                  .where(inArray(memberGroups.memberId, memberIds)),

        memberIds.length === 0
            ? Promise.resolve([])
            : db
                  .selectDistinct({ positionId: positionMembers.positionId })
                  .from(positionMembers)
                  .where(inArray(positionMembers.memberId, memberIds)),

        db
            .selectDistinct({ roleId: userRoles.roleId })
            .from(userRoles)
            .where(eq(userRoles.userId, user.id))
    ]);

    return {
        groups: groupRows.map((row) => row.groupId),
        positions: positionRows.map((row) => row.positionId),
        roles: roleRows.map((row) => row.roleId),
        users: [user.id]
    };
}

/**
 * Alle Zielkennungen in einer Liste -- für ein `WHERE target_id IN (...)`.
 *
 * Die Art des Ziels wird dabei nicht mitgeprüft, und das ist bewusst: es sind
 * UUIDs aus vier verschiedenen Tabellen, eine Kollision ist praktisch
 * ausgeschlossen. Wer es genauer braucht, benutzt `matchesTargets`.
 */
export function flattenTargets(targets: ShareTargets): string[] {
    return [...targets.groups, ...targets.positions, ...targets.roles, ...targets.users];
}

/** true, wenn eine Freigabe auf einen der Ziele des Benutzers zeigt. */
export function matchesTargets(
    targets: ShareTargets,
    share: { targetKind: ShareTargetKind; targetId: string }
): boolean {
    switch (share.targetKind) {
        case "group":
            return targets.groups.includes(share.targetId);
        case "position":
            return targets.positions.includes(share.targetId);
        case "role":
            return targets.roles.includes(share.targetId);
        case "user":
            return targets.users.includes(share.targetId);
        default:
            return false;
    }
}

/**
 * Beschriftung eines Freigabeziels für die Oberfläche.
 *
 * Steht hier, weil Ordner und Termine dieselben Beschriftungen brauchen.
 */
export const SHARE_TARGET_LABELS: Record<ShareTargetKind, string> = {
    group: "Gruppe",
    position: "Amt",
    role: "Rolle",
    user: "Person"
};

export const SHARE_TARGET_ICONS: Record<ShareTargetKind, string> = {
    group: "diagram-3",
    position: "briefcase",
    role: "shield-lock",
    user: "person"
};

const SHARE_KINDS: ShareTargetKind[] = ["group", "position", "role", "user"];

/** true, wenn der Wert eine der vier Freigabearten benennt. */
export function isShareKind(value: string): value is ShareTargetKind {
    return (SHARE_KINDS as string[]).includes(value);
}

/**
 * Zerlegt die Formularwerte `art:kennung` in Freigabeziele.
 *
 * Die Oberflaeche schickt eine Freigabe als EIN Feld ("group:1234-..."),
 * damit ein einzelnes `<input type="checkbox" name="share">` genuegt. Das
 * Zerlegen stand vorher in jeder Route erneut; mit Umfragen und Galerie waeren
 * es fuenf Kopien geworden.
 *
 * Ungueltige Eintraege werden still verworfen -- ein manipuliertes Formular
 * soll keine Freigabe erzeugen, aber auch nicht die ganze Aktion abbrechen.
 */
export function parseShareValues(
    values: readonly (string | File)[]
): { targetKind: ShareTargetKind; targetId: string }[] {
    const result: { targetKind: ShareTargetKind; targetId: string }[] = [];

    for (const raw of values) {
        const entry = String(raw);
        const separator = entry.indexOf(":");
        if (separator < 0) continue;

        const kind = entry.slice(0, separator);
        const targetId = entry.slice(separator + 1);
        if (!isShareKind(kind) || !isUuid(targetId)) continue;

        result.push({ targetKind: kind, targetId });
    }

    return result;
}

/** Nur die Gruppen einer Freigabeliste -- fuer die Rechtepruefung je Gruppe. */
export function groupTargets(
    shares: readonly { targetKind: ShareTargetKind; targetId: string }[]
): string[] {
    return shares.filter((share) => share.targetKind === "group").map((share) => share.targetId);
}

/**
 * Reicht die Gruppenbindung eines Rechts fuer dieses Objekt?
 *
 * `allowedGroups` ist genau das, was `groupsWithPermission()` liefert:
 *
 *   null  -- das Recht gilt stammesweit: immer ja.
 *   []    -- das Recht liegt nicht vor: immer nein.
 *   [...] -- nur, wenn eine Freigabe auf eine dieser Gruppen zeigt.
 *
 * ACHTUNG, die Regel ist bewusst UNSYMMETRISCH: ein Objekt ohne jede Freigabe
 * ist fuer alle SICHTBAR, aber fuer eine gruppengebundene Verwaltung NICHT
 * verwaltbar. Sonst duerfte eine Meutenfuehrung mit `events.manage` fuer ihre
 * Meute die stammesweite Stammesversammlung aendern -- gerade weil diese
 * keiner Gruppe zugeordnet ist.
 */
export function sharesGrantGroupScope(
    shares: readonly { targetKind: ShareTargetKind; targetId: string }[],
    allowedGroups: readonly string[] | null
): boolean {
    if (allowedGroups === null) return true;
    if (allowedGroups.length === 0) return false;
    return shares.some(
        (share) => share.targetKind === "group" && allowedGroups.includes(share.targetId)
    );
}

/**
 * Die Namen hinter den Freigabezielen -- vier Tabellen, vier Abfragen.
 *
 * Stand vorher wortgleich in `eventService` UND `documentService`. Mit
 * Umfragen und Galerie waeren es vier Kopien geworden; genau der Fall, den
 * der Kopfkommentar von `permissionGuard.ts` als "neun Routen, neun
 * Abweichungen" beschreibt.
 */
export async function resolveTargetNames(
    shares: readonly { targetKind: ShareTargetKind; targetId: string }[]
): Promise<Map<string, string>> {
    const names = new Map<string, string>();

    const byKind: Record<ShareTargetKind, string[]> = {
        group: [],
        position: [],
        role: [],
        user: []
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

/**
 * Alle waehlbaren Freigabeziele fuer die Oberflaeche.
 *
 * Stand frueher im documentService; Ordner, Termine, Umfragen und Galerien
 * brauchen dieselbe Liste, und sie hat mit Dokumenten nichts zu tun.
 */
export async function listShareOptions(): Promise<{
    groups: { id: string; name: string }[];
    positions: { id: string; name: string }[];
    roles: { id: string; name: string }[];
    users: { id: string; name: string; email: string }[];
}> {
    const [groupRows, positionRows, roleRows, userRows] = await Promise.all([
        db.select({ id: groups.id, name: groups.name }).from(groups).orderBy(asc(groups.name)),
        db
            .select({ id: positions.id, name: positions.name })
            .from(positions)
            .orderBy(asc(positions.name)),
        db.select({ id: roles.id, name: roles.name }).from(roles).orderBy(asc(roles.name)),
        db
            .select({ id: users.id, name: users.name, email: users.email })
            .from(users)
            .where(eq(users.status, "active"))
            .orderBy(asc(users.name))
    ]);

    return { groups: groupRows, positions: positionRows, roles: roleRows, users: userRows };
}
