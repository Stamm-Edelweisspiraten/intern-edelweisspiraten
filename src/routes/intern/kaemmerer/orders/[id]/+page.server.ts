import type { Actions, PageServerLoad } from "./$types";
import { error, fail, redirect } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/permissionGuard";
import { getOrderById, listArticles, updateOrderItemReceived, updateOrderStatus } from "$lib/server/kaemmererService";

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "kaemmerer.orders.view");

    const order = await getOrderById(event.params.id);
    if (!order) {
        throw error(404, "Bestellung nicht gefunden.");
    }

    const articles = await listArticles(true);

    return { order, articles };
};

export const actions: Actions = {
    toggle: async ({ request, params }) => {
        const form = await request.formData();
        const idxRaw = form.get("itemIndex")?.toString() ?? "";
        const receivedRaw = form.get("received")?.toString() ?? "";

        const itemIndex = Number(idxRaw);
        const received = receivedRaw === "true";

        if (!Number.isFinite(itemIndex) || itemIndex < 0) {
            return fail(400, { error: "Ungueltiger Index" });
        }

        await updateOrderItemReceived(params.id, itemIndex, received);

        const updated = await getOrderById(params.id);
        const allReceived = updated?.items?.length ? updated.items.every((i) => i.received) : false;
        const alreadyPaid = updated?.status === "paid" || updated?.paymentStatus === "paid";
        if (allReceived) {
            await updateOrderStatus(params.id, alreadyPaid ? "paid" : "delivered", updated?.paymentStatus);
        }

        throw redirect(303, `/intern/kaemmerer/orders/${params.id}`);
    }
};
