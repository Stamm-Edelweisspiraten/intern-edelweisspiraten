<script lang="ts">
    import { goto } from "$app/navigation";
    export let data;

    const fiscalYears = data.fiscalYears ?? [];

    const handleSelect = (event: Event) => {
        const target = event.target as HTMLSelectElement;
        if (target.value) {
            goto(`/intern/finance/dues/contributions/${target.value}`);
        }
    };
</script>

<div class="max-w-6xl mx-auto mt-16 space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
            <h1 class="text-3xl font-bold text-gray-900">Beitraege</h1>
            <p class="text-gray-600 mt-1">Waehle ein Geschaeftsjahr, um Beitraege der Mitglieder anzusehen.</p>
        </div>
        <div class="w-full sm:w-72">
            <label class="block text-sm font-semibold text-gray-700 mb-2">Geschaeftsjahr auswaehlen</label>
            <select
                    class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    on:change={handleSelect}
            >
                <option value="">- Bitte waehlen -</option>
                {#each fiscalYears as fy}
                    <option value={fy.id}>{fy.year}</option>
                {/each}
            </select>
        </div>
    </div>

    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div class="px-6 py-4 flex items-center justify-between">
            <h2 class="text-lg font-semibold text-gray-900">Geschaeftsjahre</h2>
            <span class="text-sm text-gray-500">{fiscalYears.length} Eintraege</span>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                <tr>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Jahr</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Transaktionen</th>
                    <th class="px-6 py-3"></th>
                </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                {#if fiscalYears.length === 0}
                    <tr>
                        <td colspan="4" class="px-6 py-6 text-center text-sm text-gray-500">
                            Noch keine Geschaeftsjahre erfasst.
                        </td>
                    </tr>
                {:else}
                    {#each fiscalYears as fy}
                        <tr class="hover:bg-gray-50 transition">
                            <td class="px-6 py-4 text-sm font-semibold text-gray-900">{fy.year}</td>
                            <td class="px-6 py-4 text-sm text-gray-700 capitalize">{fy.status ?? "active"}</td>
                            <td class="px-6 py-4 text-sm text-gray-700">{fy.transactionCount}</td>
                            <td class="px-6 py-4 text-right">
                                <a
                                        href={`/intern/finance/dues/contributions/${fy.id}`}
                                        class="text-blue-600 hover:text-blue-700 font-semibold text-sm"
                                >
                                    Oeffnen
                                </a>
                            </td>
                        </tr>
                    {/each}
                {/if}
                </tbody>
            </table>
        </div>
    </div>
</div>
