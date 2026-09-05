import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/api/handle";
import { badRequest, created, parseBody } from "$lib/server/api/respond";
import { collection } from "$lib/server/api/pagination";
import { fiscalYearCreateSchema } from "$lib/server/api/schemas";
import { createFiscalYear, getYearSummaries } from "$lib/server/finance/yearService";

export const GET: RequestHandler = async (event) => {
    const denied = requireScope(event, "finance.view");
    if (denied) return denied;
    return collection(await getYearSummaries());
};

export const POST: RequestHandler = async (event) => {
    const denied = requireScope(event, "finance.manage");
    if (denied) return denied;

    const body = await parseBody(event, fiscalYearCreateSchema);
    if (!body.ok) return body.response!;

    const result = await createFiscalYear({
        ...body.data!,
        createdBy: event.locals.apiToken?.name ?? "api"
    });

    if (!result.ok) return badRequest(result.error ?? "Anlegen fehlgeschlagen.");

    return created({ data: result.year }, `${event.url.origin}/api/v1/fiscal-years/${result.year!.id}`);
};
