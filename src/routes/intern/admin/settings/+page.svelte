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
        { key: "stamm", label: "Stamm (Edelweisspiraten)" },
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
        };
    };
</script>

<div class="max-w-6xl mx-auto mt-16 space-y-8">
    <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
            <p class="text-sm font-semibold text-gray-700 uppercase tracking-wide">Admin</p>
            <h1 class="text-4xl font-bold text-gray-900">Einstellungen</h1>
            <p class="text-sm text-gray-600 mt-1">Stammdaten und Beiträge verwalten.</p>
        </div>
        <a
                href="/intern/admin"
                class="inline-flex items-center gap-2 px-4 py-3 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl font-semibold text-gray-800 shadow-sm transition"
        >
            <span class="bi bi-arrow-left"></span>
            Zurück
        </a>
    </div>

    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-6">
        <div class="flex items-center justify-between flex-wrap gap-3">
            <h2 class="text-xl font-semibold text-gray-900">Beitragssätze</h2>
            <div class="text-sm text-gray-600">Gesamt: <span class="font-semibold text-gray-900">{formatEuro(total)} EUR</span></div>
        </div>

        <form method="post" use:enhance={onSubmit} class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                {#each levels as lvl}
                    <label class="text-sm font-semibold text-gray-700 flex flex-col gap-2 border border-gray-200 rounded-xl p-4 bg-gray-50">
                        {lvl.label}
                        <input
                                type="number"
                                min="0"
                                step="0.01"
                                class="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-400 text-sm"
                                bind:value={(contributions as any)[lvl.key]}
                                name={lvl.key}
                                {disabled:!canUpdate}
                        />
                    </label>
                {/each}
            </div>

            {#if canUpdate}
                <div class="flex items-center justify-end gap-3 flex-wrap">
                    {#if errorMsg}<span class="text-sm text-red-600">{errorMsg}</span>{/if}
                    {#if successMsg}<span class="text-sm text-emerald-700">{successMsg}</span>{/if}
                    <button
                            type="submit"
                            class="inline-flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-sm transition disabled:opacity-60"
                            disabled={saving}
                    >
                        <span class="bi bi-save"></span>
                        {saving ? "Speichern..." : "Speichern"}
                    </button>
                </div>
            {:else}
                <p class="text-sm text-gray-500">Du hast keine Berechtigung zum Aktualisieren.</p>
            {/if}
        </form>
    </div>
</div>
