<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    export let data;

    const fiscalYear = data.fiscalYear;
    const outstanding = data.outstanding ?? { total: 0, items: [] };
    const memberSuggestions = data.memberSuggestions ?? [];
    const euro = (value: number) => `${value.toFixed(2)} EUR`;

    let search = "";
    let showModal = false;
    let selected: any = null;
    let amount = 0;
    let date = new Date().toISOString().slice(0, 10);
    let note = "";
    let prevOverflow = "";
    let showCreateModal = false;
    let newMemberName = "";
    let newMemberId = "";
    let newKind = "Jahresbeitrag";
    let newAmount = 0;
    let newDate = new Date().toISOString().slice(0, 10);
    let newNote = "";
    let memberOpen = false;
    let kindOpen = false;
    let memberDropdownRef: HTMLElement | null = null;
    let kindDropdownRef: HTMLElement | null = null;
    const kindOptions = ["Jahresbeitrag", "Pfadverlag", "Lager/Aktion"];

    $: if (newMemberName && memberSuggestions?.length) {
        const match = memberSuggestions.find((m: any) => m.name.toLowerCase() === newMemberName.toLowerCase());
        newMemberId = match?.id ?? newMemberId;
    }

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

    $: filteredItems = (outstanding.items ?? []).filter((item: any) =>
        matchItem(item, search.trim().toLowerCase())
    );

    const openModal = (item: any) => {
        selected = item;
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
        if (showModal || showCreateModal) {
            prevOverflow = document.body.style.overflow;
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = prevOverflow;
        }
    }

    onMount(() => {
        const handleClick = (event: MouseEvent) => {
            const target = event.target as Node;
            if (memberOpen && memberDropdownRef && !memberDropdownRef.contains(target)) {
                memberOpen = false;
            }
            if (kindOpen && kindDropdownRef && !kindDropdownRef.contains(target)) {
                kindOpen = false;
            }
        };
        window.addEventListener("click", handleClick);
        return () => window.removeEventListener("click", handleClick);
    });

    onDestroy(() => {
        if (typeof document !== "undefined") {
            document.body.style.overflow = prevOverflow;
        }
    });
</script>

<div class="max-w-6xl mx-auto mt-16 space-y-8">
    <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
            <p class="text-sm font-semibold text-gray-700 uppercase tracking-wide">Ausstehende Einnahmen</p>
            <h1 class="text-4xl font-bold text-gray-900 mt-1">Geschaeftsjahr {fiscalYear.year}</h1>
            <p class="text-sm text-gray-600 mt-1">{filteredItems.length} offene Position{filteredItems.length === 1 ? "" : "en"}.</p>
        </div>
        <a
                href={`/intern/finance/fiscal-years/${fiscalYear.id}`}
                class="inline-flex items-center gap-2 px-4 py-3 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl font-semibold text-gray-800 shadow-sm transition"
        >
            <span class="bi bi-arrow-left"></span>
            Zurueck
        </a>
    </div>

    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 md:p-6 flex flex-col gap-4">
        <div class="flex items-start justify-between gap-4 flex-wrap">
            <div>
                <p class="text-sm font-semibold text-gray-700 uppercase tracking-wide">Gesamt offen</p>
                <h2 class="text-3xl font-bold text-gray-900 mt-1">{euro(outstanding.total ?? 0)}</h2>
                <p class="text-sm text-gray-600 mt-1">Offene Positionen in diesem Geschaeftsjahr.</p>
            </div>
            <div class="flex items-center gap-3 flex-wrap">
                <input
                        type="search"
                        placeholder="Suchen..."
                        bind:value={search}
                        class="w-60 px-4 py-3 rounded-xl text-sm border border-gray-300 bg-white shadow-sm focus:ring-2 focus:ring-sky-200 focus:border-sky-300"
                />
                <button
                        type="button"
                        class="inline-flex items-center gap-2 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-semibold shadow-sm transition"
                        on:click={() => { showCreateModal = true; }}
                >
                    <span class="bi bi-file-earmark-plus"></span>
                    Offene Rechnung
                </button>
                <span class="px-3 py-1 text-xs font-semibold text-sky-800 bg-sky-100 rounded-full border border-sky-200">
                    {filteredItems.length} offen
                </span>
            </div>
        </div>
    </div>

    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
        {#if filteredItems.length === 0}
            <p class="text-sm text-gray-500">Keine offenen Einnahmen hinterlegt.</p>
        {:else}
            <div class="overflow-x-auto">
                <table class="w-full min-w-[800px] divide-y divide-gray-200 text-sm">
                    <thead class="bg-gray-50">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Mitglied</th>
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Typ</th>
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Offen</th>
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Notiz</th>
                        <th class="px-6 py-3"></th>
                    </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                    {#each filteredItems as item}
                        <tr class="hover:bg-gray-50 transition">
                            <td class="px-6 py-4 text-sm font-semibold text-gray-900">
                                <div>{item.title}</div>
                                <div class="text-xs text-gray-500">#{item.invoiceId?.slice(0, 6) ?? item.id.slice(0, 6)}</div>
                            </td>
                            <td class="px-6 py-4 text-sm text-gray-700">{item.type}</td>
                            <td class="px-6 py-4 text-sm">
                                <div class="text-gray-900 font-semibold">{euro(item.amount)}</div>
                                {#if item.paid > 0}
                                    <div class="text-xs text-gray-500">bezahlt: {euro(item.paid)}</div>
                                {/if}
                            </td>
                            <td class="px-6 py-4 text-sm text-gray-600">{item.note || "—"}</td>
                            <td class="px-6 py-4 text-right">
                                <button
                                        type="button"
                                        class="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition"
                                        on:click={() => openModal(item)}
                                >
                                    <span class="bi bi-check2-circle"></span>
                                    Hat bezahlt
                                </button>
                            </td>
                        </tr>
                    {/each}
                    </tbody>
                </table>
            </div>
        {/if}
    </div>
</div>

{#if showModal && selected}
    <div class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 px-4">
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200">
            <div class="flex items-start justify-between p-5 border-b border-gray-200">
                <div>
                    <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Abhaken</p>
                    <h3 class="text-xl font-bold text-gray-900 mt-1">{selected.title}</h3>
                    <p class="text-sm text-gray-600">{selected.type}</p>
                </div>
                <button class="text-gray-400 hover:text-gray-600" type="button" on:click={closeModal}>
                    <span class="bi bi-x-lg"></span>
                </button>
            </div>

            <form method="post" action="?/pay" class="p-5 space-y-4">
                <input type="hidden" name="fiscalYearId" value={fiscalYear.id} />
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

{#if showCreateModal}
    <div class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 px-4">
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200">
            <div class="flex items-start justify-between p-5 border-b border-gray-200">
                <div>
                    <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Neue offene Rechnung</p>
                    <h3 class="text-xl font-bold text-gray-900 mt-1">Geschaeftsjahr {fiscalYear.year}</h3>
                </div>
                <button class="text-gray-400 hover:text-gray-600" type="button" on:click={() => (showCreateModal = false)}>
                    <span class="bi bi-x-lg"></span>
                </button>
            </div>

            <form method="post" action="?/addPending" class="p-5 space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label class="flex flex-col gap-1 text-sm text-gray-700 relative">
                        Mitglied (Name)
                        <div class="relative" bind:this={memberDropdownRef}>
                            <input
                                    name="memberName"
                                    type="text"
                                    bind:value={newMemberName}
                                    placeholder="Name"
                                    class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                                    on:focus={() => (memberOpen = true)}
                                    on:input={() => (memberOpen = true)}
                            />
                            {#if memberOpen && (memberSuggestions?.length ?? 0) > 0}
                                <div class="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-auto">
                                    {#each memberSuggestions.filter((m) => m.name.toLowerCase().includes(newMemberName.toLowerCase())) as m}
                                        <button
                                                type="button"
                                                class="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                                on:click={() => {
                                                    newMemberName = m.name;
                                                    newMemberId = m.id;
                                                    memberOpen = false;
                                                }}
                                        >
                                            {m.name}
                                        </button>
                                    {/each}
                                    {#if memberSuggestions.filter((m) => m.name.toLowerCase().includes(newMemberName.toLowerCase())).length === 0}
                                        <div class="px-3 py-2 text-sm text-gray-500">Keine Treffer</div>
                                    {/if}
                                </div>
                            {/if}
                        </div>
                        <span class="text-xs text-gray-500">Bei Auswahl wird die ID automatisch gesetzt.</span>
                    </label>
                    <label class="flex flex-col gap-1 text-sm text-gray-700">
                        Mitglied-ID (optional)
                        <input
                                name="memberId"
                                type="text"
                                bind:value={newMemberId}
                                placeholder="ID falls bekannt"
                                class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                        />
                    </label>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label class="flex flex-col gap-1 text-sm text-gray-700">
                        Betrag
                        <input
                                name="amount"
                                type="number"
                                min="0"
                                step="0.01"
                                bind:value={newAmount}
                                class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                        />
                    </label>
                    <label class="flex flex-col gap-1 text-sm text-gray-700">
                        Datum
                        <input
                                name="date"
                                type="date"
                                bind:value={newDate}
                                class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                        />
                    </label>
                </div>

                <label class="flex flex-col gap-1 text-sm text-gray-700 relative">
                    Art
                    <div class="relative" bind:this={kindDropdownRef}>
                        <input
                                name="kind"
                                type="text"
                                bind:value={newKind}
                                class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                                on:focus={() => (kindOpen = true)}
                                on:input={() => (kindOpen = true)}
                        />
                        {#if kindOpen}
                            <div class="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-auto">
                                {#each kindOptions.filter((k) => k.toLowerCase().includes(newKind.toLowerCase())) as option}
                                    <button
                                            type="button"
                                            class="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                            on:click={() => {
                                                newKind = option;
                                                kindOpen = false;
                                            }}
                                    >
                                        {option}
                                    </button>
                                {/each}
                                {#if kindOptions.filter((k) => k.toLowerCase().includes(newKind.toLowerCase())).length === 0}
                                    <div class="px-3 py-2 text-sm text-gray-500">Keine Treffer</div>
                                {/if}
                            </div>
                        {/if}
                    </div>
                </label>

                <label class="flex flex-col gap-1 text-sm text-gray-700">
                    Notiz (optional)
                    <input
                            name="note"
                            type="text"
                            bind:value={newNote}
                            placeholder="z.B. bar faellig"
                            class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                    />
                </label>

                <div class="flex items-center justify-end gap-3 pt-2">
                    <button
                            type="button"
                            class="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                            on:click={() => (showCreateModal = false)}
                    >
                        Abbrechen
                    </button>
                    <button
                            type="submit"
                            class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm"
                    >
                        <span class="bi bi-plus-circle"></span>
                        Offene Rechnung anlegen
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}
