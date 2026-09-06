import type { RequestEvent } from "@sveltejs/kit";
import { error } from "@sveltejs/kit";
import { matchesPermission, matchesAnyPermission } from "$lib/permissions/match";
import {
    groupsForPermission,
    hasPermissionForAnyGroup,
    hasPermissionForGroup
} from "$lib/server/permissionService";

/**
 * Rechtepruefung fuer den aktuellen Request.
 *
 * Wichtig: SvelteKit fuehrt bei Form-Actions KEIN load aus. Eine Absicherung
 * nur im load schuetzt die zugehoerige Action also nicht -- jede Action muss
 * einen dieser Guards selbst aufrufen.
 *
 * Es gibt zwei Ebenen:
 *
 *   requirePermission()         -- das Recht muss STAMMESWEIT vorliegen.
 *   requirePermissionForGroup() -- stammesweit ODER fuer diese Gruppe.
 *   groupsWithPermission()      -- auf welche Gruppen ist der Zugriff begrenzt?
 *
 * Die dritte ist der Ersatz fuer das Muster, das vorher in neun Routen von
 * Hand stand: erst "kann alles?" pruefen, sonst die erlaubten Gruppen laden
 * und die Ergebnisliste damit schneiden. Dort wich die Umsetzung von Route zu
 * Route ab -- mal `.some()`, mal `.includes()`, in der E-Mail-Route ein
 * stilles `.filter()`, das Mitglieder ohne Hinweis wegliess.
 */

export function requirePermission(event: RequestEvent, permission: string): true {
    if (matchesPermission(event.locals.permissions, permission)) return true;
    throw error(403, "Keine Berechtigung");
}

/** Erzwingt, dass mindestens eine der Berechtigungen stammesweit vorliegt. */
export function requireAnyPermission(event: RequestEvent, permissions: readonly string[]): true {
    if (matchesAnyPermission(event.locals.permissions, permissions)) return true;
    throw error(403, "Keine Berechtigung");
}

/**
 * Erzwingt ein Recht fuer eine bestimmte Gruppe.
 *
 * Erfuellt, wenn das Recht stammesweit vorliegt oder fuer genau diese Gruppe.
 */
export function requirePermissionForGroup(
    event: RequestEvent,
    permission: string,
    groupId: string | null | undefined
): true {
    if (hasPermissionForGroup(event.locals.grants, permission, groupId)) return true;
    throw error(403, "Keine Berechtigung");
}

/**
 * Erzwingt ein Recht fuer mindestens eine der Gruppen.
 *
 * Fuer Datensaetze, die in mehreren Gruppen liegen koennen -- ein Mitglied
 * gehoert oft zu Meute UND Sippe. Wer eine davon leitet, darf den Datensatz
 * sehen.
 */
export function requirePermissionForAnyGroup(
    event: RequestEvent,
    permission: string,
    groupIds: readonly string[]
): true {
    if (hasPermissionForAnyGroup(event.locals.grants, permission, groupIds)) return true;
    throw error(403, "Keine Berechtigung");
}

/**
 * Auf welche Gruppen ist der Zugriff begrenzt?
 *
 *   null  -- das Recht gilt stammesweit, es wird nicht gefiltert
 *   []    -- das Recht liegt nicht vor
 *   [...] -- nur diese Gruppen
 *
 * Wirft NICHT. Wer abweisen will, prueft das leere Array selbst -- viele
 * Routen wollen stattdessen eine leere Liste anzeigen.
 */
export function groupsWithPermission(event: RequestEvent, permission: string): string[] | null {
    return groupsForPermission(event.locals.grants, permission);
}

/**
 * Wie groupsWithPermission, wirft aber bei fehlendem Recht.
 *
 * Der haeufigste Fall in einem load: entweder alles sehen, oder eine
 * Teilmenge, oder gar nicht hier sein.
 */
export function requireGroupsWithPermission(
    event: RequestEvent,
    permission: string
): string[] | null {
    const groups = groupsForPermission(event.locals.grants, permission);
    if (groups !== null && groups.length === 0) throw error(403, "Keine Berechtigung");
    return groups;
}

/** Erzwingt eine angemeldete Sitzung und liefert den Benutzer zurueck. */
export function requireUser(event: RequestEvent) {
    const user = event.locals.user;
    if (!user) throw error(401, "Nicht angemeldet");
    return user;
}
