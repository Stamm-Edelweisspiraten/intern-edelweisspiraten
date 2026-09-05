import type { LayoutServerLoad } from "./$types";
import { getOrganizationSettings } from "$lib/server/settingsService";

/**
 * Die Angaben zur Organisation stehen auf JEDER Seite zur Verfuegung.
 *
 * Damit steht der Name des Stamms nicht mehr in rund zwanzig Dateien im
 * Quelltext, sondern an einer Stelle in den Einstellungen -- Voraussetzung
 * dafuer, dass dieselbe Anwendung fuer verschiedene Staemme laeuft.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
    return {
        user: locals.user,
        theme: locals.theme,
        organization: await getOrganizationSettings()
    };
};
