import { error } from "@sveltejs/kit";
import { ObjectId } from "mongodb";
import type { Actions, PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { computeOutstanding } from "$lib/server/finance/invoiceService";
import { getFiscalYear } from "$lib/server/finance/yearService";
import { handlePayAction, handleReverseAction } from "$lib/server/finance/payAction";

/**
 * Offene Posten eines Geschaeftsjahres.
 *
 * Der load legt hier KEINE Rechnungen mehr an. Vorher lief bei jedem
 * Seitenaufruf ein Schreibvorgang pro Mitglied, was bei parallelen Aufrufen
 * Dubletten erzeugte. Das Anlegen ist jetzt eine ausdrueckliche Aktion auf
 * der Jahresseite.
 */

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "finance.view");

    const year = await getFiscalYear(event.params.id);
    if (!year) throw error(404, "Geschäftsjahr nicht gefunden");

    const invoices = await computeOutstanding({ fiscalYearId: new ObjectId(year.id) });

    return {
        year,
        invoices,
        total: invoices.reduce((sum, invoice) => sum + invoice.outstanding, 0),
        overdueCount: invoices.filter((invoice) => invoice.overdue).length,
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
