import { fail, redirect, type RequestEvent } from "@sveltejs/kit";
import { ObjectId } from "mongodb";
import { requirePermission } from "$lib/server/permissionGuard";
import { getAllMembers, getMembersByIds } from "$lib/server/memberService";
import { listArticles } from "./articleService";
import { createOrder, type OrderLineInput } from "./orderService";
import { fullName } from "$lib/format";

/**
 * Gemeinsame Grundlage für BEIDE Bestellformulare.
 *
 * /intern/kaemmerer/order       = Selbstbedienung (eigene Mitglieder)
 * /intern/kaemmerer/orders      = Verwaltung (alle Mitglieder)
 *
 * Beide Seiten bleiben erhalten, ihre bisher zu rund 95 Prozent identischen
 * Formulare und Aktionen teilen sich aber jetzt diesen Code -- vorher waren
 * es zwei Dateien mit je gut 215 Zeilen, die sich nur im Weiterleitungsziel
 * unterschieden.
 */

export type OrderScope = "self" | "admin";

export interface OrderFormData {
    articles: Awaited<ReturnType<typeof listArticles>>;
    members: { id: string; name: string; stand?: string }[];
    scope: OrderScope;
}

export async function loadOrderForm(
    event: RequestEvent,
    scope: OrderScope
): Promise<OrderFormData> {
    requirePermission(event, "kaemmerer.order.create");

    const articles = await listArticles(false);

    if (scope === "admin") {
        requirePermission(event, "kaemmerer.orders.view");

        const all = await getAllMembers();
        return {
            articles,
            scope,
            members: all.map((member: Record<string, unknown>) => ({
                id: String(member._id),
                name: fullName(member as { firstname?: string; lastname?: string }),
                stand: String(member.stand ?? "")
            }))
        };
    }

    // Selbstbedienung: ausschließlich die eigenen verknüpften Mitglieder.
    const memberIds = event.locals.user?.memberIds ?? [];
    const own = memberIds.length > 0 ? await getMembersByIds(memberIds) : [];

    return {
        articles,
        scope,
        members: own.map((member: Record<string, unknown>) => ({
            id: String(member._id),
            name: fullName(member as { firstname?: string; lastname?: string })
        }))
    };
}

/**
 * Verarbeitet das Formular. Der Geltungsbereich wird SERVERSEITIG
 * durchgesetzt -- vorher schränkte die Selbstbedienungsseite nur die
 * Auswahlliste ein, die Aktion selbst akzeptierte jede Mitglieds-Kennung.
 */
export async function handleOrderSubmit(
    event: RequestEvent,
    scope: OrderScope,
    redirectTo: string
) {
    requirePermission(event, "kaemmerer.order.create");
    if (scope === "admin") requirePermission(event, "kaemmerer.orders.view");

    const form = await event.request.formData();

    let lines: OrderLineInput[];
    try {
        const raw = JSON.parse(String(form.get("items") ?? "[]"));
        if (!Array.isArray(raw)) throw new Error("kein Array");

        // Bewusst NUR articleId, size und quantity übernehmen. Ein im
        // Formular mitgeschickter Preis wird ignoriert und serverseitig aus
        // dem Artikel aufgelöst.
        lines = raw.map((entry: Record<string, unknown>) => ({
            articleId: String(entry.articleId ?? ""),
            size: entry.size ? String(entry.size) : null,
            quantity: Number(entry.quantity) || 0
        }));
    } catch {
        return fail(400, { error: "Die Positionen konnten nicht gelesen werden." });
    }

    const memberIds = form
        .getAll("memberIds")
        .map(String)
        .filter((id) => ObjectId.isValid(id));

    if (memberIds.length === 0) {
        return fail(400, { error: "Bitte mindestens ein Mitglied auswählen." });
    }

    if (scope === "self") {
        const allowed = new Set(event.locals.user?.memberIds ?? []);
        if (!memberIds.every((id) => allowed.has(id))) {
            return fail(403, {
                error: "Es können nur Bestellungen für die eigenen Mitglieder angelegt werden."
            });
        }
    }

    const result = await createOrder({
        lines,
        memberIds,
        createdBy: event.locals.user?.id ?? "",
        createdByName: event.locals.user?.name ?? event.locals.user?.email ?? "Unbekannt"
    });

    if (!result.ok) return fail(400, { error: result.error });

    const target = result.backorders?.length
        ? `${redirectTo}?hinweis=nachbestellung`
        : redirectTo;

    throw redirect(303, target);
}
