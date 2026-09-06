import type { RequestHandler } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { agingReport, balanceSheet, profitAndLoss } from "$lib/server/finance/reportService";
import { getActiveFiscalYear, listUnarchivedYearIds } from "$lib/server/finance/yearService";
import { readPeriod } from "$lib/server/finance/period";
import { SPHERE_LABELS } from "$lib/finance/labels";
import { csvDocument } from "$lib/server/csv";
import { downloadHeaders } from "$lib/server/http/download";
import { formatEuro } from "$lib/money";
import { formatDate } from "$lib/format";

/**
 * Berichte als CSV.
 *
 * Trenner, Anfuehrungszeichen, BOM und CRLF kommen aus $lib/server/csv --
 * dieselbe Stelle wie beim Jahresexport. Vorher standen die Escaping-Regeln
 * hier und dort wortgleich doppelt; der Schutz vor CSV-Injection war in beiden
 * Kopien nicht enthalten.
 */

type Cell = string | number | null | undefined;

const euro = (cents: number) => formatEuro(cents, { withUnit: false });

export const GET: RequestHandler = async (event) => {
    requirePermission(event, "finance.export");

    const activeYear = await getActiveFiscalYear();
    const period = readPeriod(event.url, activeYear?.year);
    const yearIds = await listUnarchivedYearIds();

    const [profit, balance, aging] = await Promise.all([
        profitAndLoss(period.from, period.to),
        balanceSheet(period.to, period.from),
        agingReport({ fiscalYearIds: yearIds })
    ]);

    const rows: Cell[][] = [];

    rows.push([`Berichte ${formatDate(profit.from)} bis ${formatDate(profit.to)}`]);
    rows.push([]);

    rows.push(["Gewinn- und Verlustrechnung"]);
    rows.push(["Art", "Konto", "Bezeichnung", "Bereich", "Betrag"]);
    for (const row of profit.income) {
        rows.push(["Ertrag", row.number, row.name, SPHERE_LABELS[row.sphere], euro(row.amount)]);
    }
    for (const row of profit.expense) {
        rows.push(["Aufwand", row.number, row.name, SPHERE_LABELS[row.sphere], euro(row.amount)]);
    }
    rows.push([]);
    rows.push(["Summe Erträge", "", "", "", euro(profit.incomeTotal)]);
    rows.push(["Summe Aufwendungen", "", "", "", euro(profit.expenseTotal)]);
    rows.push(["Ergebnis", "", "", "", euro(profit.result)]);

    rows.push([]);
    rows.push(["Ergebnis nach Bereichen"]);
    rows.push(["Bereich", "Erträge", "Aufwendungen", "Ergebnis"]);
    for (const row of profit.bySphere) {
        rows.push([
            SPHERE_LABELS[row.sphere],
            euro(row.income),
            euro(row.expense),
            euro(row.result)
        ]);
    }

    rows.push([]);
    rows.push([`Vermögensübersicht zum ${formatDate(balance.at)}`]);
    rows.push(["Seite", "Konto", "Bezeichnung", "Betrag"]);
    for (const row of balance.assets) {
        rows.push(["Aktiva", row.number, row.name, euro(row.amount)]);
    }
    for (const row of balance.liabilities) {
        rows.push(["Passiva", row.number, row.name, euro(row.amount)]);
    }
    for (const row of balance.equity) {
        rows.push(["Eigenkapital", row.number, row.name, euro(row.amount)]);
    }
    rows.push(["Ergebnis", "", "", euro(balance.result)]);
    rows.push([]);
    rows.push(["Summe Aktiva", "", "", euro(balance.assetsTotal)]);
    rows.push([
        "Summe Passiva",
        "",
        "",
        euro(balance.liabilitiesTotal + balance.equityTotal + balance.result)
    ]);

    rows.push([]);
    rows.push([`Fälligkeitsstaffel zum ${formatDate(aging.at)}`]);
    rows.push(["Zeitraum", "Posten", "Betrag"]);
    for (const bucket of aging.buckets) {
        rows.push([bucket.label, bucket.count, euro(bucket.amount)]);
    }
    rows.push(["Summe", aging.count, euro(aging.total)]);

    return new Response(csvDocument(rows), {
        headers: downloadHeaders({
            contentType: "text/csv; charset=utf-8",
            filename: `berichte-${period.fromValue}-bis-${period.toValue}.csv`,
            forceDownload: true
        })
    });
};
