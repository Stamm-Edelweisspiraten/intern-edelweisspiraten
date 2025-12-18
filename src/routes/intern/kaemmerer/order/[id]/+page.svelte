<script lang="ts">
    export let data;

    const order = data.order;

    const euro = (v: number) => `${(Number(v) || 0).toFixed(2)} EUR`;

    const statusTone = (status: string) => {
        if (status === "paid") return "bg-emerald-50 text-emerald-700 border-emerald-200";
        if (status === "delivered") return "bg-blue-50 text-blue-700 border-blue-200";
        if (status === "processing") return "bg-amber-50 text-amber-700 border-amber-200";
        return "bg-gray-50 text-gray-700 border-gray-200";
    };

    const paymentTone = (status: string) => {
        if (status === "paid") return "bg-emerald-50 text-emerald-700 border-emerald-200";
        if (status === "partial") return "bg-amber-50 text-amber-700 border-amber-200";
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
</script>

<div class="max-w-6xl mx-auto mt-16 space-y-8">
    <div class="flex items-center justify-between flex-wrap gap-3 text-sm text-gray-600">
        <div class="flex items-center gap-3 flex-wrap">
            <a href="/intern/kaemmerer/order" class="inline-flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-xl text-gray-800 bg-white hover:bg-gray-50 shadow-sm transition">
                <i class="bi bi-arrow-left"></i>
                Zurueck zur Uebersicht
            </a>
            <span class="px-3 py-1 text-[11px] font-semibold rounded-full border border-sky-200 text-sky-800 bg-sky-100">
                Bestellung {order.number}
            </span>
        </div>
    </div>

    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
        <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
                <p class="text-sm font-semibold text-gray-700 uppercase tracking-wide">Kaemmerer</p>
                <h1 class="text-3xl font-bold text-gray-900">Bestellung {order.number}</h1>
                <p class="text-sm text-gray-600 mt-1">
                    Angelegt am {order.createdAt?.slice(0, 10) ?? "-"}{order.createdByName ? ` von ${order.createdByName}` : ""}
                </p>
            </div>
            <div class="flex flex-wrap gap-2">
                <span class={`px-3 py-1 text-[11px] font-semibold rounded-full border ${statusTone(order.status)}`}>Status: {statusLabel(order.status)}</span>
                <span class={`px-3 py-1 text-[11px] font-semibold rounded-full border ${paymentTone(order.paymentStatus)}`}>Zahlung: {paymentLabel(order.paymentStatus)}</span>
            </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-semibold text-gray-700">Mitglieder:</span>
            {#if order.members?.length}
                {#each order.members as member}
                    <span class="px-3 py-1 text-xs font-semibold rounded-full border border-gray-200 bg-gray-50">{member.name}</span>
                {/each}
            {:else}
                <span class="text-sm text-gray-500">Keine Mitglieder verknuepft.</span>
            {/if}
        </div>
    </div>

    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div class="px-6 py-4 flex items-center justify-between">
            <h2 class="text-lg font-semibold text-gray-900">Positionen</h2>
            <span class="text-sm text-gray-500">{order.items?.length ?? 0} Artikel</span>
        </div>

        <div class="hidden xl:block overflow-x-auto">
            <table class="w-full min-w-full divide-y divide-gray-200 text-sm">
                <thead class="bg-gray-50">
                <tr>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Artikel</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Groesse</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Menge</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Einzelpreis</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Gesamt</th>
                </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                {#if order.items?.length === 0}
                    <tr>
                        <td colspan="5" class="px-6 py-6 text-center text-sm text-gray-500">Keine Positionen vorhanden.</td>
                    </tr>
                {:else}
                    {#each order.items as item}
                        <tr class="hover:bg-gray-50 transition">
                            <td class="px-6 py-4 font-semibold text-gray-900">{item.name}</td>
                            <td class="px-6 py-4 text-gray-700">{item.size ?? "-"}</td>
                            <td class="px-6 py-4 text-gray-700">{item.quantity}</td>
                            <td class="px-6 py-4 text-gray-700">{euro(item.price)}</td>
                            <td class="px-6 py-4 font-semibold text-gray-900">{euro(item.total)}</td>
                        </tr>
                    {/each}
                {/if}
                </tbody>
                <tfoot class="bg-gray-50">
                <tr>
                    <td colspan="4" class="px-6 py-4 text-right text-sm font-semibold text-gray-700">Summe</td>
                    <td class="px-6 py-4 font-bold text-gray-900">{euro(order.total)}</td>
                </tr>
                </tfoot>
            </table>
        </div>

        <div class="xl:hidden divide-y divide-gray-100">
            {#if !order.items?.length}
                <p class="px-4 pb-4 text-sm text-gray-500">Keine Positionen vorhanden.</p>
            {:else}
                {#each order.items as item}
                    <div class="p-4 space-y-2">
                        <div class="flex items-start justify-between gap-3">
                            <div>
                                <p class="text-base font-semibold text-gray-900">{item.name}</p>
                                <p class="text-xs text-gray-500 flex items-center gap-1">
                                    <span class="bi bi-rulers"></span> Groesse: {item.size ?? "-"}
                                </p>
                            </div>
                            <span class="text-sm font-semibold text-gray-900">{euro(item.total)}</span>
                        </div>
                        <div class="grid grid-cols-2 gap-2 text-sm text-gray-700">
                            <div class="flex items-center gap-2">
                                <span class="bi bi-hash text-gray-400"></span>
                                Menge: {item.quantity}
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="bi bi-tag text-gray-400"></span>
                                {euro(item.price)} / Stk
                            </div>
                        </div>
                    </div>
                {/each}
                <div class="px-4 py-3 bg-gray-50 flex items-center justify-between text-sm font-semibold text-gray-900 rounded-b-2xl">
                    <span>Summe</span>
                    <span>{euro(order.total)}</span>
                </div>
            {/if}
        </div>
    </div>

    <div class="flex justify-end">
        <a href="/intern/kaemmerer/order" class="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-gray-800 bg-white hover:bg-gray-50 shadow-sm transition">
            <i class="bi bi-arrow-left"></i>
            Zurueck zur Uebersicht
        </a>
    </div>
</div>

