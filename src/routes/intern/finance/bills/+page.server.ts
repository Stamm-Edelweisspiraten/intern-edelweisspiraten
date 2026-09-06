import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { cancelBill, createBill, listBills, outstandingBills, payBill } from "$lib/server/finance/billService";
import { getActiveFiscalYear, listFiscalYears } from "$lib/server/finance/yearService";
import { listCategories } from "$lib/server/finance/categoryService";
import { listBankAccounts } from "$lib/server/finance/bankAccountService";
import { parseEuro } from "$lib/money";
import { matchesPermission } from "$lib/permissions/match";

/** Eingangsrechnungen: offene Verbindlichkeiten des Vereins. */

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "finance.view");

    const years = await listFiscalYears();
    const activeYear = await getActiveFiscalYear();
    const yearParam = event.url.searchParams.get("year") ?? "";
    const selectedYear = years.find((year) => year.id === yearParam) ?? activeYear ?? years[0];

    const [bills, outstanding, categories, bankAccounts] = await Promise.all([
        listBills(selectedYear?.id),
        outstandingBills(selectedYear?.id),
        listCategories({ activeOnly: true, direction: "out" }),
        listBankAccounts({ activeOnly: true })
    ]);

    return {
        bills,
        outstanding,
        years: years.map((year) => ({ id: year.id, year: year.year, status: year.status })),
        selectedYear,
        categories: categories.map((category) => ({ id: category.id, name: category.name })),
        bankAccounts: bankAccounts.map((bank) => ({ id: bank.id, name: bank.name })),
        canManage: matchesPermission(event.locals.permissions, "finance.manage")
    };
};

export const actions: Actions = {
    create: async (event) => {
        requirePermission(event, "finance.manage");

        const form = await event.request.formData();
        const amount = parseEuro(String(form.get("amount") ?? ""));
        const dateValue = String(form.get("date") ?? "");
        const dueValue = String(form.get("dueDate") ?? "");

        if (amount === null || amount <= 0) {
            return fail(400, { error: "Bitte einen gültigen Betrag größer als 0 angeben." });
        }

        const date = dateValue ? new Date(dateValue) : new Date();
        if (Number.isNaN(date.getTime())) {
            return fail(400, { error: "Bitte ein gültiges Rechnungsdatum angeben." });
        }

        const dueDate = dueValue ? new Date(dueValue) : null;
        if (dueDate && Number.isNaN(dueDate.getTime())) {
            return fail(400, { error: "Bitte ein gültiges Fälligkeitsdatum angeben." });
        }

        const result = await createBill({
            fiscalYearId: String(form.get("fiscalYearId") ?? ""),
            vendor: String(form.get("vendor") ?? ""),
            categoryId: String(form.get("categoryId") ?? ""),
            amount,
            date,
            dueDate,
            note: String(form.get("note") ?? ""),
            createdBy: event.locals.user?.email ?? "system"
        });

        if (!result.ok) return fail(400, { error: result.error });
        return { success: "Die Eingangsrechnung wurde erfasst." };
    },

    pay: async (event) => {
        requirePermission(event, "finance.manage");

        const form = await event.request.formData();
        const amount = parseEuro(String(form.get("amount") ?? ""));
        const dateValue = String(form.get("date") ?? "");

        if (amount === null || amount <= 0) {
            return fail(400, { error: "Bitte einen gültigen Betrag größer als 0 angeben." });
        }

        const date = dateValue ? new Date(dateValue) : new Date();
        if (Number.isNaN(date.getTime())) {
            return fail(400, { error: "Bitte ein gültiges Datum angeben." });
        }

        const result = await payBill({
            billId: String(form.get("billId") ?? ""),
            amount,
            date,
            bankAccountId: String(form.get("bankAccountId") ?? "") || null,
            note: String(form.get("note") ?? ""),
            user: event.locals.user?.email ?? "system"
        });

        if (!result.ok) return fail(400, { error: result.error });

        return {
            success: result.settled
                ? "Die Rechnung ist vollständig bezahlt."
                : "Die Teilzahlung wurde verbucht."
        };
    },

    cancel: async (event) => {
        requirePermission(event, "finance.manage");

        const form = await event.request.formData();
        const result = await cancelBill(
            String(form.get("billId") ?? ""),
            String(form.get("reason") ?? ""),
            event.locals.user?.email ?? "system"
        );

        if (!result.ok) return fail(400, { error: result.error });
        return { success: "Die Rechnung wurde storniert." };
    }
};
