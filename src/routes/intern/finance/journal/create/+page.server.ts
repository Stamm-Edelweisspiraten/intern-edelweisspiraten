import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { postEntry, type JournalLineInput } from "$lib/server/finance/journalService";
import { getActiveFiscalYear, listFiscalYears } from "$lib/server/finance/yearService";
import { listAccounts } from "$lib/server/finance/accountService";
import { getAllMembers } from "$lib/server/memberService";
import { parseEuro } from "$lib/money";
import { fullName } from "$lib/format";

/**
 * Expertenmaske: freier Buchungssatz mit beliebig vielen Zeilen.
 *
 * Fuer alles, was die einfache Maske nicht abbildet -- Umbuchungen zwischen
 * Konten, Ruecklagenbildung, Eroeffnungsbestaende, Sammelbuchungen.
 */

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "finance.manage");

    const years = await listFiscalYears();
    const activeYear = await getActiveFiscalYear();
    const yearParam = event.url.searchParams.get("year") ?? "";
    const selectedYear = years.find((year) => year.id === yearParam) ?? activeYear;

    const [accounts, members] = await Promise.all([
        listAccounts({ activeOnly: true }),
        getAllMembers()
    ]);

    return {
        years: years
            .filter((year) => year.status === "active")
            .map((year) => ({ id: year.id, year: year.year })),
        selectedYear,
        accounts: accounts.map((account) => ({
            id: account.id,
            label: `${account.number} ${account.name}`
        })),
        members: members.map((member) => ({ id: member.id, name: fullName(member) }))
    };
};

export const actions: Actions = {
    default: async (event) => {
        requirePermission(event, "finance.manage");

        const form = await event.request.formData();
        const fiscalYearId = String(form.get("fiscalYearId") ?? "");
        const dateValue = String(form.get("date") ?? "");
        const description = String(form.get("description") ?? "").trim();

        if (!fiscalYearId) return fail(400, { error: "Bitte ein Geschäftsjahr wählen." });
        if (!description) return fail(400, { error: "Bitte einen Buchungstext angeben." });

        const date = dateValue ? new Date(dateValue) : new Date();
        if (Number.isNaN(date.getTime())) {
            return fail(400, { error: "Bitte ein gültiges Datum angeben." });
        }

        /**
         * Die Zeilen kommen als JSON aus dem Formular. Betraege werden hier
         * geparst -- ein im Formular berechneter Cent-Wert waere frei
         * waehlbar und damit wertlos.
         */
        let lines: JournalLineInput[];
        try {
            const raw = JSON.parse(String(form.get("lines") ?? "[]"));
            if (!Array.isArray(raw)) throw new Error("kein Array");

            lines = raw
                .map((entry: Record<string, unknown>) => {
                    const debit = parseEuro(String(entry.debit ?? "")) ?? 0;
                    const credit = parseEuro(String(entry.credit ?? "")) ?? 0;
                    return {
                        accountId: String(entry.accountId ?? ""),
                        debit,
                        credit,
                        memberId: entry.memberId ? String(entry.memberId) : null,
                        note: String(entry.note ?? "")
                    };
                })
                .filter((line) => line.accountId && (line.debit > 0 || line.credit > 0));
        } catch {
            return fail(400, { error: "Die Zeilen konnten nicht gelesen werden." });
        }

        // Anzeigenamen serverseitig aufloesen.
        const members = await getAllMembers();
        const nameById = new Map(members.map((member) => [member.id, fullName(member)]));
        for (const line of lines) {
            if (line.memberId) line.memberName = nameById.get(line.memberId) ?? null;
        }

        const result = await postEntry({
            fiscalYearId,
            date,
            description,
            source: "manual",
            lines,
            user: event.locals.user?.email ?? "system"
        });

        if (!result.ok) return fail(400, { error: result.error });

        throw redirect(303, `/intern/finance/journal/${result.entryId}`);
    }
};
