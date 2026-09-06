import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import {
    correctStock,
    decrementStock,
    incrementStock,
    listArticles
} from "$lib/server/kaemmerer/articleService";

/** Lagerverwaltung. */

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "kaemmerer.storage.manage");
    return { articles: await listArticles(true) };
};

export const actions: Actions = {
    /**
     * Zu- und Abgang. Der Abgang kann den Bestand nicht mehr unter null
     * druecken -- vorher gab es keine Untergrenze, weshalb die Oberflaeche
     * sogar ein eigenes Abzeichen fuer negative Bestaende fuehrte.
     */
    adjust: async (event) => {
        requirePermission(event, "kaemmerer.storage.manage");

        const form = await event.request.formData();
        const id = String(form.get("id") ?? "");
        const delta = Number(form.get("delta") ?? 0);
        const size = String(form.get("size") ?? "") || null;

        if (!id) return fail(400, { error: "Es wurde kein Artikel angegeben." });
        if (!Number.isFinite(delta) || delta === 0) {
            return fail(400, { error: "Bitte eine Menge ungleich 0 angeben." });
        }

        const result = delta > 0
            ? await incrementStock(id, delta, size)
            : await decrementStock(id, Math.abs(delta), size);

        if (!result.ok) return fail(400, { error: result.error });

        return { success: "Der Bestand wurde angepasst." };
    },

    /** Inventurkorrektur auf einen absoluten Wert. */
    correct: async (event) => {
        requirePermission(event, "kaemmerer.storage.manage");

        const form = await event.request.formData();
        const id = String(form.get("id") ?? "");
        const value = Number(form.get("value") ?? 0);
        const size = String(form.get("size") ?? "") || null;

        if (!id) return fail(400, { error: "Es wurde kein Artikel angegeben." });
        if (!Number.isFinite(value) || value < 0) {
            return fail(400, { error: "Bitte einen Bestand von 0 oder mehr angeben." });
        }

        const result = await correctStock(id, value, size);
        if (!result.ok) return fail(400, { error: result.error });

        return { success: "Der Bestand wurde korrigiert." };
    }
};
