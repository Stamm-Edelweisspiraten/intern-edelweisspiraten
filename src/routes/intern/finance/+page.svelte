<script lang="ts">
    export let data;

    const euro = (value: number) => `${value.toFixed(2)} EUR`;
    const fiscalYears = data.fiscalYears ?? [];
    const outstandingTotal = data.outstandingTotal ?? 0;
    const active = fiscalYears.filter((fy) => (fy.status ?? "active") === "active");
    const archived = fiscalYears.filter((fy) => fy.status === "archived");
    const currentYear = new Date().getFullYear();
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
        <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
                <p class="text-sm font-semibold text-gray-700 uppercase tracking-wide">Offene Eingaenge</p>
                <h2 class="text-3xl font-bold text-gray-900 mt-1">{euro(outstandingTotal)}</h2>
                <p class="text-sm text-gray-600 mt-1">Alle offenen Positionen aus aktiven Geschaeftsjahren.</p>
            </div>
            <a
                    href="/intern/finance/outstanding"
                    class="inline-flex items-center gap-2 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-semibold shadow-sm transition"
            >
                <span class="bi bi-cash-stack text-lg"></span>
                Zur Uebersicht
            </a>
        </div>

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
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Einnahmen</th>
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Ausgaben</th>
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Saldo</th>
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Offen</th>
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
                            <tr class={`hover:bg-gray-50 transition ${fy.year === currentYear ? "bg-sky-50/70 ring-1 ring-sky-200" : ""}`}>
                                <td class="px-6 py-4 text-sm font-semibold text-gray-900">
                                    <div class="flex items-center gap-2">
                                        <span>{fy.year}</span>
                                        {#if fy.year === currentYear}
                                            <span class="px-2 py-0.5 text-[11px] font-semibold text-sky-800 bg-sky-100 rounded-full border border-sky-200">
                                                Aktuelles Jahr
                                            </span>
                                        {/if}
                                    </div>
                                </td>
                                <td class="px-6 py-4 text-sm text-gray-700">{euro(fy.income ?? 0)}</td>
                                <td class="px-6 py-4 text-sm text-gray-700">{euro(fy.outcome ?? 0)}</td>
                                <td class="px-6 py-4 text-sm font-semibold text-gray-900">{euro(fy.saldo ?? 0)}</td>
                                <td class="px-6 py-4 text-sm text-amber-700">{euro(fy.outstanding ?? 0)}</td>
                                <td class="px-6 py-4 text-sm text-gray-700">{fy.transactionCount}</td>
                                <td class="px-6 py-4">
                                    <div class="flex items-center justify-end gap-3">
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
                        <div class={`border border-gray-200 rounded-2xl p-4 shadow-sm space-y-3 mt-4 ${fy.year === currentYear ? "bg-sky-50/70 ring-1 ring-sky-200" : "bg-white"}`}>
                            <div class="flex items-start justify-between gap-3">
                                <div>
                                    <p class="text-lg font-semibold text-gray-900">{fy.year}</p>
                                    {#if fy.year === currentYear}
                                        <span class="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-sky-800 bg-sky-100 rounded-full border border-sky-200 mt-1">
                                            Aktuelles Jahr
                                        </span>
                                    {/if}
                                </div>
                                <div class="flex flex-wrap justify-end gap-2 text-xs text-gray-700">
                                    <span class="px-3 py-1 rounded-full border border-gray-200 bg-gray-50">+ {euro(fy.income ?? 0)}</span>
                                    <span class="px-3 py-1 rounded-full border border-gray-200 bg-gray-50">- {euro(fy.outcome ?? 0)}</span>
                                    <span class="px-3 py-1 rounded-full border border-amber-200 bg-amber-50 text-amber-700">Offen {euro(fy.outstanding ?? 0)}</span>
                                    <span class="px-3 py-1 rounded-full border border-gray-200 bg-gray-50">{fy.transactionCount} Trans.</span>
                                </div>
                            </div>
                            <div class="grid grid-cols-2 gap-2 text-sm text-gray-700">
                                <div class="px-3 py-2 rounded-xl bg-gray-50 border border-gray-200">
                                    <p class="text-[11px] uppercase tracking-wide text-gray-500">Einnahmen</p>
                                    <p class="font-semibold">{euro(fy.income ?? 0)}</p>
                                </div>
                                <div class="px-3 py-2 rounded-xl bg-gray-50 border border-gray-200">
                                    <p class="text-[11px] uppercase tracking-wide text-gray-500">Ausgaben</p>
                                    <p class="font-semibold">{euro(fy.outcome ?? 0)}</p>
                                </div>
                                <div class="px-3 py-2 rounded-xl bg-gray-50 border border-gray-200">
                                    <p class="text-[11px] uppercase tracking-wide text-gray-500">Saldo</p>
                                    <p class="font-semibold text-gray-900">{euro(fy.saldo ?? 0)}</p>
                                </div>
                                <div class="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
                                    <p class="text-[11px] uppercase tracking-wide">Offen</p>
                                    <p class="font-semibold">{euro(fy.outstanding ?? 0)}</p>
                                </div>
                            </div>
                            <div class="flex flex-wrap gap-2 justify-end">
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
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Einnahmen</th>
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Ausgaben</th>
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Saldo</th>
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Offen</th>
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
                                <td class="px-6 py-4 text-sm font-semibold">
                                    <div class="flex items-center gap-2">
                                        <span>{fy.year}</span>
                                        {#if fy.year === currentYear}
                                            <span class="px-2 py-0.5 text-[11px] font-semibold text-sky-800 bg-sky-100 rounded-full border border-sky-200">
                                                Aktuelles Jahr
                                            </span>
                                        {/if}
                                    </div>
                                </td>
                                <td class="px-6 py-4 text-sm">{euro(fy.income ?? 0)}</td>
                                <td class="px-6 py-4 text-sm">{euro(fy.outcome ?? 0)}</td>
                                <td class="px-6 py-4 text-sm font-semibold text-gray-900">{euro(fy.saldo ?? 0)}</td>
                                <td class="px-6 py-4 text-sm text-amber-700">{euro(fy.outstanding ?? 0)}</td>
                                <td class="px-6 py-4 text-sm">{fy.transactionCount}</td>
                                <td class="px-6 py-4 text-right">
                                    <a
                                            href={`/intern/finance/fiscal-years/${fy.id}`}
                                            class="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition"
                                    >
                                        <span class="bi bi-eye"></span>
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
                        <div class="border border-gray-200 rounded-2xl p-4 shadow-sm space-y-3 mt-4 bg-gray-50 text-gray-700">
                            <div class="flex items-start justify-between gap-3">
                                <div>
                                    <p class="text-lg font-semibold">{fy.year}</p>
                                    {#if fy.year === currentYear}
                                        <span class="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-sky-800 bg-sky-100 rounded-full border border-sky-200 mt-1">
                                            Aktuelles Jahr
                                        </span>
                                    {/if}
                                </div>
                                <span class="px-3 py-1 text-xs font-semibold rounded-full border border-gray-200 bg-white">
                                    {fy.transactionCount} Transaktionen
                                </span>
                            </div>
                            <div class="grid grid-cols-2 gap-2 text-sm">
                                <div class="px-3 py-2 rounded-xl bg-white border border-gray-200">
                                    <p class="text-[11px] uppercase tracking-wide text-gray-500">Einnahmen</p>
                                    <p class="font-semibold text-gray-900">{euro(fy.income ?? 0)}</p>
                                </div>
                                <div class="px-3 py-2 rounded-xl bg-white border border-gray-200">
                                    <p class="text-[11px] uppercase tracking-wide text-gray-500">Ausgaben</p>
                                    <p class="font-semibold text-gray-900">{euro(fy.outcome ?? 0)}</p>
                                </div>
                                <div class="px-3 py-2 rounded-xl bg-white border border-gray-200">
                                    <p class="text-[11px] uppercase tracking-wide text-gray-500">Saldo</p>
                                    <p class="font-semibold text-gray-900">{euro(fy.saldo ?? 0)}</p>
                                </div>
                                <div class="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200">
                                    <p class="text-[11px] uppercase tracking-wide text-amber-700">Offen</p>
                                    <p class="font-semibold text-amber-800">{euro(fy.outstanding ?? 0)}</p>
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
