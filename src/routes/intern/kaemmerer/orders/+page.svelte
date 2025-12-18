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

    const rowTone = (status: string) => {
        if (status === "paid") return "bg-emerald-50/40";
        if (status === "delivered") return "bg-blue-50/40";
        if (status === "processing") return "bg-amber-50/30";
        return "";
    };

    const totalOrders = orders.length;
    const openOrders = orders.filter((o: any) => o.status === "ordered").length;
    const inProgress = orders.filter((o: any) => o.status === "processing").length;
    const delivered = orders.filter((o: any) => o.status === "delivered").length;
    const paid = orders.filter((o: any) => o.status === "paid").length;
</script>

<div class="max-w-6xl mx-auto mt-16 space-y-8">
    <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
            <p class="text-sm font-semibold text-gray-700 uppercase tracking-wide">Kaemmerer</p>
            <h1 class="text-3xl font-bold text-gray-900">Bestellungen (Admin)</h1>
            <p class="text-sm text-gray-600 mt-1">Alle Bestellungen verwalten.</p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
            <a href="/intern/kaemmerer/orders/create" class="inline-flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-sm transition">
                <span class="bi bi-plus-circle"></span>
                Bestellung anlegen
            </a>
            <a href="/intern/kaemmerer" class="inline-flex items-center gap-2 px-4 py-3 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl font-semibold text-gray-800 shadow-sm transition">
                <span class="bi bi-arrow-left"></span>
                Zurueck
            </a>
        </div>
    </div>

    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 space-y-4">
        <div class="flex items-start justify-between flex-wrap gap-3">
            <div class="flex flex-wrap items-center gap-2">
                <span class="text-sm text-gray-600">Filter Status</span>
                <form method="get" class="flex items-center gap-2 flex-wrap">
                    <div class="flex flex-wrap gap-2">
                        <button name="status" value="" type="submit" class={`px-3 py-2 text-xs font-semibold rounded-full border transition ${currentStatus === "" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}>Alle</button>
                        <button name="status" value="ordered" type="submit" class={`px-3 py-2 text-xs font-semibold rounded-full border transition ${currentStatus === "ordered" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}>Bestellt</button>
                        <button name="status" value="processing" type="submit" class={`px-3 py-2 text-xs font-semibold rounded-full border transition ${currentStatus === "processing" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}>In Bearbeitung</button>
                        <button name="status" value="delivered" type="submit" class={`px-3 py-2 text-xs font-semibold rounded-full border transition ${currentStatus === "delivered" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}>Zugestellt</button>
                        <button name="status" value="paid" type="submit" class={`px-3 py-2 text-xs font-semibold rounded-full border transition ${currentStatus === "paid" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}>Bezahlt</button>
                    </div>
                </form>
            </div>
            <span class="text-sm text-gray-500">{orders.length} Eintraege</span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div class="p-4 rounded-xl border border-gray-200 bg-gray-50">
                <p class="text-xs text-gray-500 uppercase tracking-wide">Gesamt</p>
                <p class="text-2xl font-semibold text-gray-900">{totalOrders}</p>
            </div>
            <div class="p-4 rounded-xl border border-amber-200 bg-amber-50/70">
                <p class="text-xs text-amber-700 uppercase tracking-wide">Bestellt</p>
                <p class="text-2xl font-semibold text-amber-700">{openOrders}</p>
            </div>
            <div class="p-4 rounded-xl border border-blue-200 bg-blue-50/70">
                <p class="text-xs text-blue-700 uppercase tracking-wide">In Bearbeitung/Zugestellt</p>
                <p class="text-2xl font-semibold text-blue-700">{inProgress + delivered}</p>
            </div>
            <div class="p-4 rounded-xl border border-emerald-200 bg-emerald-50/70">
                <p class="text-xs text-emerald-700 uppercase tracking-wide">Bezahlt</p>
                <p class="text-2xl font-semibold text-emerald-700">{paid}</p>
            </div>
        </div>

        <!-- Desktop table -->
        <div class="hidden xl:block overflow-x-auto">
            <table class="w-full min-w-full divide-y divide-gray-200 text-sm">
                <thead class="bg-gray-50">
                <tr>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Nr</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Mitglieder</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Besteller</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Gesamt</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Zahlung</th>
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
                        <tr class={`hover:bg-gray-50 transition ${rowTone(order.status)}`}>
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
                                <span class={`px-3 py-1 text-xs font-semibold rounded-full border ${statusTone(order.status)}`}>{statusLabel(order.status)}</span>
                            </td>
                            <td class="px-6 py-4">
                                <span class={`px-3 py-1 text-xs font-semibold rounded-full border ${order.paymentStatus === "paid" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : order.paymentStatus === "partial" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-gray-200 bg-gray-50 text-gray-700"}`}>
                                    {paymentLabel(order.paymentStatus)}
                                </span>
                            </td>
                            <td class="px-6 py-4">
                                <form method="post" action="?/status" class="flex flex-wrap items-center gap-2" on:change={(event) => (event.currentTarget as HTMLFormElement).submit()}>
                                    <input type="hidden" name="orderId" value={order.id} />
                                    {#if order.status === "paid"}
                                        <select disabled class="border border-gray-300 rounded-lg px-2 py-1 text-xs bg-gray-50 text-gray-500">
                                            <option selected>Bezahlt (automatisch)</option>
                                        </select>
                                        <input type="hidden" name="status" value={order.status} />
                                    {:else}
                                        <select name="status" class="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500">
                                            <option value="ordered" selected={order.status === "ordered"}>Bestellt</option>
                                            <option value="processing" selected={order.status === "processing"}>In Bearbeitung</option>
                                            <option value="delivered" selected={order.status === "delivered"}>Zugestellt</option>
                                        </select>
                                    {/if}
                                    <select name="paymentStatus" class="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500">
                                        <option value="open" selected={order.paymentStatus === "open"}>Offen</option>
                                        <option value="partial" selected={order.paymentStatus === "partial"}>Teilweise</option>
                                        <option value="paid" selected={order.paymentStatus === "paid"}>Bezahlt</option>
                                    </select>
                                </form>
                                <a href={`/intern/kaemmerer/orders/${order.id}`} class="inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 mt-2">
                                    <span class="bi bi-box-seam"></span> Bestelldetails öffnen
                                </a>
                            </td>
                        </tr>
                    {/each}
                {/if}
                </tbody>
            </table>
        </div>

        <!-- Mobile cards -->
        <div class="xl:hidden space-y-3">
            {#if orders.length === 0}
                <div class="text-sm text-gray-500 text-center py-4 border border-dashed border-gray-200 rounded-xl">Keine Bestellungen gefunden.</div>
            {:else}
                {#each orders as order}
                    <div class="border border-gray-200 rounded-xl p-4 shadow-sm bg-white">
                        <div class="flex items-center justify-between">
                            <div class="text-sm font-semibold text-gray-900">#{order.number}</div>
                            <span class={`px-2.5 py-1 text-[11px] font-semibold rounded-full border ${statusTone(order.status)}`}>{statusLabel(order.status)}</span>
                        </div>
                        <div class="mt-1 text-[11px] text-gray-600 flex items-center gap-2">
                            <span class={`px-2 py-1 rounded-full border ${order.paymentStatus === "paid" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : order.paymentStatus === "partial" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-gray-200 bg-gray-50 text-gray-700"}`}>
                                Zahlung: {paymentLabel(order.paymentStatus)}
                            </span>
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
                            <div class="font-semibold text-gray-900">Besteller</div>
                            <div>{order.createdByName ?? order.createdBy ?? "-"}</div>
                        </div>
                        <div class="mt-2 text-sm font-semibold text-gray-900">Gesamt: {euro(order.total)}</div>
                        <form method="post" action="?/status" class="mt-3 space-y-2" on:change={(event) => (event.currentTarget as HTMLFormElement).submit()}>
                            <input type="hidden" name="orderId" value={order.id} />
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {#if order.status === "paid"}
                                    <select disabled class="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm bg-gray-50 text-gray-500">
                                        <option selected>Bezahlt (automatisch)</option>
                                    </select>
                                    <input type="hidden" name="status" value={order.status} />
                                {:else}
                                    <select name="status" class="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-500">
                                        <option value="ordered" selected={order.status === "ordered"}>Bestellt</option>
                                        <option value="processing" selected={order.status === "processing"}>In Bearbeitung</option>
                                        <option value="delivered" selected={order.status === "delivered"}>Zugestellt</option>
                                    </select>
                                {/if}
                                <select name="paymentStatus" class="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-500">
                                    <option value="open" selected={order.paymentStatus === "open"}>Offen</option>
                                    <option value="partial" selected={order.paymentStatus === "partial"}>Teilweise</option>
                                    <option value="paid" selected={order.paymentStatus === "paid"}>Bezahlt</option>
                                </select>
                            </div>
                            <a href={`/intern/kaemmerer/orders/${order.id}`} class="block text-center px-3 py-2 text-xs font-semibold rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100">Bestelldetails öffnen</a>
                        </form>
                    </div>
                {/each}
            {/if}
        </div>
    </div>
</div>

