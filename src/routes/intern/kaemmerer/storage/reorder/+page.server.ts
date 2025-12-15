import type { PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { listArticles } from "$lib/server/kaemmererService";

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "kaemmerer.storage.manage");

    const articles = await listArticles(true);
    const reorder = articles.flatMap((article) => {
        const rows: { name: string; size?: string; stock: number; minStock: number; missing: number; orderUrl?: string }[] = [];
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
        return rows;
    });

    return { reorder };
};
