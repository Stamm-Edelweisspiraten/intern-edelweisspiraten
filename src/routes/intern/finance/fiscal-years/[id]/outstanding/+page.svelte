<script lang="ts">
    export let data;

    const fiscalYear = data.fiscalYear;
    const outstanding = data.outstanding ?? { total: 0, items: [] };

    const euro = (value: number) => `${value.toFixed(2)} EUR`;
</script>

<div class="max-w-6xl mx-auto mt-16 space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
            <h1 class="text-3xl font-bold text-gray-900">Ausstehende Einnahmen {fiscalYear.year}</h1>
            <p class="text-gray-600 mt-1">{outstanding.items.length} offene Position{outstanding.items.length === 1 ? "" : "en"}.</p>
        </div>
        <div class="flex items-center gap-3">
            <a href={`/intern/finance/fiscal-years/${fiscalYear.id}`} class="text-sm font-semibold text-blue-600 hover:text-blue-700">
                Zurueck
            </a>
        </div>
    </div>

    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
        <div class="flex items-center justify-between mb-4">
            <div>
                <p class="text-sm text-gray-500">Gesamt offen</p>
                <p class="text-2xl font-semibold text-amber-600">{euro(outstanding.total)}</p>
            </div>
        </div>

        {#if outstanding.items.length === 0}
            <p class="text-sm text-gray-500">Keine offenen Einnahmen hinterlegt.</p>
        {:else}
            <div class="overflow-x-auto">
                <table class="w-full min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Mitglied</th>
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Notiz</th>
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Offen</th>
                    </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                    {#each outstanding.items as item}
                        <tr class="hover:bg-gray-50 transition">
                            <td class="px-6 py-4 text-sm font-semibold text-gray-900">{item.title}</td>
                            <td class="px-6 py-4 text-sm text-gray-600">{item.note ?? "-"}</td>
                            <td class="px-6 py-4 text-sm font-semibold text-amber-600">{euro(item.amount)}</td>
                        </tr>
                    {/each}
                    </tbody>
                </table>
            </div>
        {/if}
    </div>
</div>
