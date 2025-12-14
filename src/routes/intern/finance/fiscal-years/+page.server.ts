import type { Actions, PageServerLoad } from "./$types";
import { archiveFiscalYear } from "$lib/server/financeService";
import { redirect } from "@sveltejs/kit";

export const load: PageServerLoad = async () => {
    throw redirect(308, "/intern/finance");
};

export const actions: Actions = {
    archive: async ({ request }) => {
        const form = await request.formData();
        const id = form.get("id");

        if (typeof id !== "string" || !id) {
            return { error: "Invalid id" };
        }

        await archiveFiscalYear(id);
        throw redirect(303, "/intern/finance");
    }
};
