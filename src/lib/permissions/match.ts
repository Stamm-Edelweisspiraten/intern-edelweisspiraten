/**
 * Der einzige Berechtigungs-Matcher des Projekts.
 *
 * Vorher existierten drei Implementierungen mit unterschiedlicher Semantik:
 *   - can()               (nur erstes Segment als Wildcard)
 *   - hasPermission()     (mehrsegmentige Wildcards)
 *   - requirePermission() (nur erstes Segment als Wildcard)
 *
 * Dadurch erlaubte "kaemmerer.order.*" je nach Aufrufer unterschiedlich viel.
 * Hier gilt einheitlich die maechtigere Variante: eine Wildcard deckt alles
 * unterhalb ihres Praefixes ab.
 */

/** Prueft, ob die Berechtigungsliste die geforderte Berechtigung abdeckt. */
export function matchesPermission(
    permissions: readonly string[] | null | undefined,
    required: string
): boolean {
    if (!permissions || permissions.length === 0) return false;
    if (!required) return false;

    for (const permission of permissions) {
        if (permission === "*") return true;
        if (permission === required) return true;

        if (permission.endsWith(".*")) {
            const prefix = permission.slice(0, -2);
            if (required === prefix || required.startsWith(`${prefix}.`)) {
                return true;
            }
        }
    }

    return false;
}

/** Prueft, ob mindestens eine der geforderten Berechtigungen vorliegt. */
export function matchesAnyPermission(
    permissions: readonly string[] | null | undefined,
    required: readonly string[]
): boolean {
    return required.some((permission) => matchesPermission(permissions, permission));
}

/** Prueft, ob alle geforderten Berechtigungen vorliegen. */
export function matchesAllPermissions(
    permissions: readonly string[] | null | undefined,
    required: readonly string[]
): boolean {
    return required.every((permission) => matchesPermission(permissions, permission));
}
