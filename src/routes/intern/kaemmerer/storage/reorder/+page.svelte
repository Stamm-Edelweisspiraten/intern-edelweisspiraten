<script lang="ts">
    export let data;
    const reorder = data.reorder ?? [];
</script>

<div class="max-w-6xl mx-auto mt-16 space-y-8">
    <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
            <p class="text-sm font-semibold text-gray-700 uppercase tracking-wide">Kaemmerer</p>
            <h1 class="text-3xl font-bold text-gray-900">Bestellliste</h1>
            <p class="text-sm text-gray-600 mt-1">Fehlmengen bis Mindestbestand, pro Artikel und Größe.</p>
        </div>
        <div class="flex items-center gap-3 flex-wrap">
            <a href="/intern/kaemmerer/storage" class="inline-flex items-center gap-2 px-4 py-3 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl font-semibold text-gray-800 shadow-sm transition">
                <span class="bi bi-arrow-left"></span>
                Zurück ins Lager
            </a>
        </div>
    </div>

    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div class="px-6 py-4 flex items-center justify-between">
            <div>
                <h2 class="text-lg font-semibold text-gray-900">Fehlende Mengen</h2>
                <p class="text-sm text-gray-600">Berechnet aus aktuellem Bestand vs. Mindestbestand.</p>
            </div>
            <span class="text-sm text-gray-500">{reorder.length} Positionen</span>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full min-w-full divide-y divide-gray-200 text-sm">
                <thead class="bg-gray-50">
                <tr>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Artikel</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Größe</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Bestand</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Mindestbestand</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Fehlmenge</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Bestell-URL</th>
                </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                {#if reorder.length === 0}
                    <tr>
                        <td colspan="6" class="px-6 py-6 text-center text-sm text-gray-500">Keine Fehlmengen – alle Artikel sind mindestens auf Zielbestand.</td>
                    </tr>
                {:else}
                    {#each reorder as row}
                        <tr class="hover:bg-gray-50 transition">
                            <td class="px-6 py-4 font-semibold text-gray-900">{row.name}</td>
                            <td class="px-6 py-4 text-gray-700">{row.size ?? "-"}</td>
                            <td class="px-6 py-4 text-gray-700">{row.stock}</td>
                            <td class="px-6 py-4 text-gray-700">{row.minStock}</td>
                            <td class="px-6 py-4 font-semibold text-gray-900 text-amber-600">{row.missing}</td>
                            <td class="px-6 py-4 text-gray-700">
                                {#if row.orderUrl}
                                    <a href={row.orderUrl} target="_blank" rel="noreferrer" class="inline-flex items-center gap-1 text-blue-700 hover:text-blue-800">
                                        <span class="bi bi-box-arrow-up-right"></span>
                                        Link
                                    </a>
                                {:else}
                                    <span class="text-xs text-gray-500">-</span>
                                {/if}
                            </td>
                        </tr>
                    {/each}
                {/if}
                </tbody>
            </table>
        </div>
    </div>
</div>
