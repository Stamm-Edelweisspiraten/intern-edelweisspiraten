<script lang="ts">
    export let data;
    export let form;
    export const csr = false;
    import PublicFooter from "$lib/components/PublicFooter.svelte";
</script>

<svelte:head>
    <title>Anmeldung - Stamm Edelweisspiraten</title>
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100 flex flex-col">
    <div class="flex-1 flex items-center justify-center px-4 py-10">
        <div class="w-full max-w-lg bg-white/90 backdrop-blur-sm border border-gray-200 shadow-xl rounded-2xl p-8 space-y-6">
            <div class="flex items-center justify-between">
                <div>
                    <p class="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">Einladung bestätigen</p>
                    <h1 class="text-2xl font-bold text-gray-900">Beitritt für {data.member.firstname} {data.member.lastname?.slice(0,1)}.</h1>
                    <p class="text-sm text-gray-600 mt-1">Sicherer Zugang für Dich und deine Familie.</p>
                </div>
                <span class="inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold rounded-full border border-blue-200 bg-blue-50 text-blue-700">
                    <span class="bi bi-shield-lock"></span> Datenschutz
                </span>
            </div>

            <form method="post" class="space-y-5">
                <div class="space-y-2">
                    <label class="text-sm font-medium text-gray-700">Einladungscode</label>
                    <input
                            type="text"
                            name="code"
                            maxlength="6"
                            inputmode="numeric"
                            autocomplete="one-time-code"
                            class="w-full px-4 py-3 border rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="z.B. 927341"
                            required
                    />
                </div>

                {#if form?.error}
                    <p class="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-3 py-2">{form.error}</p>
                {/if}

                <button
                        type="submit"
                        class="w-full py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-sm font-semibold transition"
                >
                    Weiter
                </button>
            </form>

            <div class="text-xs text-gray-500 leading-relaxed border-t border-gray-100 pt-4">
                Wir speichern deine Daten nur für die Mitgliedsverwaltung des Stammes. Keine Weitergabe an Dritte. Fragen? Melde dich bei uns.
            </div>
        </div>
    </div>
    <PublicFooter />
</div>
