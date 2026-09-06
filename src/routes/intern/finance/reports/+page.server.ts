import type { PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import {
    agingReport,
    balanceSheet,
    monthlyOverview,
    profitAndLoss,
    topExpenses,
    trialBalance
} from "$lib/server/finance/reportService";
import { getActiveFiscalYear, listUnarchivedYearIds } from "$lib/server/finance/yearService";
import { readPeriod } from "$lib/server/finance/period";
import { calendarYear } from "$lib/server/db/dates";
import { matchesPermission } from "$lib/permissions/match";

/**
 * Berichte der Kasse.
 *
 * Alle Auswertungen lesen dieselben Buchungszeilen -- es gibt keine zweite
 * Wahrheit, die von der Jahresansicht abweichen koennte. GuV und Bilanz
 * beziehen sich auf denselben Zeitraum, damit sich das Ergebnis der GuV in
 * der Bilanz wiederfindet.
 *
 * Neu dazugekommen sind die Summen- und Saldenliste (die Standarduebersicht
 * einer Buchhaltung, die bisher fehlte) und die Monatsuebersicht -- Letztere
 * zugleich die Grundlage des Balkendiagramms.
 */

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "finance.view");

    const activeYear = await getActiveFiscalYear();
    const period = readPeriod(event.url, activeYear?.year);
    const yearIds = await listUnarchivedYearIds();

    /**
     * Die Monatsuebersicht braucht ein Jahr, keinen Zeitraum. Genommen wird
     * das Jahr des Zeitraumendes -- bei einem Zeitraum ueber den
     * Jahreswechsel ist das die naheliegende Wahl.
     */
    const year = calendarYear(period.to);

    const [profit, balance, aging, trial, monthly, expenses] = await Promise.all([
        profitAndLoss(period.from, period.to),
        balanceSheet(period.to, period.from),
        agingReport({ fiscalYearIds: yearIds }),
        trialBalance(period.from, period.to),
        monthlyOverview(year),
        topExpenses(period.from, period.to, 10)
    ]);

    return {
        profit,
        balance,
        aging,
        trial,
        monthly,
        topExpenses: expenses,
        period: { from: period.fromValue, to: period.toValue },
        year: activeYear,
        canExport: matchesPermission(event.locals.permissions, "finance.export")
    };
};
