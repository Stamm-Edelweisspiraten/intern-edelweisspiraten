import type { Actions, PageServerLoad } from "./$types";
import { archiveFiscalYear, listFiscalYears } from "$lib/server/financeService";
import { redirect } from "@sveltejs/kit";

export const load: PageServerLoad = async () => {
    const fiscalYears = await listFiscalYears();
    return { fiscalYears };
};

export const actions: Actions = {
    archive: async ({ request }) => {
        const form = await request.formData();
        const id = form.get("id");

        if (typeof id !== "string" || !id) {
            return { error: "Invalid id" };
        }

        await archiveFiscalYear(id);
        throw redirect(303, "/intern/finance/fiscal-years");
    }
};
