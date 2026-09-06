import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { closeFiscalYear, getFiscalYear, updateDues } from "$lib/server/finance/yearService";
import { computeOutstanding } from "$lib/server/finance/invoiceService";
import { listTransactions, sumByDirection } from "$lib/server/finance/transactionService";
import { listFinanceLogs } from "$lib/server/finance/journalService";
import { previewDuesSeeding, seedYearlyDues } from "$lib/server/finance/duesSeeding";
import { getOrdersForFiscalYear } from "$lib/server/orders/orderBilling";
import { parseEuro } from "$lib/money";
import { formatDateTime } from "$lib/format";
import { matchesPermission } from "$lib/permissions/match";

/**
 * Jahresansicht der Kasse.
 *
 * Die Buchungsliste ist hier nur noch ein Auszug der letzten Vorgaenge; das
 * vollstaendige Journal samt Filter und Erfassung liegt unter
 * /intern/finance/journal. Diese Seite traegt Kennzahlen, Beitragssaetze,
 * Bestellungen und den Jahresabschluss.
 */

const RECENT_LIMIT = 15;

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "finance.view");

    const year = await getFiscalYear(event.params.id);
    if (!year) throw error(404, "Geschäftsjahr nicht gefunden");

    const [transactions, totals, outstanding, orders, logs, seedPreview] = await Promise.all([
        listTransactions({ fiscalYearId: year.id, limit: RECENT_LIMIT }),
        sumByDirection(year.id),
        computeOutstanding({ fiscalYearId: year.id }),
        getOrdersForFiscalYear(year.id),
        listFinanceLogs(year.id, 10),
        previewDuesSeeding(year.id)
    ]);

    return {
        year,
        transactions,
        income: totals.income,
        expense: totals.expense,
        balance: totals.income - totals.expense,
        outstandingTotal: outstanding.reduce((sum, invoice) => sum + invoice.outstanding, 0),
        outstandingCount: outstanding.length,
        // Ueber den gemeinsamen Matcher statt ueber Array.includes -- eine
        // breitere Rolle wie "finance.*" blieb sonst unerkannt.
        canManage: matchesPermission(event.locals.permissions, "finance.manage"),
        canClose: matchesPermission(event.locals.permissions, "finance.close"),
        canExport: matchesPermission(event.locals.permissions, "finance.export"),
        seedPreview: seedPreview
            ? { newCount: seedPreview.newCount, newTotal: seedPreview.newTotal }
            : null,
        memberOrders: orders.map((order) => ({
            id: order.id,
            number: order.number,
            total: order.total,
            status: order.status,
            paymentStatus: order.paymentStatus,
            createdAt: order.createdAt.toISOString()
        })),
        activity: logs.map((log) => ({
            id: log.id,
            entity: log.entity,
            action: log.action,
            user: log.user,
            at: formatDateTime(log.createdAt)
        }))
    };
};

export const actions: Actions = {
    /**
     * Beiträge anlegen -- ausdrücklich statt als Nebenwirkung eines
     * Seitenaufrufs.
     */
    seedDues: async (event) => {
        requirePermission(event, "finance.manage");

        const result = await seedYearlyDues(event.params.id, event.locals.user?.email ?? "system");
        if (!result.ok) return fail(400, { error: result.error });

        return {
            success:
                result.created === 0
                    ? "Es waren bereits alle Jahresbeiträge angelegt."
                    : `${result.created} Jahresbeiträge wurden angelegt.`
        };
    },

    updateDues: async (event) => {
        requirePermission(event, "finance.manage");

        const form = await event.request.formData();
        const dues = { stamm: 0, gau: 0, landesmark: 0, bund: 0 };

        for (const field of ["stamm", "gau", "landesmark", "bund"] as const) {
            const value = parseEuro(String(form.get(`dues_${field}`) ?? "0"));
            if (value === null || value < 0) {
                return fail(400, { error: `Der Beitrag „${field}“ ist kein gültiger Betrag.` });
            }
            dues[field] = value;
        }

        const result = await updateDues(event.params.id, dues, event.locals.user?.email ?? "system");
        if (!result.ok) return fail(400, { error: result.error });

        return { success: "Die Beitragssätze wurden gespeichert." };
    },

    close: async (event) => {
        // Der Jahresabschluss hat eine eigene Berechtigung; sie war bisher
        // deklariert, aber an keiner Stelle erzwungen.
        requirePermission(event, "finance.close");

        const form = await event.request.formData();
        const carryOver = form.get("carryOver") === "1";

        const result = await closeFiscalYear(event.params.id, {
            user: event.locals.user?.email ?? "system",
            carryOverOpenInvoices: carryOver
        });

        if (!result.ok) return fail(400, { error: result.error });

        return {
            success:
                result.carriedOver && result.carriedOver > 0
                    ? `Das Geschäftsjahr wurde abgeschlossen. ${result.carriedOver} offene Posten wurden übertragen.`
                    : "Das Geschäftsjahr wurde abgeschlossen."
        };
    }
};
