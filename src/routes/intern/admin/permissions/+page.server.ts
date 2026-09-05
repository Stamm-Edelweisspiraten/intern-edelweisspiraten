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

    return {
        roles: roles.map((role) => ({
            id: role.id,
            key: role.key,
            name: role.name,
            description: role.description ?? "",
            permissions: role.permissions ?? [],
            requireMfa: role.requireMfa === true,
            system: role.system === true,
            userCount: counts.get(role.id) ?? 0
        })),
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

        const ok = await updateRole(roleId, { permissions, requireMfa });
        if (!ok) return fail(404, { error: "Die Rolle wurde nicht gefunden." });

        throw redirect(303, "/intern/admin/permissions?gespeichert=1");
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

        await createRole({ key, name, description, permissions: [] });

        throw redirect(303, "/intern/admin/permissions?gespeichert=1");
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

        throw redirect(303, "/intern/admin/permissions?geloescht=1");
    }
};
