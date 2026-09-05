import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/api/handle";
import { badRequest, created, parseBody } from "$lib/server/api/respond";
import { paginated, readPagination } from "$lib/server/api/pagination";
import { invoiceCreateSchema } from "$lib/server/api/schemas";
import { computeOutstanding, createInvoice, listInvoices } from "$lib/server/finance/invoiceService";
import { listUnarchivedYearIds } from "$lib/server/finance/yearService";

/** Forderungen. */

export const GET: RequestHandler = async (event) => {
    const denied = requireScope(event, "finance.view");
    if (denied) return denied;

    const fiscalYear = event.url.searchParams.get("fiscal_year");
    const onlyOpen = event.url.searchParams.get("status") === "open";

    const all = onlyOpen
        ? await computeOutstanding(
              fiscalYear
                  ? { fiscalYearId: fiscalYear }
                  : { fiscalYearIds: await listUnarchivedYearIds() }
          )
        : fiscalYear
          ? await listInvoices(fiscalYear)
          : [];

    const pagination = readPagination(event);
    return paginated(
        all.slice(pagination.offset, pagination.offset + pagination.perPage),
        all.length,
        pagination
    );
};

export const POST: RequestHandler = async (event) => {
    const denied = requireScope(event, "finance.manage");
    if (denied) return denied;

    const body = await parseBody(event, invoiceCreateSchema);
    if (!body.ok) return body.response!;

    try {
        const invoice = await createInvoice({
            ...body.data!,
            createdBy: event.locals.apiToken?.name ?? "api"
        });
        return created({ data: invoice }, `${event.url.origin}/api/v1/invoices/${invoice.id}`);
    } catch (err) {
        const message = err instanceof Error ? err.message : "Anlegen fehlgeschlagen.";
        return badRequest(message);
    }
};
