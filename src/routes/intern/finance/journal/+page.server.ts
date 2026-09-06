import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { countEntries, listEntries } from "$lib/server/finance/journalService";
import { createTransaction, reverseTransaction } from "$lib/server/finance/transactionService";
import { getActiveFiscalYear, listFiscalYears } from "$lib/server/finance/yearService";
import { listCategories } from "$lib/server/finance/categoryService";
import { listBankAccounts } from "$lib/server/finance/bankAccountService";
import { getAllMembers } from "$lib/server/memberService";
import { parseEuro } from "$lib/money";
import { fullName } from "$lib/format";
import { matchesPermission } from "$lib/permissions/match";
import type { JournalSource } from "$lib/server/finance/types";

/**
 * Buchungsjournal.
 *
 * Ersetzt die Buchungsliste, die vorher auf der Jahresseite lag. Dort waren
 * weder Filter noch eine Sicht ueber Jahre hinweg moeglich; die Seite lud
 * jede Buchung des Jahres, um fuenfzig davon anzuzeigen.
 */

const PAGE_SIZE = 50;

const SOURCES: JournalSource[] = [
    "manual",
    "invoice",
    "payment",
    "order",
    "recurring",
    "import",
    "opening",
    "closing"
];

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "finance.view");

    const years = await listFiscalYears();
    const activeYear = await getActiveFiscalYear();

    const yearParam = event.url.searchParams.get("year") ?? "";
    const selectedYear = years.find((year) => year.id === yearParam) ?? activeYear ?? years[0];

    const page = Math.max(1, Number(event.url.searchParams.get("page") ?? 1) || 1);
    const accountId = event.url.searchParams.get("account") ?? "";
    const sourceParam = event.url.searchParams.get("source") ?? "";
    const source = SOURCES.includes(sourceParam as JournalSource)
        ? (sourceParam as JournalSource)
        : undefined;

    const filter = {
        fiscalYearId: selectedYear?.id,
        accountId: accountId || undefined,
        source
    };

    const [entries, total, categories, bankAccounts, members] = await Promise.all([
        selectedYear
            ? listEntries({ ...filter, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
            : Promise.resolve([]),
        selectedYear ? countEntries(filter) : Promise.resolve(0),
        listCategories({ activeOnly: true }),
        listBankAccounts({ activeOnly: true }),
        getAllMembers()
    ]);

    return {
        entries,
        total,
        page,
        pageSize: PAGE_SIZE,
        years: years.map((year) => ({ id: year.id, year: year.year, status: year.status })),
        selectedYear,
        filters: { accountId, source: sourceParam },
        categories,
        bankAccounts: bankAccounts.map((bank) => ({ id: bank.id, name: bank.name })),
        members: members.map((member) => ({ id: member.id, name: fullName(member) })),
        canManage: matchesPermission(event.locals.permissions, "finance.manage")
    };
};

export const actions: Actions = {
    /** Einfache Maske: Einnahme oder Ausgabe mit Buchungsart und Konto. */
    add: async (event) => {
        requirePermission(event, "finance.manage");

        const form = await event.request.formData();
        const fiscalYearId = String(form.get("fiscalYearId") ?? "");
        const amount = parseEuro(String(form.get("amount") ?? ""));
        const categoryId = String(form.get("categoryId") ?? "");
        const bankAccountId = String(form.get("bankAccountId") ?? "") || null;
        const memberId = String(form.get("memberId") ?? "") || null;
        const dateValue = String(form.get("date") ?? "");

        if (!fiscalYearId) return fail(400, { error: "Es wurde kein Geschäftsjahr gewählt." });
        if (amount === null || amount <= 0) {
            return fail(400, { error: "Bitte einen gültigen Betrag größer als 0 angeben." });
        }
        if (!categoryId) return fail(400, { error: "Bitte eine Buchungsart auswählen." });

        const date = dateValue ? new Date(dateValue) : new Date();
        if (Number.isNaN(date.getTime())) {
            return fail(400, { error: "Bitte ein gültiges Datum angeben." });
        }

        // Der Anzeigename wird serverseitig aufgeloest; ein Formularwert waere
        // hier frei waehlbar und damit wertlos.
        let member = "";
        if (memberId) {
            const found = (await getAllMembers()).find((entry) => entry.id === memberId);
            member = found ? fullName(found) : "";
        }

        const result = await createTransaction({
            fiscalYearId,
            categoryId,
            bankAccountId,
            memberId,
            member,
            date,
            amount,
            note: String(form.get("note") ?? ""),
            user: event.locals.user?.email ?? "system"
        });

        if (!result.ok) return fail(400, { error: result.error });
        return { success: `Die Buchung wurde unter ${result.entryNo} erfasst.` };
    },

    /**
     * Storno. Geloescht wird nicht mehr: der urspruengliche Beleg bleibt
     * auffindbar, der Gegensatz hebt ihn auf.
     */
    reverse: async (event) => {
        requirePermission(event, "finance.manage");

        const form = await event.request.formData();
        const entryId = String(form.get("entryId") ?? "");
        const reason = String(form.get("reason") ?? "");

        if (!entryId) return fail(400, { error: "Es wurde kein Beleg ausgewählt." });

        const result = await reverseTransaction(
            entryId,
            event.locals.user?.email ?? "system",
            reason
        );

        if (!result.ok) return fail(400, { error: result.error });
        return { success: "Die Buchung wurde storniert." };
    }
};
