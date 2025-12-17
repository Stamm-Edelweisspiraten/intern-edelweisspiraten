<script lang="ts">
    import { onDestroy } from "svelte";
    export let data;

    const outstandingByYear = data.outstandingByYear ?? [];
    const outstandingTotal = data.outstandingTotal ?? 0;
    const euro = (value: number) => `${value.toFixed(2)} EUR`;
    const currentYear = new Date().getFullYear();

    let showModal = false;
    let selected: any = null;
    let amount = 0;
    let date = new Date().toISOString().slice(0, 10);
    let note = "";
    let search = "";
    let prevOverflow = "";

    const matchItem = (item: any, term: string) => {
        if (!term) return true;
        const haystack = [
            item.title ?? "",
            item.type ?? "",
            item.note ?? "",
            `${item.amount ?? ""}`,
            `${item.payable ?? ""}`
        ]
            .join(" ")
            .toLowerCase();
        return haystack.includes(term);
    };

    $: filteredBlocks = outstandingByYear
        .map((block: any) => {
            const term = search.trim().toLowerCase();
            const items = (block.items ?? []).filter((item: any) => matchItem(item, term));
            return { ...block, items };
        })
        .filter((block: any) => block.items.length > 0 || !search.trim());

    const openModal = (item: any, year: any) => {
        selected = { ...item, fiscalYearId: year.id, year: year.year };
        amount = item.amount ?? 0;
        date = new Date().toISOString().slice(0, 10);
        note = "";
        showModal = true;
    };

    const closeModal = () => {
        showModal = false;
        selected = null;
    };

    $: if (typeof document !== "undefined") {
        if (showModal) {
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
    <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
            <p class="text-sm font-semibold text-gray-700 uppercase tracking-wide">Offene Eingaenge</p>
            <h1 class="text-4xl font-bold text-gray-900 mt-1">{euro(outstandingTotal)}</h1>
            <p class="text-sm text-gray-600 mt-1">Offene Positionen aus allen aktiven Geschaeftsjahren.</p>
        </div>
        <div class="flex items-center gap-3 flex-wrap">
            <input
                    type="search"
                    placeholder="Suchen..."
                    bind:value={search}
                    class="w-60 px-4 py-3 rounded-xl text-sm border border-gray-300 bg-white shadow-sm focus:ring-2 focus:ring-sky-200 focus:border-sky-300"
            />
            <a
                    href="/intern/finance"
                    class="inline-flex items-center gap-2 px-4 py-3 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl font-semibold text-gray-800 shadow-sm transition"
            >
                <span class="bi bi-arrow-left"></span>
                Zurueck
            </a>
        </div>
    </div>

    {#if filteredBlocks.length === 0}
        <div class="p-6 bg-white border border-gray-200 rounded-2xl shadow-sm">
            <p class="text-sm text-gray-500">Keine offenen Eingaenge in aktiven Geschaeftsjahren.</p>
        </div>
    {:else}
        <div class="space-y-5">
            {#each filteredBlocks as block}
                <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 space-y-4">
                    <div class="flex items-center justify-between flex-wrap gap-3">
                        <div>
                            <div class="flex items-center gap-2">
                                <h2 class="text-2xl font-bold text-gray-900">Jahr {block.year}</h2>
                                {#if block.year === currentYear}
                                    <span class="px-2 py-0.5 text-[11px] font-semibold text-sky-800 bg-sky-100 rounded-full border border-sky-200">
                                        Aktuelles Jahr
                                    </span>
                                {/if}
                            </div>
                            <p class="text-sm text-gray-600">{block.count} offene Position{block.count === 1 ? "" : "en"}</p>
                        </div>
                        <div class="text-right">
                            <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Offen</p>
                            <p class="text-2xl font-semibold text-sky-700">{euro(block.total)}</p>
                        </div>
                    </div>

                    <div class="overflow-x-auto hidden xl:block">
                        <table class="min-w-full divide-y divide-gray-200 text-sm">
                            <thead class="bg-gray-50">
                            <tr>
                                <th class="px-4 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide text-xs">Person</th>
                                <th class="px-4 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide text-xs">Art</th>
                                <th class="px-4 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide text-xs">Offen</th>
                                <th class="px-4 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide text-xs">Hinweis</th>
                                <th class="px-4 py-2"></th>
                            </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-100">
                            {#if block.items.length === 0}
                                <tr>
                                    <td colspan="5" class="px-4 py-4 text-center text-gray-500 text-sm">Keine offenen Positionen.</td>
                                </tr>
                            {:else}
                                {#each block.items as item}
                                    <tr class="hover:bg-gray-50">
                                        <td class="px-4 py-3">
                                            <div class="font-semibold text-gray-900">{item.title}</div>
                                            <div class="text-xs text-gray-500">#{item.invoiceId?.slice(0, 6) ?? item.id.slice(0, 6)}</div>
                                        </td>
                                        <td class="px-4 py-3 text-gray-700">{item.type}</td>
                                        <td class="px-4 py-3">
                                            <div class="text-gray-900 font-semibold">{euro(item.amount)}</div>
                                            {#if item.paid > 0}
                                                <div class="text-xs text-gray-500">bezahlt: {euro(item.paid)}</div>
                                            {/if}
                                        </td>
                                        <td class="px-4 py-3 text-gray-600">{item.note || "-"}</td>
                                        <td class="px-4 py-3 text-right">
                                            <button
                                                    type="button"
                                                    class="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition"
                                                    on:click={() => openModal(item, block)}
                                            >
                                                <span class="bi bi-check2-circle"></span>
                                                Hat bezahlt
                                            </button>
                                        </td>
                                    </tr>
                                {/each}
                            {/if}
                            </tbody>
                        </table>
                    </div>
                    <div class="xl:hidden divide-y divide-gray-200">
                        {#if block.items.length === 0}
                            <p class="text-sm text-gray-500 py-3">Keine offenen Positionen.</p>
                        {:else}
                            {#each block.items as item}
                                <div class="py-3 space-y-2">
                                    <div class="flex items-start justify-between gap-3">
                                        <div>
                                            <p class="text-base font-semibold text-gray-900">{item.title}</p>
                                            <p class="text-xs text-gray-500">#{item.invoiceId?.slice(0, 6) ?? item.id.slice(0, 6)}</p>
                                        </div>
                                        <span class="px-3 py-1 text-xs font-semibold rounded-full border border-gray-200 bg-gray-50 text-gray-700">
                                            {item.type}
                                        </span>
                                    </div>
                                    <div class="grid grid-cols-2 gap-2 text-sm text-gray-700">
                                        <div class="px-3 py-2 rounded-xl bg-gray-50 border border-gray-200">
                                            <p class="text-[11px] uppercase tracking-wide text-gray-500">Offen</p>
                                            <p class="font-semibold text-gray-900">{euro(item.amount)}</p>
                                            {#if item.paid > 0}
                                                <p class="text-xs text-gray-500">bezahlt: {euro(item.paid)}</p>
                                            {/if}
                                        </div>
                                        <div class="px-3 py-2 rounded-xl bg-gray-50 border border-gray-200">
                                            <p class="text-[11px] uppercase tracking-wide text-gray-500">Hinweis</p>
                                            <p class="font-semibold text-gray-900">{item.note || "-"}</p>
                                        </div>
                                    </div>
                                    <div class="flex justify-end">
                                        <button
                                                type="button"
                                                class="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition"
                                                on:click={() => openModal(item, block)}
                                        >
                                            <span class="bi bi-check2-circle"></span>
                                            Hat bezahlt
                                        </button>
                                    </div>
                                </div>
                            {/each}
                        {/if}
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

{#if showModal && selected}
    <div class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 px-4">
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200">
            <div class="flex items-start justify-between p-5 border-b border-gray-200">
                <div>
                    <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Abhaken</p>
                    <h3 class="text-xl font-bold text-gray-900 mt-1">{selected.title}</h3>
                    <p class="text-sm text-gray-600">Jahr {selected.year} &middot; {selected.type}</p>
                </div>
                <button class="text-gray-400 hover:text-gray-600" type="button" on:click={closeModal}>
                    <span class="bi bi-x-lg"></span>
                </button>
            </div>

            <form method="post" action="?/pay" class="p-5 space-y-4">
                <input type="hidden" name="fiscalYearId" value={selected.fiscalYearId} />
                <input type="hidden" name="itemId" value={selected.invoiceId ?? selected.id} />
                <input type="hidden" name="memberId" value={selected.memberId} />
                <input type="hidden" name="memberName" value={selected.title} />

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label class="flex flex-col gap-1 text-sm text-gray-700">
                        Betrag
                        <input
                                name="amount"
                                type="number"
                                min="0"
                                step="0.01"
                                bind:value={amount}
                                class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                        />
                    </label>
                    <label class="flex flex-col gap-1 text-sm text-gray-700">
                        Datum
                        <input
                                name="date"
                                type="date"
                                bind:value={date}
                                class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                        />
                    </label>
                </div>

                <label class="flex flex-col gap-1 text-sm text-gray-700">
                    Notiz (optional)
                    <input
                            name="note"
                            type="text"
                            placeholder="z.B. bar bezahlt"
                            bind:value={note}
                            class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                    />
                </label>

                <div class="flex items-center justify-end gap-3 pt-2">
                    <button
                            type="button"
                            class="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                            on:click={closeModal}
                    >
                        Abbrechen
                    </button>
                    <button
                            type="submit"
                            class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm"
                    >
                        <span class="bi bi-check2-circle"></span>
                        Hat bezahlt
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}
