<script lang="ts">
    import { enhance } from "$app/forms";
    import type { SubmitFunction } from "@sveltejs/kit";
    import { onMount } from "svelte";
    export let data;

    const fiscalYear = data.fiscalYear;
    let outstandingItems = (data.outstanding?.items ?? []).slice();
    let payments: Record<string, { total: number; entries: { id?: string; amount: number; date: string; note?: string }[] }> = data.payments ?? {};
    const memberSuggestions = data.memberSuggestions ?? [];

    const euro = (value: number) => `${value.toFixed(2)} EUR`;

    let showModal = false;
    let selected: any = null;
    let paidAmount = 0;
    let paidDate = new Date().toISOString().slice(0, 10);
    let note = "";
    let editTransactionId: string | null = null;
    let handleEnhance: any = () => {};
    let search = "";

    let showCreateModal = false;
    let newMemberName = "";
    let newMemberId = "";
    let newKind = "Jahresbeitrag";
    let newAmount = 0;
    let newDate = new Date().toISOString().slice(0, 10);
    let newNote = "";

    const openModal = (item: any, tx?: { id?: string; amount: number; date: string; note?: string }) => {
        selected = item;
        if (tx) {
            editTransactionId = tx.id ?? null;
            paidAmount = tx.amount;
            paidDate = tx.date;
            note = tx.note ?? "";
        } else {
            editTransactionId = null;
            paidAmount = item.amount > 0 ? item.amount : item.payable;
            paidDate = new Date().toISOString().slice(0, 10);
            note = "";
        }
        showModal = true;
    };

    const closeModal = () => {
        showModal = false;
        selected = null;
    };

    onMount(() => {
        handleEnhance = enhance(async ({ result, update }) => {
            if (result.type !== "success" || !result.data?.payment) return;
            const { invoiceId, transactionId, amount, date, note, remaining } = result.data.payment;

            const key = invoiceId || selected?.invoiceId || selected?.id;
            if (!key) return;

            const existing = payments[key] ?? { total: 0, entries: [] };
            let entries = existing.entries.slice();

            if (transactionId) {
                const idx = entries.findIndex((e) => e.id === transactionId);
                if (idx >= 0) {
                    entries[idx] = { ...entries[idx], id: transactionId, amount, date, note };
                } else {
                    entries = [...entries, { id: transactionId, amount, date, note }];
                }
            } else {
                entries = [...entries, { amount, date, note }];
            }

            const total = entries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

            payments = {
                ...payments,
                [key]: { total, entries }
            };

            showModal = false;
            if (remaining !== undefined && selected?.id) {
                outstandingItems = outstandingItems
                    .map((item) =>
                        item.id === selected.id
                            ? { ...item, amount: remaining, paid: (item.paid ?? 0) + amount }
                            : item
                    )
                    .filter((item) => item.amount > 0);
            }

            await update();
        });
    });

    const applyMemberSuggestion = (value: string) => {
        newMemberName = value;
        const found = memberSuggestions.find((m: any) => m.name.toLowerCase() === value.toLowerCase());
        newMemberId = found?.id ?? "";
    };

    $: outstandingTotal = outstandingItems.reduce((sum, item) => sum + (Number(item.amount ?? item.payable ?? 0) || 0), 0);

    $: filteredItems = (outstandingItems ?? []).filter((item: any) => {
        if (!search.trim()) return true;
        const term = search.toLowerCase();
        const textFields = [
            item.title ?? "",
            item.type ?? "",
            euro(item.payable),
            euro(item.amount),
            (item.note ?? "")
        ].join(" ").toLowerCase();
        return textFields.includes(term);
    });

    const onCreatePending: SubmitFunction = ({ update }) => {
        return async ({ result }) => {
            if (result.type === "success" && result.data?.pending) {
                outstandingItems = [...outstandingItems, result.data.pending];
                showCreateModal = false;
                newAmount = 0;
                newDate = new Date().toISOString().slice(0, 10);
                newKind = "Jahresbeitrag";
                newNote = "";
                newMemberName = "";
                newMemberId = "";
                await update();
            }
        };
    };
</script>

<div class="max-w-6xl mx-auto mt-16 space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
            <h1 class="text-3xl font-bold text-gray-900">Ausstehende Einnahmen {fiscalYear.year}</h1>
            <p class="text-gray-600 mt-1">{outstandingItems.length} offene Position{outstandingItems.length === 1 ? "" : "en"}.</p>
        </div>
        <div class="flex items-center gap-3 flex-wrap">
            <a href={`/intern/finance/fiscal-years/${fiscalYear.id}`} class="text-sm font-semibold text-blue-600 hover:text-blue-700">
                Zurueck
            </a>
            <button
                    type="button"
                    class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg"
                    on:click={() => { showCreateModal = true; }}
            >
                Offene Zahlung hinzufügen
            </button>
        </div>
    </div>

    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
        <div class="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div>
                <p class="text-sm text-gray-500">Gesamt offen</p>
                <p class="text-2xl font-semibold text-amber-600">{euro(outstandingTotal)}</p>
            </div>
            <div class="w-full sm:w-64">
                <label class="text-xs uppercase text-gray-500 font-semibold">Suche</label>
                <input
                        type="text"
                        placeholder="Name, Jahresbeitrag oder Summe"
                        bind:value={search}
                        class="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
            </div>
        </div>

        {#if filteredItems.length === 0}
            <p class="text-sm text-gray-500">Keine offenen Einnahmen hinterlegt.</p>
        {:else}
            <div class="overflow-x-auto">
                <table class="w-full min-w-[900px] divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Mitglied</th>
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Typ</th>
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Zahlung</th>
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Zahlungen</th>
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Notiz</th>
                        <th class="px-6 py-3"></th>
                    </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                    {#each filteredItems as item}
                        <tr class="hover:bg-gray-50 transition">
                            <td class="px-6 py-4 text-sm font-semibold text-gray-900">{item.title}</td>
                            <td class="px-6 py-4 text-sm text-gray-700">{item.type}</td>
                            <td class="px-6 py-4 text-sm">
                                {#if payments[item.id]?.total}
                                    {#if payments[item.id].total >= item.payable}
                                        <span class="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-100 text-xs font-semibold">
                                            Bezahlt {euro(payments[item.id].total)}
                                        </span>
                                    {:else}
                                        <span class="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-100 text-xs font-semibold">
                                            Offen: {euro(item.payable - payments[item.id].total)}
                                        </span>
                                    {/if}
                                {:else}
                                    <span class="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-100 text-xs font-semibold">
                                        Offen: {euro(item.payable)}
                                    </span>
                                {/if}
                            </td>
                            <td class="px-6 py-4 text-sm text-gray-700 space-y-1">
                                {#if payments[item.id]?.entries?.length}
                                    {#each payments[item.id].entries as tx}
                                        <div class="flex items-center justify-between gap-3">
                                            <div>
                                                <div class="font-semibold">{euro(tx.amount)}</div>
                                                <div class="text-xs text-gray-500">{tx.date}</div>
                                                {#if tx.note}<div class="text-xs text-gray-500">{tx.note}</div>{/if}
                                            </div>
                                            <button
                                                    type="button"
                                                    class="text-xs text-blue-600 hover:text-blue-700"
                                                    on:click={() => openModal(item, tx)}
                                            >
                                                Bearbeiten
                                            </button>
                                        </div>
                                    {/each}
                                {:else}
                                    <span class="text-xs text-gray-500">Keine Zahlungen</span>
                                {/if}
                            </td>
                            <td class="px-6 py-4 text-sm text-gray-600">{item.note ?? "-"}</td>
                            <td class="px-6 py-4 text-right">
                                <button
                                        type="button"
                                        class="px-3 py-2 text-sm font-semibold text-blue-600 hover:text-blue-700 border border-blue-100 rounded-lg hover:bg-blue-50 transition"
                                        on:click={() => openModal(item)}
                                >
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

{#if showModal}
    <div class="fixed inset-0 bg-white/20 backdrop-blur-sm flex items-center justify-center z-50 px-4">
        <form method="post" action="?/pay" use:handleEnhance class="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-200">
            <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                    <p class="text-sm text-gray-500">Zahlung erfassen</p>
                    <h3 class="text-lg font-semibold text-gray-900">
                        {selected?.title}
                    </h3>
                </div>
                <button type="button" class="text-gray-400 hover:text-gray-600" on:click={closeModal}>X</button>
            </div>
            <div class="px-6 py-5 space-y-4">
                <input type="hidden" name="fiscalYearId" value={fiscalYear.id} />
                <input type="hidden" name="memberId" value={selected?.memberId || selected?.id} />
                <input type="hidden" name="itemId" value={selected?.id} />
                <input type="hidden" name="memberName" value={selected?.title} />
                <input type="hidden" name="transactionId" value={editTransactionId ?? ""} />
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-2">Gezahlter Betrag</label>
                    <input
                            name="amount"
                            type="number"
                            step="0.01"
                            min="0"
                            class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            bind:value={paidAmount}
                    />
                    <p class="text-xs text-gray-500 mt-1">Standard ist der offene Betrag; anpassbar z. B. für Spenden.</p>
                </div>
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-2">Datum</label>
                    <input
                            name="date"
                            type="date"
                            class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            bind:value={paidDate}
                    />
                </div>
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-2">Notiz (optional)</label>
                    <input
                            name="note"
                            type="text"
                            class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            bind:value={note}
                            placeholder="z. B. inkl. Spende"
                    />
                </div>
            </div>
            <div class="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                <button
                        type="button"
                        class="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800"
                        on:click={closeModal}
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

{#if showCreateModal}
    <div class="fixed inset-0 bg-white/20 backdrop-blur-sm flex items-center justify-center z-50 px-4">
        <form method="post" action="?/addPending" use:enhance={onCreatePending} class="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200">
            <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                    <p class="text-sm text-gray-500">Offene Zahlung anlegen</p>
                    <h3 class="text-lg font-semibold text-gray-900">Mitglied & Typ wählen</h3>
                </div>
                <button type="button" class="text-gray-400 hover:text-gray-600" on:click={() => (showCreateModal = false)}>X</button>
            </div>
            <div class="px-6 py-5 space-y-4">
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-2">Mitglied</label>
                    <input
                            list="member-suggestions"
                            class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            bind:value={newMemberName}
                            on:input={(e) => applyMemberSuggestion((e.target as HTMLInputElement).value)}
                            name="memberName"
                            placeholder="Name eingeben"
                    />
                    <datalist id="member-suggestions">
                        {#each memberSuggestions as m}
                            <option value={m.name}></option>
                        {/each}
                    </datalist>
                    <input type="hidden" name="memberId" value={newMemberId} />
                </div>
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-2">Typ</label>
                    <select
                            name="kind"
                            class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            bind:value={newKind}
                    >
                        <option>Jahresbeitrag</option>
                        <option>Pfadverlag</option>
                        <option>Lager/Aktion</option>
                    </select>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">Betrag</label>
                        <input
                                type="number"
                                step="0.01"
                                min="0"
                                name="amount"
                                bind:value={newAmount}
                                class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">Datum</label>
                        <input
                                type="date"
                                name="date"
                                bind:value={newDate}
                                class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-2">Notiz (optional)</label>
                    <input
                            type="text"
                            name="note"
                            bind:value={newNote}
                            class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="z. B. Rechnung 123"
                    />
                </div>
            </div>
            <div class="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                <button type="button" class="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800" on:click={() => (showCreateModal = false)}>
                    Abbrechen
                </button>
                <button type="submit" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg">
                    Speichern
                </button>
            </div>
        </form>
    </div>
{/if}
