import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/api/handle";
import { badRequest, created, parseBody } from "$lib/server/api/respond";
import { collection } from "$lib/server/api/pagination";
import { orderCreateSchema } from "$lib/server/api/schemas";
import { createOrder, listOrders } from "$lib/server/kaemmerer/orderService";

export const GET: RequestHandler = async (event) => {
    const denied = requireScope(event, "kaemmerer.orders.view");
    if (denied) return denied;

    return collection(await listOrders({ status: event.url.searchParams.get("status") ?? undefined }));
};

export const POST: RequestHandler = async (event) => {
    const denied = requireScope(event, "kaemmerer.orders.manage");
    if (denied) return denied;

    const body = await parseBody(event, orderCreateSchema);
    if (!body.ok) return body.response!;

    const name = event.locals.apiToken?.name ?? "api";
    const result = await createOrder({
        lines: body.data!.lines,
        memberIds: body.data!.memberIds,
        createdBy: "",
        createdByName: name
    });

    if (!result.ok) return badRequest(result.error ?? "Anlegen fehlgeschlagen.");

    return created(
        { data: result.order, backorders: result.backorders ?? [] },
        `${event.url.origin}/api/v1/orders/${result.order!.id}`
    );
};
