<script lang="ts">
    export let data;

    const order = data.order;
    const articles = data.articles ?? [];

    const euro = (v: number) => `${(Number(v) || 0).toFixed(2)} EUR`;

    const statusLabel = (status: string) => {
        if (status === "ordered") return "Bestellt";
        if (status === "processing") return "In Bearbeitung";
        if (status === "delivered") return "Zugestellt";
        if (status === "paid") return "Bezahlt";
        return status;
    };

    const paymentLabel = (status: string) => {
        if (status === "open") return "Offen";
        if (status === "partial") return "Teilweise";
        if (status === "paid") return "Bezahlt";
        return status;
    };

    const receivedCount = order.items.filter((i: any) => i.received).length;

    const stockForItem = (item: any) => {
        if (!item.articleId) return null;
        const article = articles.find((a: any) => a.id === item.articleId);
        if (!article) return null;
        if (item.size && Array.isArray(article.sizes)) {
            const match = article.sizes.find((s: any) => s.name === item.size);
            return Number(match?.stock) ?? null;
        }
        return Number(article.stock) ?? null;
    };

    const hasEnoughStock = (item: any) => {
        const stock = stockForItem(item);
        if (stock === null || isNaN(stock)) return null;
        return stock >= (Number(item.quantity) || 0);
    };
</script>

<div class="max-w-5xl mx-auto mt-16 space-y-8">
    <div class="flex items-center justify-between flex-wrap gap-3">
        <div class="space-y-1">
            <p class="text-sm font-semibold text-gray-700 uppercase tracking-wide">Kaemmerer</p>
            <h1 class="text-3xl font-bold text-gray-900">Bestellung {order.number}</h1>
            <p class="text-sm text-gray-600">Angelegt am {order.createdAt?.slice?.(0, 10) ?? "-"}{order.createdByName ? ` von ${order.createdByName}` : ""}</p>
        </div>
        <div class="flex flex-wrap gap-2">
            <span class="px-3 py-1 text-xs font-semibold rounded-full border border-blue-200 bg-blue-50 text-blue-700">Status: {statusLabel(order.status)}</span>
            <span class="px-3 py-1 text-xs font-semibold rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">Zahlung: {paymentLabel(order.paymentStatus)}</span>
        </div>
    </div>

    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-2">
            <div class="space-y-1">
                <p class="text-sm font-semibold text-gray-700 uppercase tracking-wide">Mitglieder</p>
                <div class="flex flex-wrap gap-2">
                    {#each order.members as member}
                        <span class="px-3 py-1 rounded-full border border-gray-200 bg-gray-50 text-sm text-gray-800">{member.name}</span>
                    {/each}
                </div>
            </div>
            <div class="text-right">
                <p class="text-sm text-gray-500">Artikel erledigt</p>
                <p class="text-xl font-semibold text-gray-900">{receivedCount}/{order.items.length}</p>
            </div>
        </div>

        <div class="divide-y divide-gray-100">
            {#each order.items as item, idx}
                <div class="py-4 flex flex-wrap items-center justify-between gap-3">
                    <div class="space-y-1">
                        <p class="font-semibold text-gray-900">{item.name}</p>
                        <p class="text-xs text-gray-500">
                            {item.quantity}x {euro(item.price)}{item.size ? ` · Groesse ${item.size}` : ""}
                        </p>
                        {#if stockForItem(item) !== null}
                            {#if hasEnoughStock(item)}
                                <p class="text-xs text-emerald-700 flex items-center gap-1">
                                    <span class="bi bi-box-seam"></span> Lager: genug ({stockForItem(item)})
                                </p>
                            {:else}
                                <p class="text-xs text-amber-700 flex items-center gap-1">
                                    <span class="bi bi-exclamation-diamond"></span> Lager: zu wenig ({stockForItem(item) ?? "?"})
                                </p>
                            {/if}
                        {/if}
                    </div>
                    <div class="flex items-center gap-3">
                        <span class={`px-3 py-1 text-xs font-semibold rounded-full border ${item.received ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                            {item.received ? "Zugestellt" : "Offen"}
                        </span>
                        <form method="post" action="?/toggle" class="flex items-center gap-2">
                            <input type="hidden" name="itemIndex" value={idx} />
                            <input type="hidden" name="received" value={item.received ? "false" : "true"} />
                            <button type="submit" class={`px-3 py-2 text-xs font-semibold rounded-lg border transition ${
                                item.received
                                    ? "border-gray-200 bg-white text-gray-800 hover:bg-gray-50"
                                    : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                            }`}>
                                {item.received ? "Als offen markieren" : "Als zugestellt markieren"}
                            </button>
                        </form>
                    </div>
                </div>
            {/each}
        </div>

        <div class="flex items-center justify-between pt-2 border-t border-gray-200 text-sm">
            <span class="text-gray-600">Summe</span>
            <span class="text-lg font-bold text-gray-900">{euro(order.total)}</span>
        </div>
    </div>

    <div class="flex justify-end">
        <a href="/intern/kaemmerer/orders" class="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-gray-800 bg-white hover:bg-gray-50 shadow-sm">
            <span class="bi bi-arrow-left"></span>
            Zurueck zu den Bestellungen
        </a>
    </div>
</div>
