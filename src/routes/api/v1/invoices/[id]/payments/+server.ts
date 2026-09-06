import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/api/handle";
import { badRequest, created, notFound, parseBody } from "$lib/server/api/respond";
import { collection } from "$lib/server/api/pagination";
import { paymentCreateSchema } from "$lib/server/api/schemas";
import { getInvoice, listPayments, payInvoice } from "$lib/server/finance/invoiceService";
import { syncOrderPayment } from "$lib/server/orders/orderBilling";

/** Zahlungen auf eine Forderung. */

export const GET: RequestHandler = async (event) => {
    const denied = requireScope(event, "finance.view");
    if (denied) return denied;

    const invoice = await getInvoice(event.params.id);
    if (!invoice) return notFound("Die Rechnung");

    return collection(await listPayments(invoice.id));
};

export const POST: RequestHandler = async (event) => {
    const denied = requireScope(event, "finance.manage");
    if (denied) return denied;

    const body = await parseBody(event, paymentCreateSchema);
    if (!body.ok) return body.response!;

    const result = await payInvoice({
        invoiceId: event.params.id,
        ...body.data!,
        user: event.locals.apiToken?.name ?? "api"
    });

    if (!result.ok) return badRequest(result.error ?? "Zahlung fehlgeschlagen.");

    // Gehoert die Rechnung zu einer Bestellung, wird deren Zahlungsstatus
    // nachgefuehrt -- wie in der Oberflaeche.
    if (result.orderId) await syncOrderPayment(result.orderId);

    return created({ data: result.invoice, settled: result.settled });
};
