import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/api/handle";
import { badRequest, notFound, parseBody } from "$lib/server/api/respond";
import { resource } from "$lib/server/api/pagination";
import { orderUpdateSchema } from "$lib/server/api/schemas";
import { cancelOrder, getOrderById, updateOrderStatus } from "$lib/server/kaemmerer/orderService";

export const GET: RequestHandler = async (event) => {
    const denied = requireScope(event, "kaemmerer.orders.view");
    if (denied) return denied;

    const order = await getOrderById(event.params.id);
    if (!order) return notFound("Die Bestellung");

    return resource(order);
};

export const PATCH: RequestHandler = async (event) => {
    const denied = requireScope(event, "kaemmerer.orders.manage");
    if (denied) return denied;

    const body = await parseBody(event, orderUpdateSchema);
    if (!body.ok) return body.response!;

    // "cancelled" laeuft ueber cancelOrder, damit Lagerbestand und Rechnungen
    // mit zurueckgebucht werden.
    if (body.data!.status === "cancelled") {
        const result = await cancelOrder(event.params.id, event.locals.apiToken?.name ?? "api");
        if (!result.ok) return badRequest(result.error ?? "Storno fehlgeschlagen.");
        return resource(await getOrderById(event.params.id));
    }

    if (body.data!.status) {
        const result = await updateOrderStatus(
            event.params.id,
            body.data!.status,
            body.data!.paymentStatus
        );
        if (!result.ok) return badRequest(result.error ?? "Speichern fehlgeschlagen.");
    }

    return resource(await getOrderById(event.params.id));
};
