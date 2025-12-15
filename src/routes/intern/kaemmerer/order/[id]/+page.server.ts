import type { PageServerLoad } from "./$types";
import { error } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/permissionGuard";
import { getOrderForUser } from "$lib/server/kaemmererService";

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "kaemmerer.access");

    const order = await getOrderForUser(event.params.id, event.locals.user);
    if (!order) {
        throw error(404, "Bestellung nicht gefunden oder keine Berechtigung.");
    }

    return { order };
};
