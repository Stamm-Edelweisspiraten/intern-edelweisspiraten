import type { Actions, PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { createOrder, listArticles } from "$lib/server/kaemmererService";
import { getAllMembers } from "$lib/server/memberService";
import { fail, redirect } from "@sveltejs/kit";

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "kaemmerer.order.create");

    const articles = await listArticles(true);
    const members = (await getAllMembers()).map((m) => ({
        id: m.id ?? m._id?.toString?.() ?? "",
        name: `${m.firstname ?? ""} ${m.lastname ?? ""}`.trim() || "Unbekannt",
        stand: m.stand
    }));

    return { articles, members };
};

export const actions: Actions = {
    default: async ({ request, locals }) => {
        const form = await request.formData();

        const itemsRaw = form.get("items")?.toString() ?? "[]";
        const memberIds = form.getAll("memberIds").map((v) => v.toString()).filter(Boolean);
        const memberNamesRaw = form.get("memberNames")?.toString() ?? "[]";

        let items: { articleId?: string; name: string; price: number; quantity: number; size?: string }[] = [];
        let memberNames: string[] = [];

        try {
            items = JSON.parse(itemsRaw);
        } catch (err) {
            return fail(400, { error: "Ungueltige Artikelliste" });
        }

        try {
            memberNames = JSON.parse(memberNamesRaw);
        } catch (err) {
            memberNames = [];
        }

        if (!items || items.length === 0) {
            return fail(400, { error: "Bitte mindestens einen Artikel hinzufuegen." });
        }

        if (!memberIds || memberIds.length === 0) {
            return fail(400, { error: "Bitte mindestens ein Mitglied zuweisen." });
        }

        const createdBy = locals.user?.sub ?? locals.user?.userinfo?.email ?? "unbekannt";
        const createdByName = locals.user?.userinfo?.name ?? locals.user?.userinfo?.email ?? "Unbekannt";

        const order = await createOrder({
            items,
            memberIds,
            memberNames,
            createdBy,
            createdByName
        });

        if (!order) return fail(500, { error: "Bestellung konnte nicht angelegt werden." });

        throw redirect(303, "/intern/kaemmerer/orders");
    }
};
