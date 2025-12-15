import type { Actions, PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { createArticle, listArticles, updateArticle, adjustStock } from "$lib/server/kaemmererService";
import { fail, redirect } from "@sveltejs/kit";

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "kaemmerer.articles.manage");
    const articles = await listArticles(true);
    return { articles };
};

export const actions: Actions = {
    create: async ({ request }) => {
        const form = await request.formData();
        const name = form.get("name")?.toString() ?? "";
        const description = form.get("description")?.toString() ?? "";
        const price = Number(form.get("price") ?? 0);
        const stock = Number(form.get("stock") ?? 0);
        const minStock = Number(form.get("minStock") ?? 0);
        const sizes = form.get("sizes")?.toString();
        const orderUrl = form.get("orderUrl")?.toString() ?? "";

        if (!name) return fail(400, { error: "Name erforderlich" });

        await createArticle({ name, description, price, stock, minStock, active: true, sizes, orderUrl });
        throw redirect(303, "/intern/kaemmerer/articles");
    },
    toggle: async ({ request }) => {
        const form = await request.formData();
        const id = form.get("id")?.toString() ?? "";
        const active = form.get("active")?.toString() === "true";
        if (!id) return fail(400, { error: "ID fehlt" });
        await updateArticle(id, { active });
        throw redirect(303, "/intern/kaemmerer/articles");
    },
    stock: async ({ request }) => {
        const form = await request.formData();
        const id = form.get("id")?.toString() ?? "";
        const delta = Number(form.get("delta") ?? 0);
        if (!id || Number.isNaN(delta)) return fail(400, { error: "Ungueltige Daten" });
        await adjustStock(id, delta);
        throw redirect(303, "/intern/kaemmerer/articles");
    },
    update: async ({ request }) => {
        const form = await request.formData();
        const id = form.get("id")?.toString() ?? "";
        const name = form.get("name")?.toString() ?? "";
        const description = form.get("description")?.toString() ?? "";
        const price = Number(form.get("price") ?? 0);
        const minStock = Number(form.get("minStock") ?? 0);
        const sizes = form.get("sizes")?.toString();
        const orderUrl = form.get("orderUrl")?.toString() ?? "";
        if (!id || !name) return fail(400, { error: "Ungueltige Daten" });
        await updateArticle(id, { name, description, price, minStock, sizes, orderUrl });
        throw redirect(303, "/intern/kaemmerer/articles");
    }
};
