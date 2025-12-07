import { getAllGroups, deleteGroup } from "$lib/server/groupService";
import { error } from "@sveltejs/kit";
import { hasPermission } from "$lib/server/permissionService";

export async function load({ locals }) {
    if (!hasPermission(locals.permissions ?? [], "groups.view")) {
        throw error(403, "Keine Berechtigung");
    }

    const groups = await getAllGroups();
    return { groups };
}

export const actions = {
    delete: async ({ request, locals }) => {
        if (!hasPermission(locals.permissions ?? [], "groups.delete")) {
            throw error(403, "Keine Berechtigung");
        }

        const form = await request.formData();
        const id = form.get("id") as string;

        await deleteGroup(id);

        return { success: true };
    }
};
