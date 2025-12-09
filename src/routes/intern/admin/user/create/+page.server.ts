import type { Actions, PageServerLoad } from "./$types";
import { env } from "$env/dynamic/private";
import { createUser } from "$lib/server/userService";
import { redirect, error } from "@sveltejs/kit";
import { hasPermission } from "$lib/server/permissionService";

export const load: PageServerLoad = async ({ locals }) => {
    if (!hasPermission(locals.permissions ?? [], "user.create")) {
        throw error(403, "Keine Berechtigung");
    }

    // Authentik Gruppen laden
    const AUTHENTIK_URL = env.AUTHENTIK_URL;
    const AUTHENTIK_TOKEN = env.AUTHENTIK_TOKEN;

    const res = await fetch(`${AUTHENTIK_URL}/api/v3/core/groups/?page_size=1000`, {
        headers: {
            "Authorization": `Bearer ${AUTHENTIK_TOKEN}`
        }
    });

    const groups = await res.json();

    return {
        groups: groups.results ?? []
    };
};

export const actions: Actions = {
    createUser: async ({ request, locals }) => {
        if (!hasPermission(locals.permissions ?? [], "user.create")) {
            throw error(403, "Keine Berechtigung");
        }

        const form = await request.formData();

        const name = form.get("name") as string;
        const email = form.get("email") as string;

        const groups = form.getAll("groups") as string[];

        await createUser({
            name,
            email,
            groups
        });

        throw redirect(303, "/intern/admin/user");
    }
};
