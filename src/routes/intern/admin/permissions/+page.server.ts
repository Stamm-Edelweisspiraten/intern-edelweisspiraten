import { AUTHENTIK_URL, AUTHENTIK_TOKEN } from "$env/static/private";
import { getAllDefinedPermissions, getPermissionsForGroup, setPermissionsForGroup } from "$lib/server/permissionService";
import { redirect } from "@sveltejs/kit";
import {getAllMembers} from "$lib/server/memberService";

export async function load() {
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
    save: async ({ request }) => {
        const form = await request.formData();
        const groupPk = form.get("groupPk") as string;   // keine Number()-Konvertierung!
        const selected = form.getAll("permissions") as string[];

        await setPermissionsForGroup(groupPk, selected);

        throw redirect(303, "/intern/admin/permissions?success=1");
    }
};


