import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/api/handle";
import { notFound } from "$lib/server/api/respond";
import { readDate, resource } from "$lib/server/api/pagination";
import { agingReport, balanceSheet, profitAndLoss } from "$lib/server/finance/reportService";
import { listUnarchivedYearIds } from "$lib/server/finance/yearService";

/**
 * Berichte.
 *
 * /api/v1/reports/profit-and-loss?from=&to=
 * /api/v1/reports/balance-sheet?at=
 * /api/v1/reports/outstanding
 */
export const GET: RequestHandler = async (event) => {
    const denied = requireScope(event, "finance.view");
    if (denied) return denied;

    const now = new Date();
    const from = readDate(event, "from") ?? new Date(now.getFullYear(), 0, 1);
    const to = readDate(event, "to") ?? new Date(now.getFullYear(), 11, 31);

    switch (event.params.report) {
        case "profit-and-loss":
            return resource(await profitAndLoss(from, to));

        case "balance-sheet":
            return resource(await balanceSheet(readDate(event, "at") ?? to, from));

        case "outstanding":
            return resource(await agingReport({ fiscalYearIds: await listUnarchivedYearIds() }));

        default:
            return notFound("Der Bericht");
    }
};
