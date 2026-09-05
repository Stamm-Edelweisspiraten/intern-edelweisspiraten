import { ObjectId } from "mongodb";
import { db } from "$lib/server/mongo";
import { roles, type UserDoc } from "$lib/server/db/collections";
import { ALL_PERMISSIONS } from "$lib/permissions";
import { matchesPermission } from "$lib/permissions/match";

/**
 * Aufloesung der Berechtigungen eines Benutzers ueber seine Rollen.
 *
 * Vorher lief das ueber die kleingeschriebenen Gruppennamen aus dem Token
 * gegen groupPermissions -- mit einem Gross-/Kleinschreibungsfehler, einer
 * fest verdrahteten Sonderregel fuer "ep-admin" und einer Ausgabe der
 * kompletten Berechtigungsliste auf die Konsole bei JEDEM Request.
 */

interface CacheEntry {
    permissions: string[];
    requireMfa: boolean;
    at: number;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

/** Wird bei jeder Rollenaenderung erhoeht und macht den Cache ungueltig. */
let rolesVersion = 0;

export function invalidatePermissionCache(): void {
    rolesVersion += 1;
    cache.clear();
}

export interface ResolvedPermissions {
    permissions: string[];
    /** true, wenn eine der Rollen Zwei-Faktor verlangt. */
    requireMfa: boolean;
}

export async function resolvePermissions(roleIds: ObjectId[]): Promise<ResolvedPermissions> {
    if (!roleIds || roleIds.length === 0) {
        return { permissions: [], requireMfa: false };
    }

    const key = `${rolesVersion}:${roleIds.map((id) => id.toString()).sort().join(",")}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        return { permissions: cached.permissions, requireMfa: cached.requireMfa };
    }

    const found = await roles().find({ _id: { $in: roleIds } }).toArray();
    const permissions = Array.from(new Set(found.flatMap((role) => role.permissions ?? [])));
    const requireMfa = found.some((role) => (role as { requireMfa?: boolean }).requireMfa === true);

    cache.set(key, { permissions, requireMfa, at: Date.now() });
    return { permissions, requireMfa };
}

export async function getPermissionsForUser(user: Pick<UserDoc, "roleIds">): Promise<string[]> {
    const { permissions } = await resolvePermissions(user?.roleIds ?? []);
    return permissions;
}

/** Delegiert an den gemeinsamen Matcher. */
export function hasPermission(permissions: string[], required: string): boolean {
    return matchesPermission(permissions, required);
}

export function getAllDefinedPermissions(): string[] {
    return ALL_PERMISSIONS;
}

/**
 * Gruppen-IDs, fuer die der Benutzer als Gruppenleiter eingetragen ist.
 * Grundlage bleiben die Aemter vom Typ "gruppenleiter".
 */
export async function getLeaderGroupIdsForUser(user: {
    memberIds?: string[];
} | null): Promise<string[]> {
    const memberIds = user?.memberIds ?? [];
    if (memberIds.length === 0) return [];

    const positions = await db
        .collection("positions")
        .find({ type: "gruppenleiter", memberIds: { $in: memberIds } })
        .toArray();

    const ids = positions
        .map((position) => position.groupId as unknown)
        .filter(Boolean)
        .map((id) => String(id));

    return Array.from(new Set(ids));
}
