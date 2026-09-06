import type { LayoutServerLoad } from "./$types";
import { getOrganizationSettings } from "$lib/server/settingsService";

export const load: LayoutServerLoad = async ({ locals }) => {
    /**
     * Fuer die Navigation zaehlt, ob ein Recht ueberhaupt vorliegt -- egal ob
     * stammesweit oder nur fuer eine Gruppe. Wer `members.view` allein fuer
     * die Meute Panther hat, braucht den Eintrag "Mitgliedverwaltung"; die
     * Seite dahinter zeigt dann nur deren Mitglieder.
     *
     * `permissions` (stammesweit) bleibt daneben bestehen: darauf laufen die
     * Rechtepruefungen der Seiten. Ein Menuepunkt ist keine Absicherung -- die
     * liegt in den Guards der jeweiligen Route.
     */
    const navPermissions = Array.from(
        new Set((locals.grants ?? []).map((grant) => grant.permission))
    );

    return {
        permissions: locals.permissions ?? [],
        navPermissions,
        user: locals.user,
        impersonator: locals.impersonator,
        theme: locals.theme,
        organization: await getOrganizationSettings()
    };
};
