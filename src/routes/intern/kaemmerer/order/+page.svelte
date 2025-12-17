<script lang="ts">
    export let data;

    const euro = (v: number) => `${(Number(v) || 0).toFixed(2)} EUR`;
    const orders = data.orders ?? [];

    const statusTone = (status: string) => {
        if (status === "paid") return "bg-emerald-50 text-emerald-700 border-emerald-200";
        if (status === "delivered") return "bg-blue-50 text-blue-700 border-blue-200";
        if (status === "processing") return "bg-amber-50 text-amber-700 border-amber-200";
        return "bg-gray-50 text-gray-700 border-gray-200";
    };
</script>

<div class="max-w-6xl mx-auto mt-16 space-y-8">
    <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
            <p class="text-sm font-semibold text-gray-700 uppercase tracking-wide">Kaemmerer</p>
            <h1 class="text-3xl font-bold text-gray-900">Meine Bestellungen</h1>
            <p class="text-sm text-gray-600 mt-1">Bestellungen der verknuepften Mitglieder.</p>
        </div>
        <a
                href="/intern/kaemmerer/order/create"
                class="inline-flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-sm"
        >
            <span class="bi bi-plus-circle"></span>
            Neue Bestellung
        </a>
    </div>

    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 space-y-4">
        <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-gray-900">Bestellungen</h2>
            <span class="text-sm text-gray-500">{orders.length} Einträge</span>
        </div>

        <!-- Desktop table -->
        <div class="hidden md:block overflow-x-auto">
            <table class="w-full min-w-full divide-y divide-gray-200 text-sm">
                <thead class="bg-gray-50">
                <tr>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Nr</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Mitglieder</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Datum</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Gesamt</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                {#if orders.length === 0}
                    <tr>
                        <td colspan="5" class="px-6 py-6 text-center text-sm text-gray-500">Keine Bestellungen gefunden.</td>
                    </tr>
                {:else}
                    {#each orders as order}
                        <tr class="hover:bg-gray-50 transition">
                            <td class="px-6 py-4 font-semibold text-gray-900">
                                <a href={`/intern/kaemmerer/order/${order.id}`} class="text-blue-600 hover:text-blue-700 flex items-center gap-2">
                                    <span>{order.number}</span>
                                    <i class="bi bi-arrow-right-short text-lg"></i>
                                </a>
                            </td>
                            <td class="px-6 py-4 text-gray-700">
                                <div class="flex flex-wrap gap-2">
                                    {#each order.members as member}
                                        <span class="px-2 py-1 text-xs font-semibold rounded-full border border-gray-200 bg-gray-50">{member.name}</span>
                                    {/each}
                                </div>
                            </td>
                            <td class="px-6 py-4 text-gray-700">{order.createdAt?.slice(0, 10) ?? "-"}</td>
                            <td class="px-6 py-4 font-semibold text-gray-900">{euro(order.total)}</td>
                            <td class="px-6 py-4">
                                <span class={`px-3 py-1 text-xs font-semibold rounded-full border ${statusTone(order.status)}`}>{order.status}</span>
                            </td>
                        </tr>
                    {/each}
                {/if}
                </tbody>
            </table>
        </div>

        <!-- Mobile cards -->
        <div class="md:hidden space-y-3">
            {#if orders.length === 0}
                <div class="text-sm text-gray-500 text-center py-4 border border-dashed border-gray-200 rounded-xl">Keine Bestellungen gefunden.</div>
            {:else}
                {#each orders as order}
                    <div class="border border-gray-200 rounded-xl p-4 shadow-sm bg-white">
                        <div class="flex items-center justify-between">
                            <div class="text-sm font-semibold text-gray-900">#{order.number}</div>
                            <span class={`px-2.5 py-1 text-[11px] font-semibold rounded-full border ${statusTone(order.status)}`}>{order.status}</span>
                        </div>
                        <div class="mt-2 text-xs text-gray-700">
                            <div class="font-semibold text-gray-900">Mitglieder</div>
                            <div class="flex flex-wrap gap-1 mt-1">
                                {#each order.members as member}
                                    <span class="px-2 py-1 rounded-full border border-gray-200 bg-gray-50">{member.name}</span>
                                {/each}
                            </div>
                        </div>
                        <div class="mt-2 text-xs text-gray-700">
                            <div class="font-semibold text-gray-900">Datum</div>
                            <div>{order.createdAt?.slice(0, 10) ?? "-"}</div>
                        </div>
                        <div class="mt-2 text-sm font-semibold text-gray-900">Gesamt: {euro(order.total)}</div>
                        <div class="mt-3 flex flex-wrap gap-2">
                            <a href={`/intern/kaemmerer/order/${order.id}`} class="flex-1 text-center px-3 py-2 text-xs rounded-lg border border-gray-200 text-gray-800 hover:bg-gray-50">Öffnen</a>
                        </div>
                    </div>
                {/each}
            {/if}
        </div>
    </div>
</div>
