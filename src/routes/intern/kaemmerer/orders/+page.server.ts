import type { Actions, PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { listOrders, listArticles, updateOrderStatus } from "$lib/server/kaemmererService";
import { fail, redirect } from "@sveltejs/kit";

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "kaemmerer.orders.view");

    const status = event.url.searchParams.get("status") ?? undefined;
    const orders = await listOrders({ status: status ?? undefined });

    const articles = await listArticles(true);
    const reorder = articles.flatMap((article) => {
        const rows: { name: string; size?: string; stock: number; minStock: number; missing: number; orderUrl?: string }[] = [];
        const minStock = Number(article.minStock) || 0;
        if (Array.isArray(article.sizes) && article.sizes.length > 0) {
            for (const size of article.sizes) {
                const stock = Number(size.stock) || 0;
                const missing = Math.max(minStock - stock, 0);
                rows.push({
                    name: article.name,
                    size: size.name,
                    stock,
                    minStock,
                    missing,
                    orderUrl: size.orderUrl || article.orderUrl
                });
            }
        } else {
            const stock = Number(article.stock) || 0;
            const missing = Math.max(minStock - stock, 0);
            rows.push({
                name: article.name,
                stock,
                minStock,
                missing,
                orderUrl: article.orderUrl
            });
        }
        return rows.filter((r) => r.missing > 0);
    });

    return { orders, status: status ?? "", reorder };
};

export const actions: Actions = {
    status: async ({ request }) => {
        const form = await request.formData();
        const id = form.get("orderId")?.toString() ?? "";
        const status = form.get("status")?.toString() as any;
        const paymentStatus = form.get("paymentStatus")?.toString() as any;

        if (!id || !status) return fail(400, { error: "Ungueltige Daten" });

        await updateOrderStatus(id, status, paymentStatus);
        throw redirect(303, "/intern/kaemmerer/orders");
    },
    reorderCsv: async ({ locals }) => {
        requirePermission({ locals } as any, "kaemmerer.orders.view");
        const articles = await listArticles(true);
        const rows: { name: string; size?: string; stock: number; minStock: number; missing: number; orderUrl?: string }[] = [];

        for (const article of articles) {
            const minStock = Number(article.minStock) || 0;
            if (Array.isArray(article.sizes) && article.sizes.length > 0) {
                for (const size of article.sizes) {
                    const stock = Number(size.stock) || 0;
                    const missing = Math.max(minStock - stock, 0);
                    if (missing > 0) {
                        rows.push({
                            name: article.name,
                            size: size.name,
                            stock,
                            minStock,
                            missing,
                            orderUrl: size.orderUrl || article.orderUrl
                        });
                    }
                }
            } else {
                const stock = Number(article.stock) || 0;
                const missing = Math.max(minStock - stock, 0);
                if (missing > 0) {
                    rows.push({
                        name: article.name,
                        stock,
                        minStock,
                        missing,
                        orderUrl: article.orderUrl
                    });
                }
            }
        }

        const header = ["Artikel", "Größe", "Bestand", "Mindestbestand", "Fehlmenge", "Bestell-URL"];
        const csvLines = [
            header.join(";"),
            ...rows.map((r) => [
                `"${(r.name ?? "").replace(/"/g, '""')}"`,
                `"${(r.size ?? "").replace(/"/g, '""')}"`,
                r.stock,
                r.minStock,
                r.missing,
                `"${(r.orderUrl ?? "").replace(/"/g, '""')}"`
            ].join(";"))
        ];
        const csv = csvLines.join("\n");
        return new Response(csv, {
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="bestellliste.csv"`
            }
        });
    }
};
