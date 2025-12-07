import { createGroup } from "$lib/server/groupService";
import { error } from "@sveltejs/kit";
import { hasPermission } from "$lib/server/permissionService";

export const actions = {
    default: async ({ request, locals }) => {
        if (!hasPermission(locals.permissions ?? [], "groups.create")) {
            throw error(403, "Keine Berechtigung");
        }

        const form = await request.formData();

        await createGroup({
            name: form.get("name") as string,
            type: form.get("type") as "meute" | "sippe",
            meeting_time: form.get("meeting_time") as string,
            description: form.get("description") as string
        });

        return { success: true };
    }
};
