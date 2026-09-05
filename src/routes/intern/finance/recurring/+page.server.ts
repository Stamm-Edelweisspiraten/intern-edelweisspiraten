import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import {
    createRecurring,
    deleteRecurring,
    listRecurring,
    runDueSchedules,
    setRecurringActive,
    type RecurringInterval
} from "$lib/server/finance/recurringService";
import { listCategories } from "$lib/server/finance/categoryService";
import { listBankAccounts } from "$lib/server/finance/bankAccountService";
import { getAllMembers } from "$lib/server/memberService";
import { parseEuro } from "$lib/money";
import { fullName } from "$lib/format";

/** Wiederkehrende Buchungen: Daueraufträge, Abos, regelmäßige Abführungen. */

const INTERVALS: RecurringInterval[] = ["monthly", "quarterly", "semiannual", "annual"];

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "finance.manage");

    const [schedules, categories, bankAccounts, members] = await Promise.all([
        listRecurring(),
        listCategories({ activeOnly: true }),
        listBankAccounts({ activeOnly: true }),
        getAllMembers()
    ]);

    return {
        schedules,
        categories,
        bankAccounts: bankAccounts.map((bank) => ({ id: bank.id, name: bank.name })),
        members: members.map((member) => ({ id: member.id, name: fullName(member) }))
    };
};

export const actions: Actions = {
    create: async (event) => {
        requirePermission(event, "finance.manage");

        const form = await event.request.formData();
        const amount = parseEuro(String(form.get("amount") ?? ""));
        const interval = String(form.get("interval") ?? "monthly");
        const startValue = String(form.get("startDate") ?? "");
        const endValue = String(form.get("endDate") ?? "");

        if (amount === null || amount <= 0) {
            return fail(400, { error: "Bitte einen gültigen Betrag größer als 0 angeben." });
        }
        if (!INTERVALS.includes(interval as RecurringInterval)) {
            return fail(400, { error: "Bitte einen gültigen Takt wählen." });
        }

        const startDate = startValue ? new Date(startValue) : new Date();
        if (Number.isNaN(startDate.getTime())) {
            return fail(400, { error: "Bitte ein gültiges Startdatum angeben." });
        }

        const endDate = endValue ? new Date(endValue) : null;
        if (endDate && Number.isNaN(endDate.getTime())) {
            return fail(400, { error: "Bitte ein gültiges Enddatum angeben." });
        }
        if (endDate && endDate < startDate) {
            return fail(400, { error: "Das Enddatum liegt vor dem Startdatum." });
        }

        const result = await createRecurring({
            name: String(form.get("name") ?? ""),
            interval: interval as RecurringInterval,
            amount,
            categoryId: String(form.get("categoryId") ?? ""),
            bankAccountId: String(form.get("bankAccountId") ?? ""),
            memberId: String(form.get("memberId") ?? "") || null,
            note: String(form.get("note") ?? ""),
            startDate,
            endDate,
            user: event.locals.user?.email ?? "system"
        });

        if (!result.ok) return fail(400, { error: result.error });
        return { success: "Die wiederkehrende Buchung wurde angelegt." };
    },

    toggle: async (event) => {
        requirePermission(event, "finance.manage");

        const form = await event.request.formData();
        const ok = await setRecurringActive(
            String(form.get("id") ?? ""),
            String(form.get("active")) === "true"
        );

        if (!ok) return fail(404, { error: "Die Vorlage wurde nicht gefunden." });
        return { success: "Der Status wurde geändert." };
    },

    delete: async (event) => {
        requirePermission(event, "finance.manage");

        const form = await event.request.formData();
        const ok = await deleteRecurring(String(form.get("id") ?? ""));

        if (!ok) return fail(404, { error: "Die Vorlage wurde nicht gefunden." });
        return { success: "Die Vorlage wurde gelöscht." };
    },

    /**
     * Faellige Vorlagen sofort ausfuehren. Sonst laeuft das beim Start und
     * danach stuendlich; hier kann man es anstossen, ohne zu warten.
     */
    run: async (event) => {
        requirePermission(event, "finance.manage");

        const result = await runDueSchedules(event.locals.user?.email ?? "system");

        if (result.errors.length > 0) {
            return fail(400, { error: result.errors.join(" · ") });
        }

        return {
            success:
                result.executed === 0
                    ? "Es war nichts fällig."
                    : `${result.executed} Buchung(en) wurden erzeugt.`
        };
    }
};
