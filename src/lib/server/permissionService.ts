import { eq, inArray } from "drizzle-orm";
import { db } from "$lib/server/db";
import { isUuid, onlyUuids } from "$lib/server/db/ids";
import {
    members,
    positionMembers,
    positions,
    roles,
    userRoles,
    users
} from "$lib/server/db/schema";
import { ALL_PERMISSIONS } from "$lib/permissions";
import { matchesPermission } from "$lib/permissions/match";

/**
 * Aufloesung der Rechte eines Benutzers.
 *
 * Ein Recht gilt entweder stammesweit oder fuer genau eine Gruppe. Beides
 * zusammen ergibt die Grants eines Zugangs:
 *
 *   1. Rollen, die dem Zugang direkt zugewiesen sind (user_roles) -- mit der
 *      optionalen Gruppe der Zuweisung.
 *   2. Rollen, die an einem Amt haengen, das der Zugang ueber seine
 *      verknuepften Mitglieder innehat (positions.roleId) -- mit der Gruppe
 *      des Amts.
 *
 * Vorher gab es dafuer zwei Mechanismen: eine flache Rechteliste und eine
 * zweite Namensreihe `groupleader.*`, deren Gruppenbezug aus einer eigenen
 * Abfrage stammte und in neun Routen von Hand nachgebaut war -- mit
 * Abweichungen von Route zu Route.
 */

/** Ein Recht, gueltig stammesweit (groupId === null) oder fuer eine Gruppe. */
export interface Grant {
    permission: string;
    groupId: string | null;
}

export interface ResolvedPermissions {
    /** Alle Grants, stammesweite und gruppenbezogene. */
    grants: Grant[];
    /**
     * Nur die stammesweiten Rechte, flach.
     *
     * Navigation, `can()` in den Seiten und die Scopes der REST-API arbeiten
     * damit unveraendert weiter. Wer ein Recht nur fuer eine Gruppe hat,
     * taucht hier bewusst NICHT auf -- die Seiten pruefen den Gruppenbezug
     * ueber groupsWithPermission().
     */
    permissions: string[];
    /** true, wenn eine der beteiligten Rollen Zwei-Faktor verlangt. */
    requireMfa: boolean;
}

interface CacheEntry extends ResolvedPermissions {
    at: number;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

/** Wird bei jeder Rollen-, Amts- oder Zuordnungsaenderung erhoeht. */
let rolesVersion = 0;

export function invalidatePermissionCache(): void {
    rolesVersion += 1;
    cache.clear();
}

const EMPTY: ResolvedPermissions = { grants: [], permissions: [], requireMfa: false };

/**
 * Loest die Grants eines Zugangs auf.
 *
 * Zwei Abfragen: eine fuer die direkten Rollen, eine fuer die Rollen aus
 * Aemtern. Vorher waren es drei -- resolvePermissions, ein zweiter Griff auf
 * die Rollen fuer die Schluessel und getLeaderGroupIdsForUser, Letzteres
 * ungecacht und in manchen Routen zwei- bis dreimal je Anfrage.
 */
export async function resolveGrants(input: {
    userId: string;
    memberIds: string[];
}): Promise<ResolvedPermissions> {
    if (!input.userId) return EMPTY;

    const memberIds = onlyUuids(input.memberIds ?? []);
    const key = `${rolesVersion}:${input.userId}:${[...memberIds].sort().join(",")}`;

    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        return { grants: cached.grants, permissions: cached.permissions, requireMfa: cached.requireMfa };
    }

    const [direct, viaPositions] = await Promise.all([
        db
            .select({
                permissions: roles.permissions,
                requireMfa: roles.requireMfa,
                groupId: userRoles.groupId
            })
            .from(userRoles)
            .innerJoin(roles, eq(roles.id, userRoles.roleId))
            .where(eq(userRoles.userId, input.userId)),

        memberIds.length === 0
            ? Promise.resolve([])
            : db
                  .select({
                      permissions: roles.permissions,
                      requireMfa: roles.requireMfa,
                      groupId: positions.groupId
                  })
                  .from(positions)
                  .innerJoin(positionMembers, eq(positionMembers.positionId, positions.id))
                  .innerJoin(roles, eq(roles.id, positions.roleId))
                  .where(inArray(positionMembers.memberId, memberIds))
    ]);

    const rows = [...direct, ...viaPositions];

    // Doppelte (Recht, Gruppe) zusammenfassen: dieselbe Rolle kann ueber eine
    // direkte Zuweisung UND ueber ein Amt hereinkommen.
    const seen = new Set<string>();
    const grants: Grant[] = [];

    for (const row of rows) {
        for (const permission of row.permissions ?? []) {
            const groupId = row.groupId ?? null;
            const id = `${permission} ${groupId ?? ""}`;
            if (seen.has(id)) continue;
            seen.add(id);
            grants.push({ permission, groupId });
        }
    }

    const permissions = Array.from(
        new Set(grants.filter((grant) => grant.groupId === null).map((grant) => grant.permission))
    );
    const requireMfa = rows.some((row) => row.requireMfa === true);

    const resolved: ResolvedPermissions = { grants, permissions, requireMfa };
    cache.set(key, { ...resolved, at: Date.now() });
    return resolved;
}

// ---------------------------------------------------------------------------
// Pruefung
// ---------------------------------------------------------------------------

/** Delegiert an den gemeinsamen Matcher. */
export function hasPermission(permissions: string[], required: string): boolean {
    return matchesPermission(permissions, required);
}

/**
 * Gruppen, fuer die ein Recht vorliegt.
 *
 * `null` bedeutet **stammesweit** -- also keine Einschraenkung. Ein leeres
 * Array bedeutet: das Recht liegt ueberhaupt nicht vor.
 *
 * Der Unterschied ist wichtig: eine Route, die `null` bekommt, laedt alles;
 * bei einem Array filtert sie. Ein leeres Array und "alle Gruppen" duerfen
 * nicht verwechselt werden.
 */
export function groupsForPermission(grants: Grant[], required: string): string[] | null {
    const groups = new Set<string>();

    for (const grant of grants) {
        if (!matchesPermission([grant.permission], required)) continue;
        if (grant.groupId === null) return null;
        groups.add(grant.groupId);
    }

    return Array.from(groups);
}

/** true, wenn das Recht stammesweit oder fuer diese Gruppe vorliegt. */
export function hasPermissionForGroup(
    grants: Grant[],
    required: string,
    groupId: string | null | undefined
): boolean {
    const groups = groupsForPermission(grants, required);
    if (groups === null) return true;
    if (!groupId) return false;
    return groups.includes(groupId);
}

/** true, wenn das Recht fuer mindestens eine der Gruppen vorliegt. */
export function hasPermissionForAnyGroup(
    grants: Grant[],
    required: string,
    groupIds: readonly string[]
): boolean {
    const groups = groupsForPermission(grants, required);
    if (groups === null) return true;
    return groupIds.some((id) => groups.includes(id));
}

export function getAllDefinedPermissions(): string[] {
    return ALL_PERMISSIONS;
}

// ---------------------------------------------------------------------------
// Aemter
// ---------------------------------------------------------------------------

/**
 * Aemter, die ein Zugang ueber seine verknuepften Mitglieder innehat.
 *
 * Wird fuer die Freigabe von Ordnern und Terminen an ein Amt gebraucht.
 */
export async function getPositionIdsForUser(memberIds: string[]): Promise<string[]> {
    const valid = onlyUuids(memberIds ?? []);
    if (valid.length === 0) return [];

    const rows = await db
        .selectDistinct({ positionId: positionMembers.positionId })
        .from(positionMembers)
        .where(inArray(positionMembers.memberId, valid));

    return rows.map((row) => row.positionId);
}

// ---------------------------------------------------------------------------
// Uebersicht je Gruppe
// ---------------------------------------------------------------------------

/** Ein Rechtezugang zu einer Gruppe -- direkt zugewiesen oder ueber ein Amt. */
export interface GroupAccessEntry {
    /** "role" = direkte Zuweisung, "position" = ueber ein Amt. */
    via: "role" | "position";
    /** Name des Zugangs bzw. des Mitglieds, das das Amt innehat. */
    holder: string;
    /** Bei "position": der Name des Amts. */
    positionName: string | null;
    roleName: string;
    permissions: string[];
}

/**
 * Wer hat in dieser Gruppe welche Rechte?
 *
 * Beantwortet die Frage, die sich vorher gar nicht stellen liess: der
 * Gruppenbezug entstand allein aus einem Amt vom Typ "gruppenleiter" und war
 * nirgends zusammengefasst sichtbar.
 *
 * Stammesweite Rechte tauchen hier bewusst NICHT auf -- die gelten fuer jede
 * Gruppe und wuerden die Liste unbrauchbar machen.
 */
export async function getGroupAccess(groupId: string): Promise<GroupAccessEntry[]> {
    if (!isUuid(groupId)) return [];

    const [direct, viaPositions] = await Promise.all([
        db
            .select({
                holder: users.name,
                roleName: roles.name,
                permissions: roles.permissions
            })
            .from(userRoles)
            .innerJoin(roles, eq(roles.id, userRoles.roleId))
            .innerJoin(users, eq(users.id, userRoles.userId))
            .where(eq(userRoles.groupId, groupId)),

        db
            .select({
                positionName: positions.name,
                firstname: members.firstname,
                lastname: members.lastname,
                roleName: roles.name,
                permissions: roles.permissions
            })
            .from(positions)
            .innerJoin(roles, eq(roles.id, positions.roleId))
            .leftJoin(positionMembers, eq(positionMembers.positionId, positions.id))
            .leftJoin(members, eq(members.id, positionMembers.memberId))
            .where(eq(positions.groupId, groupId))
    ]);

    const entries: GroupAccessEntry[] = direct.map((row) => ({
        via: "role",
        holder: row.holder,
        positionName: null,
        roleName: row.roleName,
        permissions: row.permissions ?? []
    }));

    for (const row of viaPositions) {
        const name = [row.firstname, row.lastname].filter(Boolean).join(" ");
        entries.push({
            via: "position",
            // Ein Amt kann unbesetzt sein -- die Rechte greifen dann bei niemandem.
            holder: name || "Nicht besetzt",
            positionName: row.positionName,
            roleName: row.roleName,
            permissions: row.permissions ?? []
        });
    }

    return entries.sort(
        (a, b) => a.roleName.localeCompare(b.roleName, "de") || a.holder.localeCompare(b.holder, "de")
    );
}
