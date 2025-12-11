<script lang="ts">
    export let data;

    const fiscalYear = data.fiscalYear;
    const outstanding = data.outstanding ?? { total: 0, items: [] };
    const actions = data.actions ?? [];
    const memberOrders = data.memberOrders ?? [];
    const memberSuggestions = data.memberSuggestions ?? [];

    const euro = (value: number) => `${value.toFixed(2)} EUR`;

    const totals = (fiscalYear.transactions ?? []).reduce(
        (acc: { in: number; out: number }, tx) => {
            if (tx.direction === "in") acc.in += Number(tx.amount) || 0;
            if (tx.direction === "out") acc.out += Number(tx.amount) || 0;
            return acc;
        },
        { in: 0, out: 0 }
    );

    const net = totals.in - totals.out;
    const outstandingTotal = outstanding.total ?? 0;

    let searchTerm = "";
    let showTxModal = false;
    let txAmount = 0;
    let txDate = new Date().toISOString().slice(0, 10);
    let txDirection: "in" | "out" = "in";
    let txKind = "custom";
    let txMember = "";
    let txNote = "";

    const sortedTransactions = [...(fiscalYear.transactions ?? [])].sort((a, b) => {
        const ad = new Date(a.date ?? 0).getTime();
        const bd = new Date(b.date ?? 0).getTime();
        return bd - ad;
    });

    $: filteredTransactions = sortedTransactions.filter((tx) => {
        if (!searchTerm) return true;
        const q = searchTerm.toLowerCase();
        return (
            tx.member?.toLowerCase().includes(q) ||
            tx.kind?.toLowerCase().includes(q) ||
            tx.note?.toLowerCase().includes(q) ||
            tx.date?.toLowerCase().includes(q) ||
            `${tx.amount}`.includes(q)
        );
    });
</script>

<div class="max-w-6xl mx-auto mt-16 space-y-8">
    <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
            <h1 class="text-3xl font-bold text-gray-900">Geschaeftsjahr {fiscalYear.year}</h1>
            <p class="text-gray-600 mt-1">Beitraege und Transaktionen fuer dieses Jahr.</p>
        </div>
        <div class="flex items-center gap-3 flex-wrap">
            <a
                    href="/intern/finance/fiscal-years"
                    class="text-sm font-semibold text-blue-600 hover:text-blue-700"
            >
                Zurueck zur Uebersicht
            </a>
        </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
            <p class="text-sm text-gray-500">Einnahmen</p>
            <p class="text-2xl font-semibold text-green-600">{euro(totals.in)}</p>
        </div>
        <div class="p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
            <p class="text-sm text-gray-500">Ausgaben</p>
            <p class="text-2xl font-semibold text-red-500">{euro(totals.out)}</p>
        </div>
        <div class="p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
            <p class="text-sm text-gray-500">Saldo</p>
            <p class={`text-2xl font-semibold ${net >= 0 ? "text-green-600" : "text-red-500"}`}>{euro(net)}</p>
        </div>
        <a href={`/intern/finance/fiscal-years/${fiscalYear.id}/outstanding`} class="p-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-amber-200 hover:shadow cursor-pointer transition">
            <p class="text-sm text-gray-500">Ausstehende Einnahmen</p>
            <p class="text-2xl font-semibold text-amber-600">{euro(outstandingTotal)}</p>
            {#if outstanding.items?.length}
                <p class="text-xs text-gray-500 mt-1">{outstanding.items.length} offene Position{outstanding.items.length === 1 ? "" : "en"}</p>
            {:else}
                <p class="text-xs text-gray-500 mt-1">Keine offenen Posten.</p>
            {/if}
        </a>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
            <h2 class="text-xl font-semibold text-gray-900">Jahresbeitrag</h2>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div class="p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <p class="text-sm text-gray-500">Stamm</p>
                    <p class="text-lg font-semibold text-gray-900">{euro(fiscalYear.dues.stamm)}</p>
                </div>
                <div class="p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <p class="text-sm text-gray-500">Gau</p>
                    <p class="text-lg font-semibold text-gray-900">{euro(fiscalYear.dues.gau)}</p>
                </div>
                <div class="p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <p class="text-sm text-gray-500">Landesmark</p>
                    <p class="text-lg font-semibold text-gray-900">{euro(fiscalYear.dues.landesmark)}</p>
                </div>
                <div class="p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <p class="text-sm text-gray-500">Bund</p>
                    <p class="text-lg font-semibold text-gray-900">{euro(fiscalYear.dues.bund)}</p>
                </div>
            </div>
            <p class="text-sm text-gray-600">
                Gesamt: {euro(fiscalYear.dues.stamm + fiscalYear.dues.gau + fiscalYear.dues.landesmark + fiscalYear.dues.bund)}
            </p>
        </div>

        <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
            <h2 class="text-xl font-semibold text-gray-900">Aktionen</h2>
            <div class="space-y-3">
                {#if actions.length === 0}
                    <p class="text-sm text-gray-500">Keine Aktionen hinterlegt.</p>
                {:else}
                    <ul class="space-y-2 text-sm text-gray-800">
                        {#each actions as action}
                            <li class="p-3 border border-gray-200 rounded-lg bg-gray-50">
                                <p class="font-semibold">{action.title}</p>
                                {#if action.note}<p class="text-xs text-gray-500 mt-1">{action.note}</p>{/if}
                            </li>
                        {/each}
                    </ul>
                {/if}
                <button class="w-full px-4 py-3 bg-gray-100 text-gray-800 rounded-xl font-semibold cursor-not-allowed">
                    Export (soon)
                </button>
                <button class="w-full px-4 py-3 bg-gray-100 text-gray-800 rounded-xl font-semibold cursor-not-allowed">
                    Archive (soon)
                </button>
            </div>
        </div>
    </div>

    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
        <h2 class="text-xl font-semibold text-gray-900">Bestellungen / Sonstige Posten</h2>
        {#if memberOrders.length}
            <ul class="divide-y divide-gray-200">
                {#each memberOrders as order}
                    <li class="py-3 flex items-center justify-between">
                        <div>
                            <p class="font-semibold text-gray-900">{order.item}</p>
                            <p class="text-xs text-gray-500 mt-1">{order.member}</p>
                        </div>
                        <span class="text-sm font-semibold text-gray-800">{euro(order.amount)}</span>
                    </li>
                {/each}
            </ul>
        {:else}
            <p class="text-sm text-gray-500">Keine Bestellungen oder weiteren Posten erfasst.</p>
        {/if}
    </div>

    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div class="px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
            <div class="flex items-center gap-2">
                <h2 class="text-xl font-semibold text-gray-900">Transaktionen</h2>
                <span class="text-sm text-gray-500">({filteredTransactions.length}/{fiscalYear.transactions.length})</span>
            </div>
            <div class="flex items-center gap-3">
                <button
                        class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg"
                        on:click={() => {
                            showTxModal = true;
                            txAmount = 0;
                            txDate = new Date().toISOString().slice(0, 10);
                            txDirection = "in";
                            txKind = "custom";
                            txMember = "";
                            txNote = "";
                        }}
                        type="button"
                >
                    Transaktion hinzufuegen
                </button>
                <div class="w-full sm:w-64">
                    <input
                            type="search"
                            placeholder="Transaktionen suchen"
                            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            bind:value={searchTerm}
                    />
                </div>
            </div>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                <tr>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Datum</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Mitglied</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Typ</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Richtung</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Betrag</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Notiz</th>
                </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                {#if filteredTransactions.length === 0}
                    <tr>
                        <td colspan="6" class="px-6 py-6 text-center text-sm text-gray-500">
                            Keine passenden Transaktionen gefunden.
                        </td>
                    </tr>
                {:else}
                    {#each filteredTransactions as tx}
                        <tr class="hover:bg-gray-50 transition">
                            <td class="px-6 py-4 text-sm text-gray-700">{tx.date}</td>
                            <td class="px-6 py-4 text-sm text-gray-900 font-semibold">{tx.member}</td>
                            <td class="px-6 py-4 text-sm text-gray-700 uppercase tracking-wide">{tx.kind}</td>
                            <td class="px-6 py-4 text-sm text-gray-700">
                                {#if tx.direction === "in"}
                                    <span class="inline-flex items-center gap-2 text-green-600 font-semibold">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-graph-up-arrow" viewBox="0 0 16 16">
                                            <path fill-rule="evenodd" d="M0 0h1v15h15v1H0zm10 3.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0V4.9l-3.613 4.417a.5.5 0 0 1-.74.037L7.06 6.767l-3.656 5.027a.5.5 0 0 1-.808-.588l4-5.5a.5.5 0 0 1 .758-.06l2.609 2.61L13.445 4H10.5a.5.5 0 0 1-.5-.5"/>
                                        </svg>
                                        <span>Eingang</span>
                                    </span>
                                {:else}
                                    <span class="inline-flex items-center gap-2 text-red-500 font-semibold">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-graph-down-arrow" viewBox="0 0 16 16">
                                            <path fill-rule="evenodd" d="M0 0h1v15h15v1H0zm10 11.5a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 0-1 0v2.6l-3.613-4.417a.5.5 0 0 0-.74-.037L7.06 8.233 3.404 3.206a.5.5 0 0 0-.808.588l4 5.5a.5.5 0 0 0 .758.06l2.609-2.61L13.445 11H10.5a.5.5 0 0 0-.5.5"/>
                                        </svg>
                                        <span>Ausgang</span>
                                    </span>
                                {/if}
                            </td>
                            <td class="px-6 py-4 text-sm text-gray-900 font-semibold">{euro(tx.amount)}</td>
                            <td class="px-6 py-4 text-sm text-gray-600">{tx.note ?? "-"}</td>
                        </tr>
                    {/each}
                {/if}
                </tbody>
            </table>
        </div>
    </div>
</div>

{#if showTxModal}
    <div class="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 px-4">
        <form method="post" action="?/addTransaction" class="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-200">
            <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                    <p class="text-sm text-gray-500">Transaktion hinzufuegen</p>
                    <h3 class="text-lg font-semibold text-gray-900">Geschaeftsjahr {fiscalYear.year}</h3>
                </div>
                <button type="button" class="text-gray-400 hover:text-gray-600" on:click={() => (showTxModal = false)}>X</button>
            </div>
            <div class="px-6 py-5 space-y-4">
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-2">Betrag</label>
                    <input
                            name="amount"
                            type="number"
                            step="0.01"
                            min="0"
                            class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            bind:value={txAmount}
                    />
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">Datum</label>
                        <input
                                name="date"
                                type="date"
                                class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                bind:value={txDate}
                        />
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">Richtung</label>
                        <select
                                name="direction"
                                class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                bind:value={txDirection}
                        >
                            <option value="in">Eingang</option>
                            <option value="out">Ausgang</option>
                        </select>
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-2">Typ</label>
                    <input
                            name="kind"
                            type="text"
                            class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            bind:value={txKind}
                            placeholder="z. B. dues, donation, equipment"
                    />
                </div>
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-2">Mitglied / Gegenpartei</label>
                    <input
                            name="member"
                            type="text"
                            list="member-list"
                            class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            bind:value={txMember}
                    />
                    <datalist id="member-list">
                        {#each memberSuggestions as m}
                            <option value={m.name}>{m.name}</option>
                        {/each}
                    </datalist>
                </div>
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-2">Notiz (optional)</label>
                    <input
                            name="note"
                            type="text"
                            class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            bind:value={txNote}
                    />
                </div>
            </div>
            <div class="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                <button
                        type="button"
                        class="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800"
                        on:click={() => (showTxModal = false)}
                >
                    Abbrechen
                </button>
                <button
                        type="submit"
                        class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg"
                >
                    Speichern
                </button>
            </div>
        </form>
    </div>
{/if}

