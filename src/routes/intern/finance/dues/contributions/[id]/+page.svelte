<script lang="ts">
    import { enhance } from "$app/forms";
    import { onMount } from "svelte";
    export let data;

    const fiscalYear = data.fiscalYear;
    const members = data.members ?? [];

    const euro = (value: number) => `${value.toFixed(2)} EUR`;

    let showModal = false;
    let selectedMember: any = null;
    let paidAmount = 0;
    let paidDate = new Date().toISOString().slice(0, 10);
    let payments: Record<string, { total: number; entries: { id?: string; amount: number; date: string; note?: string }[] }> = data.payments ?? {};
    let editTransactionId: string | null = null;
    let note = "";
    let handleEnhance: any = () => {};

    const openModal = (member: any, tx?: { id?: string; amount: number; date: string; note?: string }) => {
        selectedMember = member;
        if (tx) {
            editTransactionId = tx.id ?? null;
            paidAmount = tx.amount;
            paidDate = tx.date;
            note = tx.note ?? "";
        } else {
            editTransactionId = null;
            paidAmount = member.payable;
            paidDate = new Date().toISOString().slice(0, 10);
            note = "";
        }
        showModal = true;
    };

    const closeModal = () => {
        showModal = false;
        selectedMember = null;
    };

    onMount(() => {
        handleEnhance = enhance(({ result }) => {
            if (result.type !== "success" || !result.data?.payment) return;
            const { memberId, transactionId, amount, date, note } = result.data.payment;
            const existing = payments[memberId] ?? { total: 0, entries: [] };

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
                [memberId]: { total, entries }
            };

            showModal = false;
        });
    });
</script>

<div class="max-w-6xl mx-auto mt-16 space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
            <h1 class="text-3xl font-bold text-gray-900">Beitraege {fiscalYear.year}</h1>
            <p class="text-gray-600 mt-1">Alle Mitglieder im Geschaeftsjahr {fiscalYear.year}.</p>
        </div>
        <a href="/intern/finance/dues/contributions" class="text-sm font-semibold text-blue-600 hover:text-blue-700">
            Zurueck zur Auswahl
        </a>
    </div>

    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div class="px-6 py-4 flex items-center justify-between">
            <h2 class="text-lg font-semibold text-gray-900">Mitglieder</h2>
            <span class="text-sm text-gray-500">{members.length} Eintraege</span>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full min-w-[960px] divide-y divide-gray-200">
                <thead class="bg-gray-50">
                <tr>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Zweitmitglied</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Beitrag</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Details</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Notiz</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Zahlungen</th>
                    <th class="px-6 py-3"></th>
                </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                {#if members.length === 0}
                    <tr>
                        <td colspan="8" class="px-6 py-6 text-center text-sm text-gray-500">
                            Keine Mitglieder gefunden.
                        </td>
                    </tr>
                {:else}
                    {#each members as m}
                        <tr class="hover:bg-gray-50 transition">
                            <td class="px-6 py-4 text-sm font-semibold text-gray-900">{m.firstname} {m.lastname}</td>
                            <td class="px-6 py-4 text-sm text-gray-700">
                                {m.isSecondMember ? "Ja" : "Nein"}
                            </td>
                            <td class="px-6 py-4 text-sm text-gray-900 font-semibold">{euro(m.payable)}</td>
                            <td class="px-6 py-4 text-sm text-gray-600">
                                {#if m.isSecondMember}
                                    {#if m.contributionDues?.stamm}Stamm {euro(m.payableParts.stamm)} {/if}
                                    {#if m.contributionDues?.gau}- Gau {euro(m.payableParts.gau)} {/if}
                                    {#if m.contributionDues?.landesmark}- Landesmark {euro(m.payableParts.landesmark)} {/if}
                                    {#if m.contributionDues?.bund}- Bund {euro(m.payableParts.bund)} {/if}
                                {:else}
                                    Vollbeitrag ({euro(m.payable)})
                                {/if}
                            </td>
                            <td class="px-6 py-4 text-sm text-gray-600">
                                {payments[m.id]?.entries?.[0]?.note ?? "-"}
                            </td>
                            <td class="px-6 py-4 text-sm">
                                {#if payments[m.id]?.total}
                                    {#if payments[m.id].total >= m.payable}
                                        <span class="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-100 text-xs font-semibold">
                                            Bezahlt {euro(payments[m.id].total)}
                                        </span>
                                    {:else}
                                        <span class="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-100 text-xs font-semibold">
                                            Offen: {euro(m.payable - payments[m.id].total)}
                                        </span>
                                    {/if}
                                {:else}
                                    <span class="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-100 text-xs font-semibold">
                                        Offen: {euro(m.payable)}
                                    </span>
                                {/if}
                            </td>
                            <td class="px-6 py-4 text-sm text-gray-700 space-y-1">
                                {#if payments[m.id]?.entries?.length}
                                    {#each payments[m.id].entries as tx}
                                        <div class="flex items-center justify-between gap-3">
                                            <div>
                                                <div class="font-semibold">{euro(tx.amount)}</div>
                                                <div class="text-xs text-gray-500">{tx.date}</div>
                                                {#if tx.note}<div class="text-xs text-gray-500">{tx.note}</div>{/if}
                                            </div>
                                            <button
                                                    type="button"
                                                    class="text-xs text-blue-600 hover:text-blue-700"
                                                    on:click={() => openModal(m, tx)}
                                            >
                                                Bearbeiten
                                            </button>
                                        </div>
                                    {/each}
                                {:else}
                                    <span class="text-xs text-gray-500">Keine Zahlungen</span>
                                {/if}
                            </td>
                            <td class="px-6 py-4 text-right">
                                <button
                                        type="button"
                                        class="px-3 py-2 text-sm font-semibold text-blue-600 hover:text-blue-700 border border-blue-100 rounded-lg hover:bg-blue-50 transition"
                                        on:click={() => openModal(m)}
                                >
                                    Hat bezahlt
                                </button>
                            </td>
                        </tr>
                    {/each}
                {/if}
                </tbody>
            </table>
        </div>
    </div>
</div>

{#if showModal}
    <div class="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 px-4">
        <form method="post" action="?/pay" use:handleEnhance class="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-200">
            <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                    <p class="text-sm text-gray-500">Zahlung erfassen</p>
                    <h3 class="text-lg font-semibold text-gray-900">
                        {selectedMember?.firstname} {selectedMember?.lastname}
                    </h3>
                </div>
                <button type="button" class="text-gray-400 hover:text-gray-600" on:click={closeModal}>X</button>
            </div>
            <div class="px-6 py-5 space-y-4">
                <input type="hidden" name="fiscalYearId" value={fiscalYear.id} />
                <input type="hidden" name="memberId" value={selectedMember?.id} />
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
                    <p class="text-xs text-gray-500 mt-1">Standard ist der faellige Beitrag; anpassbar bei z. B. Spenden.</p>
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






