import type { PageServerLoad } from "./$types";
import { requireAnyPermission } from "$lib/server/permissionGuard";

/**
 * Einstiegsseite der Verwaltung.
 *
 * Die Pruefung lief frueher ueber ein eigenes Array und can(). Zwei Eintraege
 * darin waren wirkungslos: can(perms, "admin.*") fragt, ob die Rechteliste
 * die ZEICHENKETTE "admin.*" abdeckt -- wer "*" oder "admin.*" besitzt,
 * erfuellt ohnehin schon "admin.view". Fuer berechtigte Zugaenge aendert sich
 * durch das Streichen also nichts.
 */
const ADMIN_PERMS = ["admin.view", "user.view", "groups.view", "system.settings.view"];

export const load: PageServerLoad = async (event) => {
    requireAnyPermission(event, ADMIN_PERMS);

    return { permissions: event.locals.permissions ?? [] };
};
