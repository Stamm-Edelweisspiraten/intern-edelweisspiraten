import { error } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import {
    computeOutstanding,
    listPaymentsForInvoices
} from "$lib/server/finance/invoiceService";
import { getFiscalYear } from "$lib/server/finance/yearService";
import { listBankAccounts } from "$lib/server/finance/bankAccountService";
import { handlePayAction, handleReverseAction } from "$lib/server/finance/payAction";
import { matchesPermission } from "$lib/permissions/match";

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

    const [invoices, bankAccounts] = await Promise.all([
        computeOutstanding({ fiscalYearId: year.id }),
        listBankAccounts({ activeOnly: true })
    ]);

    const payments = await listPaymentsForInvoices(invoices.map((invoice) => invoice.id));

    return {
        year,
        invoices,
        payments: Object.fromEntries(payments),
        bankAccounts: bankAccounts.map((bank) => ({ id: bank.id, name: bank.name })),
        total: invoices.reduce((sum, invoice) => sum + invoice.outstanding, 0),
        overdueCount: invoices.filter((invoice) => invoice.overdue).length,
        canManage: matchesPermission(event.locals.permissions, "finance.manage")
    };
};

export const actions: Actions = {
    pay: handlePayAction,
    reverse: handleReverseAction
};
