import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { getOrderForMembers } from "$lib/server/kaemmerer/orderService";

/** Detailansicht einer eigenen Bestellung. */
export const load: PageServerLoad = async (event) => {
    requirePermission(event, "kaemmerer.order.view");

    const order = await getOrderForMembers(event.params.id, event.locals.user?.memberIds ?? []);
    if (!order) throw error(404, "Bestellung nicht gefunden oder keine Berechtigung.");

    return { order };
};
