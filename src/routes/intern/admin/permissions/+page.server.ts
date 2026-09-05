import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { requireAnyPermission } from "$lib/server/permissionGuard";
import { getAllDefinedPermissions, invalidatePermissionCache } from "$lib/server/permissionService";
import { countUsersPerRole, createRole, listRoles, updateRole } from "$lib/server/roleService";

/**
 * Berechtigungen je Rolle.
 *
 * Vorher wurden hier die Gruppen des externen Anbieters ueber dessen API
 * geladen und die Berechtigungen unter deren Kennung abgelegt; die Zuordnung
 * beim Anmelden erfolgte dann ueber den kleingeschriebenen Gruppennamen,
 * waehrend hier der Name unveraendert gespeichert wurde.
 */

export const load: PageServerLoad = async (event) => {
    requireAnyPermission(event, ["admin.view", "system.settings.view"]);

    const [roles, counts] = await Promise.all([listRoles(), countUsersPerRole()]);

    return {
        roles: roles.map((role) => ({
            id: role._id!.toString(),
            key: role.key,
            name: role.name,
            description: role.description ?? "",
            permissions: role.permissions ?? [],
            system: role.system === true,
            userCount: counts.get(role._id!.toString()) ?? 0
        })),
        allPermissions: getAllDefinedPermissions()
    };
};

export const actions: Actions = {
    save: async (event) => {
        requireAnyPermission(event, ["admin.view", "system.settings.update"]);

        const form = await event.request.formData();
        const roleId = String(form.get("roleId") ?? "");
        const permissions = form.getAll("permissions").map(String);

        if (!roleId) return fail(400, { error: "Es wurde keine Rolle ausgewählt." });

        const ok = await updateRole(roleId, { permissions });
        if (!ok) return fail(404, { error: "Die Rolle wurde nicht gefunden." });

        invalidatePermissionCache();
        throw redirect(303, "/intern/admin/permissions?gespeichert=1");
    },

    create: async (event) => {
        requireAnyPermission(event, ["admin.view", "system.settings.update"]);

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
        invalidatePermissionCache();

        throw redirect(303, "/intern/admin/permissions?gespeichert=1");
    }
};
