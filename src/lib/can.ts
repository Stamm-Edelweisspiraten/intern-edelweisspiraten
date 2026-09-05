import { matchesPermission, matchesAnyPermission } from "$lib/permissions/match";

/**
 * Clientseitige Berechtigungspruefung (z.B. zum Ausblenden von Navigation).
 * Delegiert an den gemeinsamen Matcher, damit Client und Server identisch werten.
 */
export function can(permissions: readonly string[] | null | undefined, permission: string): boolean {
    return matchesPermission(permissions, permission);
}

/** Wie can(), aber wahr, sobald eine der Berechtigungen vorliegt. */
export function canAny(
    permissions: readonly string[] | null | undefined,
    required: readonly string[]
): boolean {
    return matchesAnyPermission(permissions, required);
}
