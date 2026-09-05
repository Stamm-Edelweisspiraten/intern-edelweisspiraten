import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { matchesPermission } from "$lib/permissions/match";
import { listOrders, updateOrderStatus } from "$lib/server/kaemmerer/orderService";
import { isOrderStatus } from "$lib/kaemmerer/orderStatus";

/** Bestellverwaltung: alle Bestellungen. */

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "kaemmerer.orders.view");

    const status = event.url.searchParams.get("status") ?? "";
    const orders = await listOrders({ status: status || undefined });

    return {
        orders,
        status: isOrderStatus(status) ? status : "",
        // Ueber den gemeinsamen Matcher statt ueber Array.includes: eine
        // breitere Rolle wie "kaemmerer.orders.*" wurde sonst nicht erkannt,
        // sodass die Schaltflaechen verborgen blieben, obwohl die Aktion
        // durchging.
        canManage: matchesPermission(event.locals.permissions, "kaemmerer.orders.manage")
    };
};

export const actions: Actions = {
    /**
     * Vorher war diese Aktion voellig ungeschuetzt und schrieb den
     * Formularwert per `as any` ungeprueft in die Datenbank.
     */
    status: async (event) => {
        requirePermission(event, "kaemmerer.orders.manage");

        const form = await event.request.formData();
        const id = String(form.get("orderId") ?? "");
        const status = String(form.get("status") ?? "");
        const paymentStatus = String(form.get("paymentStatus") ?? "");

        if (!id) return fail(400, { error: "Es wurde keine Bestellung angegeben." });

        const result = await updateOrderStatus(id, status, paymentStatus || undefined);
        if (!result.ok) return fail(400, { error: result.error });

        return { success: "Der Status wurde aktualisiert." };
    }
};
