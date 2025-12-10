<script lang="ts">
    import { enhance } from "$app/forms";
    import type { SubmitFunction } from "@sveltejs/kit";

    export let data;

    const canUpdate = data.canUpdate;

    let contributions = { ...data.finance.contributions };
    let successMsg = "";
    let errorMsg = "";
    let saving = false;
    const levels = [
        { key: "stamm", label: "Stamm (Edelweißpiraten)" },
        { key: "gau", label: "Gau (Bremen)" },
        { key: "landesmark", label: "Landesmark (Achtern Diek)" },
        { key: "bund", label: "Bund (Christliche Pfadfinderschaft Deutschlands e.V.)" }
    ];

    const formatEuro = (val: number) =>
        val.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    $: total = levels.reduce((sum, lvl) => sum + (Number((contributions as any)[lvl.key]) || 0), 0);

    const onSubmit: SubmitFunction = ({ update }) => {
        saving = true;
        successMsg = "";
        errorMsg = "";
        return async ({ result }) => {
            if (result.type === "success") {
                successMsg = "Einstellungen gespeichert.";
                if (result.data?.finance?.contributions) {
                    contributions = { ...result.data.finance.contributions };
                }
            } else if (result.type === "failure") {
                errorMsg = result.data?.error ?? "Speichern fehlgeschlagen.";
            } else if (result.type === "error") {
                errorMsg = result.error?.message ?? "Speichern fehlgeschlagen.";
            }
            saving = false;
            await update();
        };
    };
</script>

<div class="max-w-4xl mx-auto mt-12 space-y-8">
    <div>
        <h1 class="text-4xl font-bold text-gray-900 mb-2">Allgemeine Einstellungen</h1>
        <p class="text-gray-600">Kasseneinstellungen und Beitragshöhen verwalten.</p>
        {#if data.finance.updatedAt}
            <p class="text-xs text-gray-500 mt-1">
                Zuletzt geändert {new Date(data.finance.updatedAt).toLocaleString("de-DE")}
                {#if data.finance.updatedBy} von {data.finance.updatedBy}{/if}
            </p>
        {/if}
    </div>

    {#if successMsg}
        <div class="px-4 py-3 rounded-lg bg-green-100 text-green-800 border border-green-200">
            {successMsg}
        </div>
    {/if}
    {#if errorMsg}
        <div class="px-4 py-3 rounded-lg bg-red-100 text-red-800 border border-red-200">
            {errorMsg}
        </div>
    {/if}

    <form method="post" action="?/updateFinance" use:enhance={canUpdate ? onSubmit : undefined} class="space-y-6">
        <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-5">
            <div class="flex items-center justify-between">
                <div>
                    <h2 class="text-2xl font-semibold text-gray-900">Kasse</h2>
                    <p class="text-gray-600 text-sm">Beiträge pro Ebene in EUR pro Mitglied festlegen.</p>
                </div>
                {#if !canUpdate}
                    <span class="text-xs text-gray-500">Nur Ansicht</span>
                {/if}
            </div>

            <div class="mt-3 overflow-x-auto rounded-2xl border border-gray-200 shadow-sm">
                <table class="min-w-[720px] w-full divide-y divide-gray-200 text-sm">
                    <thead class="bg-gray-50">
                    <tr>
                        <th class="px-5 py-3 text-left font-semibold text-gray-700 w-2/3">Ebene</th>
                        <th class="px-5 py-3 text-right font-semibold text-gray-700 w-1/3">Beitrag / Mitglied</th>
                    </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100">
                    {#each levels as lvl}
                        <tr class="bg-white">
                            <td class="px-5 py-4 text-gray-800">{lvl.label}</td>
                            <td class="px-5 py-4 text-right">
                                {#if canUpdate}
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        name={`contrib_${lvl.key}`}
                                        bind:value={(contributions as any)[lvl.key]}
                                        class="w-40 md:w-48 px-3 py-2 border rounded-lg bg-gray-50 focus:ring-2 ring-blue-500 text-right"
                                    />
                                {:else}
                                    <span class="font-mono text-gray-900">{formatEuro(Number((contributions as any)[lvl.key]) || 0)} €</span>
                                {/if}
                            </td>
                        </tr>
                    {/each}
                    <tr class="bg-blue-50">
                        <td class="px-5 py-4 font-semibold text-gray-900">Summe pro Mitglied</td>
                        <td class="px-5 py-4 text-right font-mono font-semibold text-gray-900">{formatEuro(total)} €</td>
                    </tr>
                    </tbody>
                </table>
            </div>
        </div>

        {#if canUpdate}
            <div class="flex gap-4">
                <button
                    type="submit"
                    class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow disabled:opacity-70"
                    disabled={saving}
                >
                    {saving ? "Speichert..." : "Speichern"}
                </button>
                <a href="/intern/admin" class="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg">
                    Zurück
                </a>
            </div>
        {:else}
            <a href="/intern/admin" class="inline-block px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg">
                Zurück
            </a>
        {/if}
    </form>
</div>
