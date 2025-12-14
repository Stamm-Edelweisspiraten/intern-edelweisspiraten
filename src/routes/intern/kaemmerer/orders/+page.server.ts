import type { Actions, PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { listOrders, updateOrderStatus } from "$lib/server/kaemmererService";
import { fail, redirect } from "@sveltejs/kit";

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "kaemmerer.orders.view");

    const status = event.url.searchParams.get("status") ?? undefined;
    const orders = await listOrders({ status: status ?? undefined });

    return { orders, status: status ?? "" };
};

export const actions: Actions = {
    status: async ({ request }) => {
        const form = await request.formData();
        const id = form.get("orderId")?.toString() ?? "";
        const status = form.get("status")?.toString() as any;
        const paymentStatus = form.get("paymentStatus")?.toString() as any;

        if (!id || !status) return fail(400, { error: "Ungueltige Daten" });

        await updateOrderStatus(id, status, paymentStatus);
        throw redirect(303, "/intern/kaemmerer/orders");
    }
};
