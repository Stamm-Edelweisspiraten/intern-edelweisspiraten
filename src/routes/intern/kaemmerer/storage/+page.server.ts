import type { Actions, PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { adjustStock, listArticles } from "$lib/server/kaemmererService";
import { fail, redirect } from "@sveltejs/kit";

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "kaemmerer.storage.manage");
    const articles = await listArticles(true);
    return { articles };
};

export const actions: Actions = {
    adjust: async ({ request }) => {
        const form = await request.formData();
        const id = form.get("id")?.toString() ?? "";
        const delta = Number(form.get("delta") ?? 0);
        const size = form.get("size")?.toString() || undefined;
        if (!id || Number.isNaN(delta)) return fail(400, { error: "Ungueltige Daten" });
        await adjustStock(id, delta, size);
        throw redirect(303, "/intern/kaemmerer/storage");
    }
};
