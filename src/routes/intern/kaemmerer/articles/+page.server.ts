import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import {
    createArticle,
    listArticles,
    parseSizes,
    setArticleActive,
    updateArticle
} from "$lib/server/kaemmerer/articleService";
import { parseEuro } from "$lib/money";

/**
 * Artikelverwaltung.
 *
 * Saemtliche Aktionen waren vorher ungeschuetzt -- SvelteKit fuehrt bei
 * Actions kein load aus, die Absicherung dort schuetzte sie also nicht.
 */

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "kaemmerer.articles.manage");
    return { articles: await listArticles(true) };
};

export const actions: Actions = {
    create: async (event) => {
        requirePermission(event, "kaemmerer.articles.manage");

        const form = await event.request.formData();
        const name = String(form.get("name") ?? "").trim();
        const price = parseEuro(String(form.get("price") ?? "0"));

        if (!name) return fail(400, { error: "Bitte einen Namen angeben." });
        if (price === null || price < 0) {
            return fail(400, { error: "Bitte einen gültigen Preis angeben." });
        }

        const sizes = parseSizes(form.get("sizes"));

        await createArticle({
            name,
            description: String(form.get("description") ?? ""),
            price,
            sizes,
            stock: Number(form.get("stock") ?? 0),
            minStock: Number(form.get("minStock") ?? 0),
            orderUrl: String(form.get("orderUrl") ?? ""),
            active: true
        });

        return { success: "Der Artikel wurde angelegt." };
    },

    toggle: async (event) => {
        requirePermission(event, "kaemmerer.articles.manage");

        const form = await event.request.formData();
        const id = String(form.get("id") ?? "");
        const active = String(form.get("active")) === "true";

        if (!id) return fail(400, { error: "Es wurde kein Artikel angegeben." });

        await setArticleActive(id, active);
        return { success: active ? "Der Artikel ist wieder bestellbar." : "Der Artikel wurde deaktiviert." };
    },

    update: async (event) => {
        requirePermission(event, "kaemmerer.articles.manage");

        const form = await event.request.formData();
        const id = String(form.get("id") ?? "");
        const price = parseEuro(String(form.get("price") ?? "0"));

        if (!id) return fail(400, { error: "Es wurde kein Artikel angegeben." });
        if (price === null || price < 0) {
            return fail(400, { error: "Bitte einen gültigen Preis angeben." });
        }

        const result = await updateArticle(id, {
            name: String(form.get("name") ?? "").trim(),
            description: String(form.get("description") ?? ""),
            price,
            sizes: parseSizes(form.get("sizes")),
            minStock: Number(form.get("minStock") ?? 0),
            orderUrl: String(form.get("orderUrl") ?? "")
        });

        if (!result.ok) return fail(400, { error: result.error });
        return { success: "Der Artikel wurde gespeichert." };
    }
};
