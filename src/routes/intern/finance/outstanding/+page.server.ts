import type { Actions, PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { agingReport } from "$lib/server/finance/reportService";
import {
    computeOutstanding,
    listPaymentsForInvoices
} from "$lib/server/finance/invoiceService";
import { listFiscalYears } from "$lib/server/finance/yearService";
import { listBankAccounts } from "$lib/server/finance/bankAccountService";
import { handlePayAction, handleReverseAction } from "$lib/server/finance/payAction";
import { matchesPermission } from "$lib/permissions/match";

/** Offene Posten ueber alle aktiven Geschaeftsjahre. */

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "finance.view");

    const allYears = await listFiscalYears();
    const years = allYears.filter((year) => year.status !== "archived");
    const byId = new Map(years.map((year) => [year.id, year.year]));

    const [invoices, bankAccounts, aging] = await Promise.all([
        computeOutstanding({ fiscalYearIds: years.map((year) => year.id) }),
        listBankAccounts({ activeOnly: true }),
        // Dieselbe Staffel wie in den Berichten -- hier neben der Liste der
        // einzelnen Posten, damit sichtbar wird, wie alt die Rueckstaende sind.
        agingReport({ fiscalYearIds: years.map((year) => year.id) })
    ]);

    const payments = await listPaymentsForInvoices(invoices.map((invoice) => invoice.id));

    return {
        invoices: invoices.map((invoice) => ({
            ...invoice,
            year: byId.get(invoice.fiscalYearId) ?? 0
        })),
        bankAccounts: bankAccounts.map((bank) => ({ id: bank.id, name: bank.name })),
        payments: Object.fromEntries(payments),
        aging,
        total: invoices.reduce((sum, invoice) => sum + invoice.outstanding, 0),
        overdueTotal: invoices
            .filter((invoice) => invoice.overdue)
            .reduce((sum, invoice) => sum + invoice.outstanding, 0),
        // Ueber den gemeinsamen Matcher statt ueber Array.includes: eine
        // breitere Rolle wie "finance.*" wurde vorher nicht erkannt, sodass
        // die Schaltflaechen verborgen blieben, obwohl die Aktion durchging.
        canManage: matchesPermission(event.locals.permissions, "finance.manage")
    };
};

export const actions: Actions = {
    pay: handlePayAction,
    reverse: handleReverseAction
};
