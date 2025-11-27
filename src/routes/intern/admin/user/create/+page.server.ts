import type { Actions, PageServerLoad } from "./$types";
import { AUTHENTIK_TOKEN, AUTHENTIK_URL } from "$env/static/private";
import { createUser } from "$lib/server/userService";
import { redirect } from "@sveltejs/kit";

export const load: PageServerLoad = async () => {
    // Authentik Gruppen laden
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
    createUser: async ({ request }) => {
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
