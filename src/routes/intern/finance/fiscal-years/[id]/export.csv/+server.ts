import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { getFiscalYear } from "$lib/server/finance/yearService";
import { listTransactions } from "$lib/server/finance/transactionService";
import { listInvoices } from "$lib/server/finance/invoiceService";
import { csvDocument } from "$lib/server/csv";
import { downloadHeaders } from "$lib/server/http/download";
import { formatEuro } from "$lib/money";
import { formatDate } from "$lib/format";

/**
 * CSV-Ausgabe eines Geschäftsjahres.
 *
 * Ersetzt die dauerhaft deaktivierte Schaltfläche "Export (soon)".
 * Trenner, Anfuehrungszeichen, BOM und CRLF kommen aus $lib/server/csv --
 * dieselbe Stelle wie beim Berichtsexport.
 */

type Cell = string | number | null | undefined;

const euro = (cents: number) => formatEuro(cents, { withUnit: false });

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

    const rows: Cell[][] = [];

    rows.push([`Geschäftsjahr ${year.year}`]);
    rows.push([]);

    rows.push(["Buchungen"]);
    rows.push(["Datum", "Beleg", "Richtung", "Art", "Mitglied", "Konto", "Betrag", "Notiz"]);
    for (const transaction of transactions) {
        rows.push([
            formatDate(transaction.date),
            transaction.entryNo,
            transaction.direction === "in" ? "Einnahme" : "Ausgabe",
            transaction.kind,
            transaction.member,
            transaction.bankAccountName,
            euro(transaction.amount),
            transaction.note
        ]);
    }

    const income = transactions
        .filter((t) => t.direction === "in")
        .reduce((sum, t) => sum + t.amount, 0);
    const expense = transactions
        .filter((t) => t.direction === "out")
        .reduce((sum, t) => sum + t.amount, 0);

    rows.push([]);
    rows.push(["Einnahmen", "", "", "", "", "", euro(income)]);
    rows.push(["Ausgaben", "", "", "", "", "", euro(expense)]);
    rows.push(["Saldo", "", "", "", "", "", euro(income - expense)]);

    rows.push([]);
    rows.push(["Rechnungen"]);
    rows.push([
        "Nummer",
        "Datum",
        "Fällig",
        "Art",
        "Mitglied",
        "Betrag",
        "Bezahlt",
        "Offen",
        "Status"
    ]);
    for (const invoice of invoices) {
        rows.push([
            invoice.number,
            formatDate(invoice.date),
            invoice.dueDate ? formatDate(invoice.dueDate) : "",
            invoice.kind,
            invoice.member,
            euro(invoice.amount),
            euro(invoice.paidAmount),
            euro(invoice.outstanding),
            invoice.status
        ]);
    }

    return new Response(csvDocument(rows), {
        headers: downloadHeaders({
            contentType: "text/csv; charset=utf-8",
            filename: `kasse-${year.year}.csv`,
            forceDownload: true
        })
    });
};
