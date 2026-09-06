import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/api/handle";
import { notFound } from "$lib/server/api/respond";
import { resource } from "$lib/server/api/pagination";
import { getInvoice, listPayments } from "$lib/server/finance/invoiceService";

export const GET: RequestHandler = async (event) => {
    const denied = requireScope(event, "finance.view");
    if (denied) return denied;

    const invoice = await getInvoice(event.params.id);
    if (!invoice) return notFound("Die Rechnung");

    return resource({ ...invoice, payments: await listPayments(invoice.id) });
};
