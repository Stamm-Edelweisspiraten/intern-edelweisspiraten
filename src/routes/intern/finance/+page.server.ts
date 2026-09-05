import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import {
    archiveFiscalYear,
    getYearSummaries,
    listUnarchivedYearIds
} from "$lib/server/finance/yearService";
import { computeOutstanding } from "$lib/server/finance/invoiceService";
import { bankBalances, monthlyOverview } from "$lib/server/finance/reportService";
import { matchesPermission } from "$lib/permissions/match";

/**
 * Übersicht der Kasse.
 *
 * Die Kennzahlen kommen jetzt aus zwei Aggregationen statt aus einer Schleife,
 * die für jedes Jahr das komplette Jahresdokument samt aller Buchungen ein
 * zweites Mal geladen hat.
 */

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "finance.view");

    const [summaries, activeIds, banks] = await Promise.all([
        getYearSummaries(),
        listUnarchivedYearIds(),
        bankBalances()
    ]);

    /**
     * Die Monatsuebersicht des laufenden Jahres -- Grundlage des
     * Balkendiagramms auf der Uebersicht. Ohne aktives Geschaeftsjahr das
     * Kalenderjahr, damit die Karte nicht leer bleibt.
     */
    const activeYear = summaries.find((entry) => entry.status === "active");
    const monthly = await monthlyOverview(activeYear?.year ?? new Date().getFullYear());

    // Offene Posten über alle nicht archivierten Jahre.
    const outstanding = await computeOutstanding({ fiscalYearIds: activeIds });

    return {
        fiscalYears: summaries,
        bankAccounts: banks,
        outstandingTotal: outstanding.reduce((sum, invoice) => sum + invoice.outstanding, 0),
        outstandingCount: outstanding.length,
        overdueCount: outstanding.filter((invoice) => invoice.overdue).length,
        monthly,
        canManage: matchesPermission(event.locals.permissions, "finance.manage")
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
