import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/api/handle";
import { badRequest, notFound, parseBody } from "$lib/server/api/respond";
import { resource } from "$lib/server/api/pagination";
import { paymentCreateSchema } from "$lib/server/api/schemas";
import { getBill, payBill } from "$lib/server/finance/billService";

export const GET: RequestHandler = async (event) => {
    const denied = requireScope(event, "finance.view");
    if (denied) return denied;

    const bill = await getBill(event.params.id);
    if (!bill) return notFound("Die Rechnung");

    return resource(bill);
};

/** Zahlung auf eine Eingangsrechnung. */
export const POST: RequestHandler = async (event) => {
    const denied = requireScope(event, "finance.manage");
    if (denied) return denied;

    const body = await parseBody(event, paymentCreateSchema);
    if (!body.ok) return body.response!;

    const result = await payBill({
        billId: event.params.id,
        ...body.data!,
        user: event.locals.apiToken?.name ?? "api"
    });

    if (!result.ok) return badRequest(result.error ?? "Zahlung fehlgeschlagen.");

    return resource(await getBill(event.params.id));
};
