import type { Actions, PageServerLoad } from "./$types";
import { error, redirect } from "@sveltejs/kit";
import { getArticle, updateArticle } from "$lib/server/kaemmererService";
import { requirePermission } from "$lib/server/permissionGuard";

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "kaemmerer.articles.manage");
    const { id } = event.params;
    const article = id ? await getArticle(id) : null;
    if (!article) throw error(404, "Artikel nicht gefunden");
    return { article };
};

export const actions: Actions = {
    update: async ({ request, params }) => {
        const form = await request.formData();
        const id = params.id ?? "";
        const name = form.get("name")?.toString() ?? "";
        const description = form.get("description")?.toString() ?? "";
        const price = Number(form.get("price") ?? 0);
        const minStock = Number(form.get("minStock") ?? 0);
        const sizes = form.get("sizes")?.toString();
        const active = form.get("active") === "on";

        if (!id || !name) throw error(400, "Ungueltige Daten");

        await updateArticle(id, { name, description, price, minStock, sizes, active });
        throw redirect(303, `/intern/kaemmerer/articles/${id}`);
    }
};
