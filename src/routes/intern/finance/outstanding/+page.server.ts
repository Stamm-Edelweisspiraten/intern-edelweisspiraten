import type { Actions, PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { computeOutstanding } from "$lib/server/finance/invoiceService";
import { fiscalYears } from "$lib/server/db/collections";
import { handlePayAction, handleReverseAction } from "$lib/server/finance/payAction";

/** Offene Posten ueber alle aktiven Geschaeftsjahre. */

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "finance.view");

    const years = await fiscalYears().find({ status: { $ne: "archived" } }).toArray();
    const byId = new Map(years.map((year) => [year._id!.toString(), year.year]));

    const invoices = await computeOutstanding({
        fiscalYearIds: years.map((year) => year._id!)
    });

    return {
        invoices: invoices.map((invoice) => ({
            ...invoice,
            year: byId.get(invoice.fiscalYearId) ?? 0
        })),
        total: invoices.reduce((sum, invoice) => sum + invoice.outstanding, 0),
        overdueTotal: invoices
            .filter((invoice) => invoice.overdue)
            .reduce((sum, invoice) => sum + invoice.outstanding, 0),
        canManage:
            event.locals.permissions.includes("*") ||
            event.locals.permissions.includes("finance.manage") ||
            event.locals.permissions.includes("finance.*")
    };
};

export const actions: Actions = {
    pay: handlePayAction,
    reverse: handleReverseAction
};
