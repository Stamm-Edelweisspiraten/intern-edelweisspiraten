import type { Actions, PageServerLoad } from "./$types";
import { createFiscalYear } from "$lib/server/financeService";
import { getFinanceSettings } from "$lib/server/settingsService";
import { fail, redirect } from "@sveltejs/kit";

export const load: PageServerLoad = async () => {
    const settings = await getFinanceSettings();
    return {
        defaultDues: settings.contributions,
        currentYear: new Date().getFullYear()
    };
};

export const actions: Actions = {
    create: async ({ request }) => {
        const form = await request.formData();

        const year = Number(form.get("year"));
        const dues = {
            stamm: Number(form.get("dues_stamm") ?? 0),
            gau: Number(form.get("dues_gau") ?? 0),
            landesmark: Number(form.get("dues_landesmark") ?? 0),
            bund: Number(form.get("dues_bund") ?? 0)
        };

        if (!Number.isInteger(year) || year < 2000) {
            return fail(400, { error: "Year is required and must be >= 2000" });
        }

        if (Object.values(dues).some((v) => Number.isNaN(v) || v < 0)) {
            return fail(400, { error: "All dues must be valid non-negative numbers" });
        }

        const created = await createFiscalYear({ year, dues });

        throw redirect(303, `/intern/finance/fiscal-years/${created.id}`);
    }
};
