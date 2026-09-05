import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { createFiscalYear } from "$lib/server/finance/yearService";
import { getFinanceSettings } from "$lib/server/settingsService";
import { parseEuro } from "$lib/money";

/**
 * Neues Geschaeftsjahr anlegen.
 *
 * Vorher war WEDER der load NOCH die Aktion abgesichert: jeder angemeldete
 * Benutzer konnte Geschaeftsjahre anlegen und die Beitragssaetze festlegen.
 */

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "finance.manage");

    const settings = await getFinanceSettings();
    return {
        defaultDues: settings.contributions,
        currentYear: new Date().getFullYear()
    };
};

export const actions: Actions = {
    create: async (event) => {
        requirePermission(event, "finance.manage");

        const form = await event.request.formData();
        const year = Number(form.get("year"));

        const fields = ["stamm", "gau", "landesmark", "bund"] as const;
        const dues = { stamm: 0, gau: 0, landesmark: 0, bund: 0 };

        for (const field of fields) {
            const value = parseEuro(String(form.get(`dues_${field}`) ?? "0"));
            if (value === null || value < 0) {
                return fail(400, { error: `Der Beitrag "${field}" ist kein gültiger Betrag.` });
            }
            dues[field] = value;
        }

        const thisYear = new Date().getFullYear();
        if (!Number.isInteger(year) || year < 2000 || year > thisYear + 5) {
            return fail(400, {
                error: `Bitte ein Jahr zwischen 2000 und ${thisYear + 5} angeben.`
            });
        }

        const result = await createFiscalYear({
            year,
            dues,
            createdBy: event.locals.user?.email ?? "system"
        });

        if (!result.ok || !result.year) {
            return fail(400, { error: result.error });
        }

        throw redirect(303, `/intern/finance/fiscal-years/${result.year.id}`);
    }
};
