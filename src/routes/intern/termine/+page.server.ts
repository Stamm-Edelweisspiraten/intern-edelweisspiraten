import type { PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";

/**
 * Termine und Downloads waren bisher die einzigen beiden Navigationspunkte
 * ohne jede Berechtigungspruefung -- und ohne Serverdatei ueberhaupt.
 */
export const load: PageServerLoad = async (event) => {
    requirePermission(event, "termine.view");
    return {};
};
