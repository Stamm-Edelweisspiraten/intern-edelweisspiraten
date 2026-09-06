import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { getArticle, parseSizes, updateArticle } from "$lib/server/kaemmerer/articleService";
import { parseEuro } from "$lib/money";

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "kaemmerer.articles.manage");

    const article = await getArticle(event.params.id);
    if (!article) throw error(404, "Artikel nicht gefunden");

    return { article };
};

export const actions: Actions = {
    update: async (event) => {
        // Vorher ungeschuetzt: die Absicherung stand nur im load.
        requirePermission(event, "kaemmerer.articles.manage");

        const form = await event.request.formData();
        const name = String(form.get("name") ?? "").trim();
        const price = parseEuro(String(form.get("price") ?? "0"));

        if (!name) return fail(400, { error: "Bitte einen Namen angeben." });
        if (price === null || price < 0) {
            return fail(400, { error: "Bitte einen gültigen Preis angeben." });
        }

        const result = await updateArticle(event.params.id, {
            name,
            description: String(form.get("description") ?? ""),
            price,
            sizes: parseSizes(form.get("sizes")),
            minStock: Number(form.get("minStock") ?? 0),
            orderUrl: String(form.get("orderUrl") ?? ""),
            active: form.get("active") === "on"
        });

        if (!result.ok) return fail(400, { error: result.error });
        return { success: "Der Artikel wurde gespeichert." };
    }
};
