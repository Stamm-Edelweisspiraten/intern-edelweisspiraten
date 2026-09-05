import type { RequestEvent } from "@sveltejs/kit";
import { error } from "@sveltejs/kit";
import { matchesPermission, matchesAnyPermission } from "$lib/permissions/match";

/**
 * Erzwingt eine Berechtigung fuer den aktuellen Request.
 *
 * Wichtig: SvelteKit fuehrt bei Form-Actions KEIN load aus. Eine Absicherung
 * nur im load schuetzt die zugehoerige Action also nicht -- jede Action muss
 * diesen Guard selbst aufrufen.
 */
export function requirePermission(event: RequestEvent, permission: string): true {
    if (matchesPermission(event.locals.permissions, permission)) return true;
    throw error(403, "Keine Berechtigung");
}

/** Erzwingt, dass mindestens eine der Berechtigungen vorliegt. */
export function requireAnyPermission(event: RequestEvent, permissions: readonly string[]): true {
    if (matchesAnyPermission(event.locals.permissions, permissions)) return true;
    throw error(403, "Keine Berechtigung");
}

/** Erzwingt eine angemeldete Sitzung und liefert den Benutzer zurueck. */
export function requireUser(event: RequestEvent) {
    const user = event.locals.user;
    if (!user) throw error(401, "Nicht angemeldet");
    return user;
}
