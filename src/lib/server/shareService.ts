import { eq, inArray } from "drizzle-orm";
import { db } from "$lib/server/db";
import { onlyUuids } from "$lib/server/db/ids";
import { memberGroups, positionMembers, userRoles } from "$lib/server/db/schema";

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
