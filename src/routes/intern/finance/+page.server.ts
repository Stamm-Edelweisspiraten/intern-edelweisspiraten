import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { archiveFiscalYear, getYearSummaries } from "$lib/server/finance/yearService";
import { computeOutstanding } from "$lib/server/finance/invoiceService";
import { fiscalYears } from "$lib/server/db/collections";

/**
 * Übersicht der Kasse.
 *
 * Die Kennzahlen kommen jetzt aus zwei Aggregationen statt aus einer Schleife,
 * die für jedes Jahr das komplette Jahresdokument samt aller Buchungen ein
 * zweites Mal geladen hat.
 */

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "finance.view");

    const summaries = await getYearSummaries();

    // Offene Posten über alle nicht archivierten Jahre.
    const activeIds = await fiscalYears()
        .find({ status: { $ne: "archived" } })
        .project({ _id: 1 })
        .toArray();

    const outstanding = await computeOutstanding({
        fiscalYearIds: activeIds.map((doc) => doc._id)
    });

    return {
        fiscalYears: summaries,
        outstandingTotal: outstanding.reduce((sum, invoice) => sum + invoice.outstanding, 0),
        outstandingCount: outstanding.length,
        overdueCount: outstanding.filter((invoice) => invoice.overdue).length
    };
};

export const actions: Actions = {
    archive: async (event) => {
        requirePermission(event, "finance.manage");

        const form = await event.request.formData();
        const id = String(form.get("id") ?? "");

        if (!id) return fail(400, { error: "Es wurde kein Geschäftsjahr angegeben." });

        const ok = await archiveFiscalYear(id, event.locals.user?.email ?? "system");
        if (!ok) return fail(404, { error: "Geschäftsjahr nicht gefunden." });

        throw redirect(303, "/intern/finance");
    }
};
