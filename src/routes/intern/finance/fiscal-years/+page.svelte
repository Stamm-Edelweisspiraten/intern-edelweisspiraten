<script lang="ts">
    export let data;

    const euro = (value: number) => `${value.toFixed(2)} EUR`;
    const fiscalYears = data.fiscalYears ?? [];
    const active = fiscalYears.filter((fy) => (fy.status ?? "active") === "active");
    const archived = fiscalYears.filter((fy) => fy.status === "archived");
</script>

<div class="max-w-6xl mx-auto mt-16 space-y-8">
    <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
            <h1 class="text-4xl font-bold text-gray-900">Geschaeftsjahre</h1>
            <p class="text-gray-600 mt-2">Uebersicht der aktiven und vergangenen Geschaeftsjahre.</p>
        </div>
        <a
                href="/intern/finance/fiscal-years/create"
                class="inline-flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
        >
            Neues Geschaeftsjahr
        </a>
    </div>

    <div class="space-y-8">
        <div class="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div class="px-6 py-4 flex items-center justify-between">
                <h2 class="text-lg font-semibold text-gray-900">Aktiv</h2>
                <span class="text-sm text-gray-500">{active.length} Eintraege</span>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Jahr</th>
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Stamm</th>
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Gau</th>
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Landesmark</th>
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Bund</th>
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Transaktionen</th>
                        <th class="px-6 py-3"></th>
                    </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                    {#if active.length === 0}
                        <tr>
                            <td colspan="7" class="px-6 py-6 text-center text-sm text-gray-500">
                                Noch keine aktiven Geschaeftsjahre.
                            </td>
                        </tr>
                    {:else}
                        {#each active as fy}
                            <tr class="hover:bg-gray-50 transition">
                                <td class="px-6 py-4 text-sm font-semibold text-gray-900">{fy.year}</td>
                                <td class="px-6 py-4 text-sm text-gray-700">{euro(fy.dues.stamm)}</td>
                                <td class="px-6 py-4 text-sm text-gray-700">{euro(fy.dues.gau)}</td>
                                <td class="px-6 py-4 text-sm text-gray-700">{euro(fy.dues.landesmark)}</td>
                                <td class="px-6 py-4 text-sm text-gray-700">{euro(fy.dues.bund)}</td>
                                <td class="px-6 py-4 text-sm text-gray-700">{fy.transactionCount}</td>
                                <td class="px-6 py-4 text-right space-x-3">
                                    <a
                                            href={`/intern/finance/fiscal-years/${fy.id}`}
                                            class="text-blue-600 hover:text-blue-700 font-semibold text-sm"
                                    >
                                        Anzeigen
                                    </a>
                                    <form method="post" action="?/archive" class="inline">
                                        <input type="hidden" name="id" value={fy.id} />
                                        <button
                                                type="submit"
                                                class="text-sm text-gray-500 hover:text-gray-700"
                                        >
                                            Archivieren
                                        </button>
                                    </form>
                                </td>
                            </tr>
                        {/each}
                    {/if}
                    </tbody>
                </table>
            </div>
        </div>

        <div class="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div class="px-6 py-4 flex items-center justify-between">
                <h2 class="text-lg font-semibold text-gray-900">Archiv</h2>
                <span class="text-sm text-gray-500">{archived.length} Eintraege</span>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Jahr</th>
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Stamm</th>
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Gau</th>
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Landesmark</th>
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Bund</th>
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Transaktionen</th>
                        <th class="px-6 py-3"></th>
                    </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                    {#if archived.length === 0}
                        <tr>
                            <td colspan="7" class="px-6 py-6 text-center text-sm text-gray-500">
                                Noch keine archivierten Geschaeftsjahre.
                            </td>
                        </tr>
                    {:else}
                        {#each archived as fy}
                            <tr class="bg-gray-50 text-gray-500">
                                <td class="px-6 py-4 text-sm font-semibold">{fy.year}</td>
                                <td class="px-6 py-4 text-sm">{euro(fy.dues.stamm)}</td>
                                <td class="px-6 py-4 text-sm">{euro(fy.dues.gau)}</td>
                                <td class="px-6 py-4 text-sm">{euro(fy.dues.landesmark)}</td>
                                <td class="px-6 py-4 text-sm">{euro(fy.dues.bund)}</td>
                                <td class="px-6 py-4 text-sm">{fy.transactionCount}</td>
                                <td class="px-6 py-4 text-right">
                                    <a
                                            href={`/intern/finance/fiscal-years/${fy.id}`}
                                            class="text-blue-600 hover:text-blue-700 font-semibold text-sm"
                                    >
                                        Anzeigen
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
</div>
