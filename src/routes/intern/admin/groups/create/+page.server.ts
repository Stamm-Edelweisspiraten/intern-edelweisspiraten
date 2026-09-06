import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { createGroup } from "$lib/server/groupService";

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "groups.create");
    return {};
};

export const actions: Actions = {
    default: async (event) => {
        requirePermission(event, "groups.create");

        const form = await event.request.formData();
        const name = String(form.get("name") ?? "").trim();
        const type = String(form.get("type") ?? "meute") === "sippe" ? "sippe" : "meute";

        if (!name) return fail(400, { error: "Bitte einen Namen für die Gruppe angeben." });

        await createGroup({
            name,
            type,
            meeting_time: String(form.get("meeting_time") ?? ""),
            description: String(form.get("description") ?? ""),
            replyTo: String(form.get("replyTo") ?? "")
        });

        throw redirect(303, "/intern/admin/groups?hinweis=angelegt");
    }
};
