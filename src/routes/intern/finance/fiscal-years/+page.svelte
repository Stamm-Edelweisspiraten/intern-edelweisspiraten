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
            <div class="overflow-x-auto hidden xl:block">
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
            <div class="xl:hidden divide-y divide-gray-200 px-4 pb-4">
                {#if active.length === 0}
                    <p class="text-sm text-gray-500 py-4 text-center">Noch keine aktiven Geschaeftsjahre.</p>
                {:else}
                    {#each active as fy}
                        <div class="border border-gray-200 rounded-2xl p-4 shadow-sm space-y-3 mt-3 bg-white">
                            <div class="flex items-start justify-between gap-3">
                                <div>
                                    <p class="text-lg font-semibold text-gray-900">{fy.year}</p>
                                </div>
                                <span class="px-3 py-1 text-xs font-semibold rounded-full border border-gray-200 bg-gray-50 text-gray-700">
                                    {fy.transactionCount} Transaktionen
                                </span>
                            </div>
                            <div class="grid grid-cols-2 gap-2 text-sm text-gray-700">
                                <div class="px-3 py-2 rounded-xl bg-gray-50 border border-gray-200">
                                    <p class="text-[11px] uppercase tracking-wide text-gray-500">Stamm</p>
                                    <p class="font-semibold text-gray-900">{euro(fy.dues.stamm)}</p>
                                </div>
                                <div class="px-3 py-2 rounded-xl bg-gray-50 border border-gray-200">
                                    <p class="text-[11px] uppercase tracking-wide text-gray-500">Gau</p>
                                    <p class="font-semibold text-gray-900">{euro(fy.dues.gau)}</p>
                                </div>
                                <div class="px-3 py-2 rounded-xl bg-gray-50 border border-gray-200">
                                    <p class="text-[11px] uppercase tracking-wide text-gray-500">Landesmark</p>
                                    <p class="font-semibold text-gray-900">{euro(fy.dues.landesmark)}</p>
                                </div>
                                <div class="px-3 py-2 rounded-xl bg-gray-50 border border-gray-200">
                                    <p class="text-[11px] uppercase tracking-wide text-gray-500">Bund</p>
                                    <p class="font-semibold text-gray-900">{euro(fy.dues.bund)}</p>
                                </div>
                            </div>
                            <div class="flex flex-wrap justify-end gap-2">
                                <a
                                        href={`/intern/finance/fiscal-years/${fy.id}`}
                                        class="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition"
                                >
                                    <span class="bi bi-eye"></span>
                                    Anzeigen
                                </a>
                                <form method="post" action="?/archive" class="inline">
                                    <input type="hidden" name="id" value={fy.id} />
                                    <button
                                            type="submit"
                                            class="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg transition"
                                    >
                                        <span class="bi bi-archive"></span>
                                        Archivieren
                                    </button>
                                </form>
                            </div>
                        </div>
                    {/each}
                {/if}
            </div>
        </div>

        <div class="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div class="px-6 py-4 flex items-center justify-between">
                <h2 class="text-lg font-semibold text-gray-900">Archiv</h2>
                <span class="text-sm text-gray-500">{archived.length} Eintraege</span>
            </div>
            <div class="overflow-x-auto hidden xl:block">
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
            <div class="xl:hidden divide-y divide-gray-200 px-4 pb-4">
                {#if archived.length === 0}
                    <p class="text-sm text-gray-500 py-4 text-center">Noch keine archivierten Geschaeftsjahre.</p>
                {:else}
                    {#each archived as fy}
                        <div class="border border-gray-200 rounded-2xl p-4 shadow-sm space-y-3 mt-3 bg-gray-50 text-gray-700">
                            <div class="flex items-start justify-between gap-3">
                                <div>
                                    <p class="text-lg font-semibold text-gray-900">{fy.year}</p>
                                </div>
                                <span class="px-3 py-1 text-xs font-semibold rounded-full border border-gray-200 bg-white">
                                    {fy.transactionCount} Transaktionen
                                </span>
                            </div>
                            <div class="grid grid-cols-2 gap-2 text-sm">
                                <div class="px-3 py-2 rounded-xl bg-white border border-gray-200">
                                    <p class="text-[11px] uppercase tracking-wide text-gray-500">Stamm</p>
                                    <p class="font-semibold text-gray-900">{euro(fy.dues.stamm)}</p>
                                </div>
                                <div class="px-3 py-2 rounded-xl bg-white border border-gray-200">
                                    <p class="text-[11px] uppercase tracking-wide text-gray-500">Gau</p>
                                    <p class="font-semibold text-gray-900">{euro(fy.dues.gau)}</p>
                                </div>
                                <div class="px-3 py-2 rounded-xl bg-white border border-gray-200">
                                    <p class="text-[11px] uppercase tracking-wide text-gray-500">Landesmark</p>
                                    <p class="font-semibold text-gray-900">{euro(fy.dues.landesmark)}</p>
                                </div>
                                <div class="px-3 py-2 rounded-xl bg-white border border-gray-200">
                                    <p class="text-[11px] uppercase tracking-wide text-gray-500">Bund</p>
                                    <p class="font-semibold text-gray-900">{euro(fy.dues.bund)}</p>
                                </div>
                            </div>
                            <div class="flex justify-end">
                                <a
                                        href={`/intern/finance/fiscal-years/${fy.id}`}
                                        class="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition"
                                >
                                    <span class="bi bi-eye"></span>
                                    Anzeigen
                                </a>
                            </div>
                        </div>
                    {/each}
                {/if}
            </div>
        </div>
    </div>
</div>
