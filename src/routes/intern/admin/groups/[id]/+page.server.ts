import { getGroup, updateGroup } from "$lib/server/groupService";
import { error } from "@sveltejs/kit";
import { hasPermission } from "$lib/server/permissionService";

export async function load({ params, url, locals }) {
    if (!hasPermission(locals.permissions ?? [], "groups.view")) {
        throw error(403, "Keine Berechtigung");
    }

    const group = await getGroup(params.id);

    if (!group) {
        return {
            group: null,
            scope: null
        };
    }

    return {
        group,
        scope: url.searchParams.get("scope")  // "edit" oder null
    };
}

export const actions = {
    update: async ({ params, request, locals }) => {
        if (!hasPermission(locals.permissions ?? [], "groups.edit")) {
            throw error(403, "Keine Berechtigung");
        }

        const form = await request.formData();

        await updateGroup(params.id, {
            name: form.get("name"),
            type: form.get("type") as "sippe" | "meute",
            meeting_time: form.get("meeting_time"),
            description: form.get("description"),
            replyTo: form.get("replyTo")?.toString() ?? ""
        });

        return { success: true };
    }
};
