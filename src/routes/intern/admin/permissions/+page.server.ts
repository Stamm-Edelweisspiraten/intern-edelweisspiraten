import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { requireAnyPermission } from "$lib/server/permissionGuard";
import { getAllDefinedPermissions } from "$lib/server/permissionService";
import {
    countUsersPerRole,
    createRole,
    deleteRole,
    listRoles,
    updateRole
} from "$lib/server/roleService";
import { isGroupScopable } from "$lib/permissions";
import { matchesPermission } from "$lib/permissions/match";
import { PERMISSION_HINTS, PERMISSION_LABELS, PERMISSION_MODULES } from "$lib/permissions/labels";

/**
 * Berechtigungen je Rolle.
 *
 * Vorher wurden hier die Gruppen des externen Anbieters ueber dessen API
 * geladen und die Berechtigungen unter deren Kennung abgelegt; die Zuordnung
 * beim Anmelden erfolgte dann ueber den kleingeschriebenen Gruppennamen,
 * waehrend hier der Name unveraendert gespeichert wurde.
 *
 * Die Seite zeigte zuletzt die rohen Schluessel und konnte weder "Zwei-Faktor
 * erforderlich" setzen noch eine Rolle loeschen -- beides gibt es im
 * roleService seit jeher. Der Rechte-Cache wird nicht mehr hier verworfen,
 * sondern im roleService selbst, damit es nicht vergessen werden kann.
 *
 * Seit dem Umbau auf Master-Detail steht links die Rollenliste und rechts nur
 * noch die Rechtematrix der EINEN gewaehlten Rolle -- gestapelte Karten mit je
 * ueber siebzig Kaestchen waren nicht mehr zu ueberblicken. Zwei Entscheidungen
 * dahinter:
 *
 *   - Die Auswahl steht in der URL (`?rolle=<id>`), nicht nur im Browser.
 *     Nur so ueberlebt sie den `redirect(303)` nach dem Speichern, laesst sich
 *     verlinken und funktioniert ohne JavaScript. Ist die Kennung unbekannt
 *     oder fehlt sie, faellt die Seite auf die erste Rolle zurueck.
 *   - Der Aussperrschutz in `save` verhindert den Fall, in dem kein Zugang mehr
 *     das Recht "*" haette: die Rechteverwaltung selbst waere dann fuer
 *     niemanden mehr erreichbar und liesse sich nur in der Datenbank
 *     reparieren.
 *
 * An der Speichersemantik hat der Umbau nichts geaendert: das Formular sendet
 * jede angehakte Box, `updateRole` ersetzt die Liste vollstaendig und
 * normalisiert sie. Bestehende Rechte aendern sich dadurch nicht nebenbei.
 */

/** Die Bloecke der Rechtematrix, fertig beschriftet. */
function permissionModules() {
    const all = getAllDefinedPermissions();

    return PERMISSION_MODULES.map((module) => ({
        ...module,
        permissions: all
            .filter((permission) =>
                module.key === "*" ? permission === "*" : permission.startsWith(`${module.key}.`)
            )
            .map((permission) => ({
                key: permission,
                label: PERMISSION_LABELS[permission] ?? permission,
                hint: PERMISSION_HINTS[permission] ?? "",
                groupScopable: isGroupScopable(permission)
            }))
    })).filter((module) => module.permissions.length > 0);
}

export const load: PageServerLoad = async (event) => {
    requireAnyPermission(event, ["admin.view", "system.settings.view", "roles.manage"]);

    const [roles, counts] = await Promise.all([listRoles(), countUsersPerRole()]);

    const list = roles.map((role) => ({
        id: role.id,
        key: role.key,
        name: role.name,
        description: role.description ?? "",
        permissions: role.permissions ?? [],
        requireMfa: role.requireMfa === true,
        system: role.system === true,
        userCount: counts.get(role.id) ?? 0
    }));

    // Unbekannte oder fehlende Kennung: die erste Rolle, damit rechts nie eine
    // leere Flaeche steht, solange es ueberhaupt Rollen gibt.
    const requested = event.url.searchParams.get("rolle");
    const selectedRoleId = list.find((role) => role.id === requested)?.id ?? list[0]?.id ?? null;

    return {
        roles: list,
        selectedRoleId,
        modules: permissionModules()
    };
};

export const actions: Actions = {
    save: async (event) => {
        requireAnyPermission(event, ["admin.view", "system.settings.update", "roles.manage"]);

        const form = await event.request.formData();
        const roleId = String(form.get("roleId") ?? "");
        const permissions = form.getAll("permissions").map(String);
        const requireMfa = form.get("requireMfa") === "on";

        if (!roleId) return fail(400, { error: "Es wurde keine Rolle ausgewählt." });

        const [all, counts] = await Promise.all([listRoles(), countUsersPerRole()]);
        const role = all.find((entry) => entry.id === roleId);
        if (!role) return fail(404, { error: "Die Rolle wurde nicht gefunden." });

        /*
         * Aussperrschutz. Verliert diese Rolle das Recht "*", muss eine ANDERE
         * Rolle mit "*" noch mindestens einen Zugang tragen -- sonst koennte
         * hinterher niemand mehr Rechte vergeben.
         */
        const losesWildcard =
            matchesPermission(role.permissions ?? [], "*") && !matchesPermission(permissions, "*");

        if (losesWildcard) {
            const fallbackExists = all.some(
                (entry) =>
                    entry.id !== roleId &&
                    matchesPermission(entry.permissions ?? [], "*") &&
                    (counts.get(entry.id) ?? 0) > 0
            );

            if (!fallbackExists) {
                return fail(400, {
                    error:
                        "Danach hätte kein Zugang mehr uneingeschränkte Rechte und niemand könnte " +
                        "die Rechteverwaltung noch öffnen. Vergib das Recht „Alles“ zuerst an eine " +
                        "andere Rolle, die mindestens einem Zugang zugewiesen ist."
                });
            }
        }

        const ok = await updateRole(roleId, { permissions, requireMfa });
        if (!ok) return fail(404, { error: "Die Rolle wurde nicht gefunden." });

        // Die Auswahl bleibt erhalten -- sonst stuende nach dem Speichern
        // wieder die erste Rolle rechts.
        throw redirect(
            303,
            `/intern/admin/permissions?rolle=${encodeURIComponent(roleId)}&gespeichert=1`
        );
    },

    create: async (event) => {
        requireAnyPermission(event, ["admin.view", "system.settings.update", "roles.manage"]);

        const form = await event.request.formData();
        const name = String(form.get("name") ?? "").trim();
        const key = String(form.get("key") ?? "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, "-");
        const description = String(form.get("description") ?? "").trim();

        if (!name) return fail(400, { error: "Bitte einen Namen für die Rolle angeben." });
        if (!key) return fail(400, { error: "Bitte einen Schlüssel für die Rolle angeben." });

        const existing = await listRoles();
        if (existing.some((role) => role.key === key)) {
            return fail(400, { error: `Der Schlüssel „${key}“ ist bereits vergeben.` });
        }

        const created = await createRole({ key, name, description, permissions: [] });

        // Direkt auf die neue Rolle: sie hat noch kein einziges Recht, der
        // naechste Schritt ist also immer die Rechtematrix.
        throw redirect(
            303,
            `/intern/admin/permissions?rolle=${encodeURIComponent(created.id)}&gespeichert=1`
        );
    },

    /**
     * Systemrollen weist der Dienst ab. Die Zuweisungen an Zugaenge und Aemter
     * verschwinden ueber die Fremdschluessel mit.
     */
    delete: async (event) => {
        requireAnyPermission(event, ["admin.view", "system.settings.update", "roles.manage"]);

        const form = await event.request.formData();
        const roleId = String(form.get("roleId") ?? "");
        if (!roleId) return fail(400, { error: "Es wurde keine Rolle ausgewählt." });

        const result = await deleteRole(roleId);
        if (!result.ok) return fail(400, { error: result.reason ?? "Löschen nicht möglich." });

        // Ohne rolle-Parameter: die geloeschte Rolle gibt es nicht mehr, die
        // Seite waehlt beim naechsten Laden wieder die erste.
        throw redirect(303, "/intern/admin/permissions?geloescht=1");
    }
};
