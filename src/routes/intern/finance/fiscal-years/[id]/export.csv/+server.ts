import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { getFiscalYear } from "$lib/server/finance/yearService";
import { listTransactions } from "$lib/server/finance/transactionService";
import { listInvoices } from "$lib/server/finance/invoiceService";
import { formatEuro } from "$lib/money";
import { formatDate } from "$lib/format";

/**
 * CSV-Ausgabe eines Geschäftsjahres.
 *
 * Ersetzt die dauerhaft deaktivierte Schaltfläche "Export (soon)".
 * Semikolon als Trenner und eine BOM voran, damit Excel in deutscher
 * Einstellung die Spalten und Umlaute korrekt übernimmt.
 */

const SEPARATOR = ";";

function csvCell(value: string | number | null | undefined): string {
    const text = String(value ?? "");
    // Anführungszeichen verdoppeln; alles einbetten, was den Trenner enthält.
    if (/[";\n\r]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

function csvRow(cells: (string | number | null | undefined)[]): string {
    return cells.map(csvCell).join(SEPARATOR);
}

export const GET: RequestHandler = async (event) => {
    // Eigene Berechtigung fuer den Export; sie war bisher deklariert, aber
    // nirgends erzwungen -- der Export hing an finance.view.
    requirePermission(event, "finance.export");

    const year = await getFiscalYear(event.params.id);
    if (!year) throw error(404, "Geschäftsjahr nicht gefunden");

    const [transactions, invoices] = await Promise.all([
        listTransactions({ fiscalYearId: year.id, limit: 10_000 }),
        listInvoices(year.id)
    ]);

    const lines: string[] = [];

    lines.push(csvRow([`Geschäftsjahr ${year.year}`]));
    lines.push("");

    lines.push(csvRow(["Buchungen"]));
    lines.push(csvRow(["Datum", "Beleg", "Richtung", "Art", "Mitglied", "Konto", "Betrag", "Notiz"]));
    for (const transaction of transactions) {
        lines.push(
            csvRow([
                formatDate(transaction.date),
                transaction.entryNo,
                transaction.direction === "in" ? "Einnahme" : "Ausgabe",
                transaction.kind,
                transaction.member,
                transaction.bankAccountName,
                formatEuro(transaction.amount, { withUnit: false }),
                transaction.note
            ])
        );
    }

    const income = transactions
        .filter((t) => t.direction === "in")
        .reduce((sum, t) => sum + t.amount, 0);
    const expense = transactions
        .filter((t) => t.direction === "out")
        .reduce((sum, t) => sum + t.amount, 0);

    lines.push("");
    lines.push(csvRow(["Einnahmen", "", "", "", "", "", formatEuro(income, { withUnit: false })]));
    lines.push(csvRow(["Ausgaben", "", "", "", "", "", formatEuro(expense, { withUnit: false })]));
    lines.push(csvRow(["Saldo", "", "", "", "", "", formatEuro(income - expense, { withUnit: false })]));

    lines.push("");
    lines.push(csvRow(["Rechnungen"]));
    lines.push(
        csvRow(["Nummer", "Datum", "Fällig", "Art", "Mitglied", "Betrag", "Bezahlt", "Offen", "Status"])
    );
    for (const invoice of invoices) {
        lines.push(
            csvRow([
                invoice.number,
                formatDate(invoice.date),
                invoice.dueDate ? formatDate(invoice.dueDate) : "",
                invoice.kind,
                invoice.member,
                formatEuro(invoice.amount, { withUnit: false }),
                formatEuro(invoice.paidAmount, { withUnit: false }),
                formatEuro(invoice.outstanding, { withUnit: false }),
                invoice.status
            ])
        );
    }

    // BOM voranstellen, sonst zeigt Excel Umlaute falsch an.
    const body = `﻿${lines.join("\r\n")}\r\n`;

    return new Response(body, {
        headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="kasse-${year.year}.csv"`,
            "Cache-Control": "no-store"
        }
    });
};
