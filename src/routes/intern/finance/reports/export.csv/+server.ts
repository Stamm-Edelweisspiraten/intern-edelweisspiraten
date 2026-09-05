import type { RequestHandler } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { agingReport, balanceSheet, profitAndLoss } from "$lib/server/finance/reportService";
import { getActiveFiscalYear, listUnarchivedYearIds } from "$lib/server/finance/yearService";
import { readPeriod } from "$lib/server/finance/period";
import { SPHERE_LABELS } from "$lib/finance/labels";
import { formatEuro } from "$lib/money";
import { formatDate } from "$lib/format";

/**
 * Berichte als CSV.
 *
 * Semikolon als Trenner und eine BOM voran, damit Excel in deutscher
 * Einstellung Spalten und Umlaute korrekt uebernimmt -- dieselbe Konvention
 * wie beim Jahresexport.
 */

const SEPARATOR = ";";

function csvCell(value: string | number | null | undefined): string {
    const text = String(value ?? "");
    if (/[";\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
}

function csvRow(cells: (string | number | null | undefined)[]): string {
    return cells.map(csvCell).join(SEPARATOR);
}

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

    const lines: string[] = [];

    lines.push(csvRow([`Berichte ${formatDate(profit.from)} bis ${formatDate(profit.to)}`]));
    lines.push("");

    lines.push(csvRow(["Gewinn- und Verlustrechnung"]));
    lines.push(csvRow(["Art", "Konto", "Bezeichnung", "Bereich", "Betrag"]));
    for (const row of profit.income) {
        lines.push(
            csvRow(["Ertrag", row.number, row.name, SPHERE_LABELS[row.sphere], euro(row.amount)])
        );
    }
    for (const row of profit.expense) {
        lines.push(
            csvRow(["Aufwand", row.number, row.name, SPHERE_LABELS[row.sphere], euro(row.amount)])
        );
    }
    lines.push("");
    lines.push(csvRow(["Summe Erträge", "", "", "", euro(profit.incomeTotal)]));
    lines.push(csvRow(["Summe Aufwendungen", "", "", "", euro(profit.expenseTotal)]));
    lines.push(csvRow(["Ergebnis", "", "", "", euro(profit.result)]));

    lines.push("");
    lines.push(csvRow(["Ergebnis nach Bereichen"]));
    lines.push(csvRow(["Bereich", "Erträge", "Aufwendungen", "Ergebnis"]));
    for (const row of profit.bySphere) {
        lines.push(
            csvRow([
                SPHERE_LABELS[row.sphere],
                euro(row.income),
                euro(row.expense),
                euro(row.result)
            ])
        );
    }

    lines.push("");
    lines.push(csvRow([`Vermögensübersicht zum ${formatDate(balance.at)}`]));
    lines.push(csvRow(["Seite", "Konto", "Bezeichnung", "Betrag"]));
    for (const row of balance.assets) {
        lines.push(csvRow(["Aktiva", row.number, row.name, euro(row.amount)]));
    }
    for (const row of balance.liabilities) {
        lines.push(csvRow(["Passiva", row.number, row.name, euro(row.amount)]));
    }
    for (const row of balance.equity) {
        lines.push(csvRow(["Eigenkapital", row.number, row.name, euro(row.amount)]));
    }
    lines.push(csvRow(["Ergebnis", "", "", euro(balance.result)]));
    lines.push("");
    lines.push(csvRow(["Summe Aktiva", "", "", euro(balance.assetsTotal)]));
    lines.push(
        csvRow([
            "Summe Passiva",
            "",
            "",
            euro(balance.liabilitiesTotal + balance.equityTotal + balance.result)
        ])
    );

    lines.push("");
    lines.push(csvRow([`Fälligkeitsstaffel zum ${formatDate(aging.at)}`]));
    lines.push(csvRow(["Zeitraum", "Posten", "Betrag"]));
    for (const bucket of aging.buckets) {
        lines.push(csvRow([bucket.label, bucket.count, euro(bucket.amount)]));
    }
    lines.push(csvRow(["Summe", aging.count, euro(aging.total)]));

    const body = `﻿${lines.join("\r\n")}\r\n`;

    return new Response(body, {
        headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="berichte-${period.fromValue}-bis-${period.toValue}.csv"`,
            "Cache-Control": "no-store"
        }
    });
};
