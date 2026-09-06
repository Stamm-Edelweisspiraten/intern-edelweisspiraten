import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/api/handle";
import { badRequest, created, parseBody } from "$lib/server/api/respond";
import { collection } from "$lib/server/api/pagination";
import { billCreateSchema } from "$lib/server/api/schemas";
import { createBill, getBill, listBills } from "$lib/server/finance/billService";

/** Eingangsrechnungen. */

export const GET: RequestHandler = async (event) => {
    const denied = requireScope(event, "finance.view");
    if (denied) return denied;

    return collection(await listBills(event.url.searchParams.get("fiscal_year") ?? undefined));
};

export const POST: RequestHandler = async (event) => {
    const denied = requireScope(event, "finance.manage");
    if (denied) return denied;

    const body = await parseBody(event, billCreateSchema);
    if (!body.ok) return body.response!;

    const result = await createBill({
        ...body.data!,
        createdBy: event.locals.apiToken?.name ?? "api"
    });

    if (!result.ok) return badRequest(result.error ?? "Anlegen fehlgeschlagen.");

    return created({ data: await getBill(result.id!) }, `${event.url.origin}/api/v1/bills/${result.id}`);
};
