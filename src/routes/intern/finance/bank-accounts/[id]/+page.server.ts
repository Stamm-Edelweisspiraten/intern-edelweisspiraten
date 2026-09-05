import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { getBankAccount } from "$lib/server/finance/bankAccountService";
import { cashBook } from "$lib/server/finance/reportService";
import { getActiveFiscalYear } from "$lib/server/finance/yearService";
import { readPeriod } from "$lib/server/finance/period";
import {
    confirmMatch,
    ignoreLine,
    importStatement,
    listStatementLines,
    parseCsvStatement,
    reconciliationSummary,
    resetLine
} from "$lib/server/finance/reconciliationService";
import { MAX_FILE_BYTES } from "$lib/server/fileStore";
import { matchesPermission } from "$lib/permissions/match";

/**
 * Ein Kassen- oder Bankkonto: Kassenbericht und Abgleich mit dem
 * Kontoauszug.
 */

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "finance.view");

    const account = await getBankAccount(event.params.id);
    if (!account) throw error(404, "Konto nicht gefunden");

    const activeYear = await getActiveFiscalYear();
    const period = readPeriod(event.url, activeYear?.year);

    const [book, lines, summary] = await Promise.all([
        cashBook(account.id, period.from, period.to),
        listStatementLines(account.id),
        reconciliationSummary(account.id)
    ]);

    /**
     * Der Verlauf fuer die Linie: Anfangsbestand plus jede Bewegung. Der
     * Kassenbericht traegt den laufenden Bestand ohnehin je Zeile -- hier
     * wird er nur ausgeduennt auf das, was das Diagramm braucht.
     */
    const balanceCourse = book
        ? [
              { date: book.from, balance: book.openingBalance },
              ...book.entries.map((entry) => ({
                  date: entry.date,
                  balance: entry.balance
              }))
          ]
        : [];

    return {
        account,
        book,
        lines,
        summary,
        balanceCourse,
        period: { from: period.fromValue, to: period.toValue },
        canManage: matchesPermission(event.locals.permissions, "finance.manage")
    };
};

export const actions: Actions = {
    /** Kontoauszug als CSV einlesen. */
    import: async (event) => {
        requirePermission(event, "finance.manage");

        const form = await event.request.formData();
        const file = form.get("file");

        if (!(file instanceof File) || file.size === 0) {
            return fail(400, { error: "Bitte eine CSV-Datei auswählen." });
        }
        if (file.size > MAX_FILE_BYTES) {
            return fail(400, { error: "Die Datei ist zu groß (höchstens 10 MB)." });
        }

        const text = await file.text();
        const parsed = parseCsvStatement(text);

        if (parsed.lines.length === 0) {
            return fail(400, {
                error: parsed.errors[0] ?? "In der Datei wurden keine Buchungen gefunden."
            });
        }

        const result = await importStatement({
            bankAccountId: event.params.id,
            filename: file.name,
            lines: parsed.lines,
            user: event.locals.user?.email ?? "system"
        });

        if (!result.ok) return fail(400, { error: result.error });

        const parts = [`${result.imported} Zeilen eingelesen`];
        if (result.duplicates > 0) parts.push(`${result.duplicates} bereits vorhanden`);
        if (parsed.errors.length > 0) parts.push(`${parsed.errors.length} Zeilen unleserlich`);

        return { success: `${parts.join(", ")}.` };
    },

    /** Bestätigt eine vorgeschlagene Zuordnung. */
    match: async (event) => {
        requirePermission(event, "finance.manage");

        const form = await event.request.formData();
        const result = await confirmMatch(
            String(form.get("lineId") ?? ""),
            String(form.get("entryId") ?? ""),
            event.locals.user?.email ?? "system"
        );

        if (!result.ok) return fail(400, { error: result.error });
        return { success: "Die Zeile wurde zugeordnet." };
    },

    ignore: async (event) => {
        requirePermission(event, "finance.manage");

        const form = await event.request.formData();
        const ok = await ignoreLine(String(form.get("lineId") ?? ""));
        if (!ok) return fail(400, { error: "Die Zeile wurde nicht gefunden." });

        return { success: "Die Zeile wird nicht weiter berücksichtigt." };
    },

    reset: async (event) => {
        requirePermission(event, "finance.manage");

        const form = await event.request.formData();
        const ok = await resetLine(String(form.get("lineId") ?? ""));
        if (!ok) return fail(400, { error: "Die Zeile wurde nicht gefunden." });

        return { success: "Die Zuordnung wurde aufgehoben." };
    }
};
