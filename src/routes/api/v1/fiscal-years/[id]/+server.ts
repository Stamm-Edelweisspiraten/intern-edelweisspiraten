import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/api/handle";
import { notFound } from "$lib/server/api/respond";
import { resource } from "$lib/server/api/pagination";
import { getFiscalYear, getYearSummary } from "$lib/server/finance/yearService";

export const GET: RequestHandler = async (event) => {
    const denied = requireScope(event, "finance.view");
    if (denied) return denied;

    const year = await getFiscalYear(event.params.id);
    if (!year) return notFound("Das Geschäftsjahr");

    const summary = await getYearSummary(year.id);
    return resource({ ...year, summary });
};
