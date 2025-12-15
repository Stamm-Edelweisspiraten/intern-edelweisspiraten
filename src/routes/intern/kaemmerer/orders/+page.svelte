<script lang="ts">
    export let data;

    const euro = (v: number) => `${(Number(v) || 0).toFixed(2)} EUR`;
    const orders = data.orders ?? [];
    const currentStatus = data.status ?? "";

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
            <h1 class="text-3xl font-bold text-gray-900">Bestellungen (Admin)</h1>
            <p class="text-sm text-gray-600 mt-1">Alle Bestellungen verwalten.</p>
        </div>
        <a href="/intern/kaemmerer" class="inline-flex items-center gap-2 px-4 py-3 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl font-semibold text-gray-800 shadow-sm transition">
            <span class="bi bi-arrow-left"></span>
            Zurueck
        </a>
    </div>

    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-3">
            <div class="flex items-center gap-2">
                <span class="text-sm text-gray-600">Filter Status</span>
                <form method="get">
                    <select name="status" class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" value={currentStatus}>
                        <option value="">Alle</option>
                        <option value="ordered" selected={currentStatus === "ordered"}>Bestellt</option>
                        <option value="processing" selected={currentStatus === "processing"}>In Bearbeitung</option>
                        <option value="delivered" selected={currentStatus === "delivered"}>Zugestellt</option>
                        <option value="paid" selected={currentStatus === "paid"}>Bezahlt</option>
                    </select>
                    <button type="submit" class="ml-2 px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50">Anwenden</button>
                </form>
            </div>
            <span class="text-sm text-gray-500">{orders.length} Eintraege</span>
        </div>

        <div class="overflow-x-auto">
            <table class="w-full min-w-full divide-y divide-gray-200 text-sm">
                <thead class="bg-gray-50">
                <tr>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Nr</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Mitglieder</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Besteller</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Gesamt</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Aktion</th>
                </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                {#if orders.length === 0}
                    <tr>
                        <td colspan="6" class="px-6 py-6 text-center text-sm text-gray-500">Keine Bestellungen gefunden.</td>
                    </tr>
                {:else}
                    {#each orders as order}
                        <tr class="hover:bg-gray-50 transition">
                            <td class="px-6 py-4 font-semibold text-gray-900">{order.number}</td>
                            <td class="px-6 py-4 text-gray-700">
                                <div class="flex flex-wrap gap-2">
                                    {#each order.members as member}
                                        <span class="px-2 py-1 text-xs font-semibold rounded-full border border-gray-200 bg-gray-50">{member.name}</span>
                                    {/each}
                                </div>
                            </td>
                            <td class="px-6 py-4 text-gray-700">{order.createdByName ?? order.createdBy ?? "-"}</td>
                            <td class="px-6 py-4 font-semibold text-gray-900">{euro(order.total)}</td>
                            <td class="px-6 py-4">
                                <span class={`px-3 py-1 text-xs font-semibold rounded-full border ${statusTone(order.status)}`}>{order.status}</span>
                            </td>
                            <td class="px-6 py-4">
                                <form method="post" action="?/status" class="flex items-center gap-2">
                                    <input type="hidden" name="orderId" value={order.id} />
                                    <select name="status" class="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500">
                                        <option value="ordered" selected={order.status === "ordered"}>Bestellt</option>
                                        <option value="processing" selected={order.status === "processing"}>In Bearbeitung</option>
                                        <option value="delivered" selected={order.status === "delivered"}>Zugestellt</option>
                                        <option value="paid" selected={order.status === "paid"}>Bezahlt</option>
                                    </select>
                                    <select name="paymentStatus" class="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500">
                                        <option value="open" selected={order.paymentStatus === "open"}>Offen</option>
                                        <option value="partial" selected={order.paymentStatus === "partial"}>Teilweise</option>
                                        <option value="paid" selected={order.paymentStatus === "paid"}>Bezahlt</option>
                                    </select>
                                    <button type="submit" class="px-3 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg">Update</button>
                                </form>
                            </td>
                        </tr>
                    {/each}
                {/if}
                </tbody>
            </table>
        </div>
    </div>

</div>
