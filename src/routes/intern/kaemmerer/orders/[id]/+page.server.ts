import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { matchesPermission } from "$lib/permissions/match";
import { cancelOrder, getOrderById, setItemReceived } from "$lib/server/kaemmerer/orderService";
import { listArticles } from "$lib/server/kaemmerer/articleService";

/** Detailansicht einer Bestellung in der Verwaltung. */

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "kaemmerer.orders.view");

    const order = await getOrderById(event.params.id);
    if (!order) throw error(404, "Bestellung nicht gefunden.");

    const articles = await listArticles(true);

    return {
        order,
        articles,
        // Siehe Kommentar in der Bestelluebersicht: der gemeinsame Matcher
        // kennt Platzhalter, Array.includes nicht.
        canManage: matchesPermission(event.locals.permissions, "kaemmerer.orders.manage"),
        canCancel: matchesPermission(event.locals.permissions, "kaemmerer.order.cancel")
    };
};

export const actions: Actions = {
    /** Position als geliefert bzw. nicht geliefert markieren. */
    toggle: async (event) => {
        requirePermission(event, "kaemmerer.orders.manage");

        const form = await event.request.formData();
        const itemId = String(form.get("itemId") ?? "");
        const received = String(form.get("received")) === "true";

        const result = await setItemReceived(event.params.id, itemId, received);
        if (!result.ok) return fail(400, { error: result.error });

        return {
            success: result.allReceived
                ? "Alle Positionen sind zugestellt, die Bestellung gilt als geliefert."
                : "Die Position wurde aktualisiert."
        };
    },

    /** Storno mit Rueckbuchung des Lagerbestands und der Rechnungen. */
    cancel: async (event) => {
        requirePermission(event, "kaemmerer.order.cancel");

        const result = await cancelOrder(event.params.id, event.locals.user?.email ?? "system");
        if (!result.ok) return fail(400, { error: result.error });

        return {
            success: `Die Bestellung wurde storniert. ${result.restored ?? 0} Positionen wurden ins Lager zurückgebucht.`
        };
    }
};
