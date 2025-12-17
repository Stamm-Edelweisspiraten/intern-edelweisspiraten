<script lang="ts">
    export let data;

    const fiscalYear = data.fiscalYear;
    const isArchived = (fiscalYear.status ?? "active") === "archived";
    const outstanding = data.outstanding ?? { total: 0, items: [] };
    const actions = data.actions ?? [];
    const memberOrders = data.memberOrders ?? [];
    const memberSuggestions = data.memberSuggestions ?? [];

    const euro = (value: number) => `${value.toFixed(2)} EUR`;

    const paidTransactions = (fiscalYear.transactions ?? []).filter((tx) => (tx.status ?? "paid") === "paid");

    const totals = paidTransactions.reduce(
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
    let txDirectionOpen = false;
    let dirDropdownRef: HTMLElement | null = null;
    let txKind = "custom";
    let txMember = "";
    let txMemberId = "";
    let txNote = "";
    let prevOverflow = "";

    const sortedTransactions = [...paidTransactions].sort((a, b) => {
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

    // Close custom dropdown when clicking outside
    import { onMount, onDestroy } from "svelte";
    onMount(() => {
        const handleClick = (event: MouseEvent) => {
            if (txDirectionOpen && dirDropdownRef && !dirDropdownRef.contains(event.target as Node)) {
                txDirectionOpen = false;
            }
        };
        window.addEventListener("click", handleClick);
        return () => window.removeEventListener("click", handleClick);
    });

    $: if (typeof document !== "undefined") {
        if (showTxModal) {
            prevOverflow = document.body.style.overflow;
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = prevOverflow;
        }
    }

    onDestroy(() => {
        if (typeof document !== "undefined") {
            document.body.style.overflow = prevOverflow;
        }
    });
</script>

<div class="max-w-6xl mx-auto mt-16 space-y-8">
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <div class="lg:col-span-2 p-6 bg-gradient-to-br from-sky-50 to-white border border-sky-100 rounded-2xl shadow-sm">
            <div class="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <p class="text-sm font-semibold text-sky-700 uppercase tracking-wide">Geschaeftsjahr</p>
                    <div class="flex items-center gap-3">
                        <h1 class="text-3xl font-bold text-gray-900">Jahr {fiscalYear.year}</h1>
                        {#if isArchived}
                            <span class="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700 border border-gray-200">
                                Archiviert
                            </span>
                        {/if}
                    </div>
                    <p class="text-sm text-gray-600 mt-1">
                        {#if isArchived}
                            Archivierte Geschaeftsjahre koennen nicht bearbeitet werden.
                        {:else}
                            Beitraege, Transaktionen und offene Posten im Blick.
                        {/if}
                    </p>
                </div>
                <div class="flex items-center gap-3">
                    <a
                            href="/intern/finance"
                            class="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-800 hover:bg-gray-50 shadow-sm"
                    >
                        <span class="bi bi-arrow-left"></span>
                        Zurueck
                    </a>
                    <button
                            type="button"
                            class={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold shadow ${isArchived ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 text-white"}`}
                            disabled={isArchived}
                            on:click={() => {
                                if (isArchived) return;
                                showTxModal = true;
                                txAmount = 0;
                                txDate = new Date().toISOString().slice(0, 10);
                                txDirection = "in";
                                txKind = "Jahresbeitrag";
                                txMember = "";
                                txMemberId = "";
                                txNote = "";
                            }}
                    >
                        <span class="bi bi-plus-circle"></span>
                        Transaktion
                    </button>
                </div>
            </div>
            <div class="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div class="p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
                    <p class="text-sm text-gray-500 flex items-center gap-2"><span class="bi bi-graph-up text-green-600"></span> Einnahmen</p>
                    <p class="text-2xl font-semibold text-green-600 mt-1">{euro(totals.in)}</p>
                </div>
                <div class="p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
                    <p class="text-sm text-gray-500 flex items-center gap-2"><span class="bi bi-graph-down text-red-500"></span> Ausgaben</p>
                    <p class="text-2xl font-semibold text-red-500 mt-1">{euro(totals.out)}</p>
                </div>
                <div class="p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
                    <p class="text-sm text-gray-500 flex items-center gap-2"><span class="bi bi-balance-scale"></span> Saldo</p>
                    <p class={`text-2xl font-semibold ${net >= 0 ? "text-green-600" : "text-red-500"} mt-1`}>{euro(net)}</p>
                </div>
            </div>
        </div>
        <a href={`/intern/finance/fiscal-years/${fiscalYear.id}/outstanding`} class="p-6 bg-white border border-gray-200 rounded-2xl shadow-sm hover:border-amber-200 hover:shadow cursor-pointer transition flex flex-col justify-between">
            <div>
                <p class="text-sm text-gray-500 flex items-center gap-2">
                    <span class="bi bi-exclamation-diamond text-amber-600"></span>
                    Ausstehende Einnahmen
                </p>
                <p class="text-3xl font-semibold text-amber-600 mt-2">{euro(outstandingTotal)}</p>
                {#if outstanding.items?.length}
                    <p class="text-xs text-gray-500 mt-1">{outstanding.items.length} offene Position{outstanding.items.length === 1 ? "" : "en"}</p>
                {:else}
                    <p class="text-xs text-gray-500 mt-1">Keine offenen Posten.</p>
                {/if}
            </div>
            <p class="text-sm font-semibold text-blue-600 mt-4 inline-flex items-center gap-1">
                Mehr erfahren <span class="bi bi-arrow-right"></span>
            </p>
        </a>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 bg-white border border-gray-200 rounded-2xl shadow-sm p-4 sm:p-6 space-y-4">
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

        <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 sm:p-6 space-y-4">
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
                <div class="grid grid-cols-1 gap-2">
                    <a href={`/intern/finance/fiscal-years/${fiscalYear.id}/outstanding`} class="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl font-semibold hover:bg-blue-100 transition">
                        <span class="bi bi-cash-stack"></span>
                        Offene Einnahmen
                    </a>
                    <button class="w-full px-4 py-3 bg-gray-100 text-gray-800 rounded-xl font-semibold cursor-not-allowed">
                        Export (soon)
                    </button>
                    <button class="w-full px-4 py-3 bg-gray-100 text-gray-800 rounded-xl font-semibold cursor-not-allowed">
                        Archivieren (soon)
                    </button>
                </div>
            </div>
        </div>
    </div>

    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 sm:p-6 space-y-4">
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
        <div class="px-4 sm:px-6 py-4 flex items-start sm:items-center justify-between gap-3 flex-wrap">
            <div class="flex items-center gap-2">
                <h2 class="text-xl font-semibold text-gray-900">Transaktionen</h2>
                <span class="text-sm text-gray-500">({filteredTransactions.length}/{paidTransactions.length})</span>
            </div>
            <div class="flex items-center gap-3 w-full sm:w-auto">
                <button
                        class={`flex-1 sm:flex-none px-4 py-2 text-sm font-semibold rounded-lg ${isArchived ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 text-white"}`}
                        on:click={() => {
                            if (isArchived) return;
                            showTxModal = true;
                            txAmount = 0;
                            txDate = new Date().toISOString().slice(0, 10);
                            txDirection = "in";
                            txKind = "custom";
                            txMember = "";
                            txNote = "";
                            txMemberId = "";
                        }}
                        type="button"
                        disabled={isArchived}
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
        <div class="overflow-x-auto hidden xl:block">
            <table class="w-full min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                <tr>
                    <th class="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Richtung</th>
                    <th class="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Datum</th>
                    <th class="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Mitglied</th>
                    <th class="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Typ</th>
                    <th class="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Betrag</th>
                    <th class="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Notiz</th>
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
                            <td class="px-4 sm:px-6 py-4 text-sm text-gray-700">
                                {#if tx.direction === "in"}
                                    <span class="inline-flex items-center gap-2 text-green-600 font-semibold">
                                        <span class="bi bi-graph-up-arrow"></span>
                                        <span>Eingang</span>
                                    </span>
                                {:else}
                                    <span class="inline-flex items-center gap-2 text-red-500 font-semibold">
                                        <span class="bi bi-graph-down-arrow"></span>
                                        <span>Ausgang</span>
                                    </span>
                                {/if}
                            </td>
                            <td class="px-4 sm:px-6 py-4 text-sm text-gray-700">{tx.date}</td>
                            <td class="px-4 sm:px-6 py-4 text-sm text-gray-900 font-semibold">{tx.member}</td>
                            <td class="px-4 sm:px-6 py-4 text-sm text-gray-700 uppercase tracking-wide">{tx.kind}</td>
                            <td class="px-4 sm:px-6 py-4 text-sm text-gray-900 font-semibold">{euro(tx.amount)}</td>
                            <td class="px-4 sm:px-6 py-4 text-sm text-gray-600">{tx.note ?? "-"}</td>
                        </tr>
                    {/each}
                {/if}
                </tbody>
            </table>
        </div>
        <div class="xl:hidden divide-y divide-gray-200">
            {#if filteredTransactions.length === 0}
                <div class="px-4 py-4 text-center text-sm text-gray-500">Keine passenden Transaktionen gefunden.</div>
            {:else}
                {#each filteredTransactions as tx}
                    <div class="p-4 space-y-2">
                        <div class="flex items-start justify-between gap-3">
                            <div>
                                <p class="text-sm font-semibold text-gray-900">{tx.direction === "in" ? "Eingang" : "Ausgang"} · {tx.date?.slice(0, 10) ?? "-"}</p>
                                <p class="text-xs text-gray-600">{tx.member ?? "-"}</p>
                            </div>
                            <span class={`px-3 py-1 text-xs font-semibold rounded-full border ${tx.direction === "in" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
                                {tx.direction === "in" ? "Eingang" : "Ausgang"}
                            </span>
                        </div>
                        <div class="grid grid-cols-2 gap-2 text-sm text-gray-700">
                            <div class="px-3 py-2 rounded-xl bg-gray-50 border border-gray-200">
                                <p class="text-[11px] uppercase tracking-wide text-gray-500">Typ</p>
                                <p class="font-semibold text-gray-900">{tx.kind}</p>
                            </div>
                            <div class="px-3 py-2 rounded-xl bg-gray-50 border border-gray-200">
                                <p class="text-[11px] uppercase tracking-wide text-gray-500">Betrag</p>
                                <p class="font-semibold text-gray-900">{euro(tx.amount ?? 0)}</p>
                            </div>
                        </div>
                        {#if tx.note}
                            <p class="text-xs text-gray-600">Notiz: {tx.note}</p>
                        {/if}
                    </div>
                {/each}
            {/if}
        </div>
    </div>
</div>

{#if showTxModal}
    <div class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 px-4">
        <form method="post" action="?/addTransaction" class="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 max-h-[90vh] overflow-hidden flex flex-col">
            <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                    <p class="text-sm text-gray-500">Transaktion hinzufuegen</p>
                    <h3 class="text-lg font-semibold text-gray-900">Geschaeftsjahr {fiscalYear.year}</h3>
                </div>
                <button type="button" class="text-gray-400 hover:text-gray-600" on:click={() => (showTxModal = false)}>X</button>
            </div>
            {#if isArchived}
                <div class="px-6 py-3 bg-amber-50 text-amber-800 border-b border-amber-100 text-sm">
                    Dieses Geschaeftsjahr ist archiviert. Neue Transaktionen koennen nicht erfasst werden.
                </div>
            {/if}
            <div class="px-6 py-5 space-y-4 overflow-y-auto">
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
                        <div class="relative" bind:this={dirDropdownRef}>
                            <button
                                    type="button"
                                    class="w-full rounded-lg px-3 py-2 flex items-center justify-between gap-2 bg-white shadow-sm hover:shadow border border-gray-300"
                                    on:click={() => (txDirectionOpen = !txDirectionOpen)}
                            >
                                <div class="flex items-center gap-2">
                                    {#if txDirection === "in"}
                                        <i class="bi bi-graph-up-arrow text-sm text-green-600"></i>
                                        <span class="text-green-700 font-semibold">Eingang</span>
                                    {:else}
                                        <i class="bi bi-graph-down-arrow text-sm text-red-600"></i>
                                        <span class="text-red-600 font-semibold">Ausgang</span>
                                    {/if}
                                </div>
                                <i class={`bi ${txDirectionOpen ? "bi-chevron-up" : "bi-chevron-down"} text-gray-500 text-sm`}></i>
                            </button>

                            {#if txDirectionOpen}
                                <ul class="absolute z-10 w-full bg-white border border-gray-300 rounded-lg mt-1 shadow">
                                    <li
                                            class="px-3 py-2 flex items-center gap-2 cursor-pointer hover:bg-gray-100"
                                            on:click={() => { txDirection = "in"; txDirectionOpen = false; }}
                                    >
                                        <i class="bi bi-graph-up-arrow text-sm text-green-600"></i>
                                        <span class="text-green-600">Eingang</span>
                                    </li>
                                    <li
                                            class="px-3 py-2 flex items-center gap-2 cursor-pointer hover:bg-gray-100"
                                            on:click={() => { txDirection = "out"; txDirectionOpen = false; }}
                                    >
                                        <i class="bi bi-graph-down-arrow text-sm text-red-600"></i>
                                        <span class="text-red-600">Ausgang</span>
                                    </li>
                                </ul>
                            {/if}
                        </div>
                        <input type="hidden" name="direction" value={txDirection} />
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-2">Typ</label>
                    <select
                            class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-2"
                            bind:value={txKind}
                            on:change={(e) => { txKind = (e.target as HTMLSelectElement).value; }}
                    >
                        <option value="Jahresbeitrag">Jahresbeitrag</option>
                        <option value="Öffentlichkeitsarbeit">Öffentlichkeitsarbeit</option>
                        <option value="Lager/Aktion">Lager/Aktion</option>
                        <option value="Pfadverlag">Pfadverlag</option>
                        <option value="custom">Anderer Typ</option>
                    </select>
                    <input
                            name="kind"
                            type="text"
                            class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            bind:value={txKind}
                            placeholder="Typ eintragen oder aus Liste wählen"
                    />
                </div>
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-2">Mitglied / Gegenpartei</label>
                    <select
                            name="memberId"
                            class="w-full border border-gray-300 rounded-lg px-3 py-2 mb-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            bind:value={txMemberId}
                            on:change={() => {
                                const selected = memberSuggestions.find((m) => m.id === txMemberId);
                                if (selected) txMember = selected.name;
                            }}
                    >
                        <option value="">Kein Mitglied / frei eingeben</option>
                        {#each memberSuggestions as m}
                            <option value={m.id}>{m.name}</option>
                        {/each}
                    </select>
                    <input
                            name="member"
                            type="text"
                            class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Optional: Name/Gegenpartei"
                            bind:value={txMember}
                    />
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
                class={`px-4 py-2 text-sm font-semibold rounded-lg ${isArchived ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 text-white"}`}
                disabled={isArchived}
        >
            Speichern
        </button>
            </div>
        </form>
    </div>
{/if}
