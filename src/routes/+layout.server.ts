import type { LayoutServerLoad } from "./$types";
import { DEFAULT_ORGANIZATION, getOrganizationSettings } from "$lib/server/settingsService";

/**
 * Die Angaben zur Organisation stehen auf JEDER Seite zur Verfuegung.
 *
 * Damit steht der Name des Stamms nicht mehr in rund zwanzig Dateien im
 * Quelltext, sondern an einer Stelle in den Einstellungen -- Voraussetzung
 * dafuer, dass dieselbe Anwendung fuer verschiedene Staemme laeuft.
 *
 * Ohne erreichbare Datenbank gilt die neutrale Vorbelegung. Sonst braechte
 * dieser load JEDE Seite mit einem 500er ab -- auch /setup, wo genau diese
 * fehlende Datenbank eingerichtet werden soll.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
    let organization = DEFAULT_ORGANIZATION;

    try {
        organization = await getOrganizationSettings();
    } catch (err) {
        console.warn("Organisationsdaten nicht lesbar, Vorbelegung wird benutzt:", err);
    }

    return {
        user: locals.user,
        theme: locals.theme,
        organization
    };
};
