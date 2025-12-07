import { AUTHENTIK_URL, AUTHENTIK_TOKEN } from "$env/static/private";
import { getAllDefinedPermissions, getPermissionsForGroup, setPermissionsForGroup } from "$lib/server/permissionService";
import { redirect, error } from "@sveltejs/kit";
import { hasPermission } from "$lib/server/permissionService";

export async function load({ locals }) {
    if (!hasPermission(locals.permissions ?? [], "admin.*") && !hasPermission(locals.permissions ?? [], "system.settings.view")) {
        throw error(403, "Keine Berechtigung");
    }

    // Authentik Gruppen laden
    const groupsRes = await fetch(`${AUTHENTIK_URL}/api/v3/core/groups/`, {
        headers: {
            Authorization: `Bearer ${AUTHENTIK_TOKEN}`
        }
    });

    const groups = await groupsRes.json();

    const allPermissions: string[] = await getAllDefinedPermissions();

    const groupPermissions: Record<string, string[]> = {};

    for (const g of groups.results) {
        const pk = String(g.pk);
        groupPermissions[pk] = await getPermissionsForGroup(pk);
    }

    return {
        groups: groups.results,
        allPermissions,
        groupPermissions,
    };
}

export const actions = {
    save: async ({ request, locals }) => {
        if (!hasPermission(locals.permissions ?? [], "admin.*") && !hasPermission(locals.permissions ?? [], "system.settings.update")) {
            throw error(403, "Keine Berechtigung");
        }

        const form = await request.formData();
        const groupPk = form.get("groupPk") as string;   // keine Number()-Konvertierung!
        const groupName = form.get("groupName") as string | null;
        const selected = form.getAll("permissions") as string[];

        await setPermissionsForGroup(groupPk, selected, groupName ?? undefined);

        throw redirect(303, "/intern/admin/permissions?success=1");
    }
};
