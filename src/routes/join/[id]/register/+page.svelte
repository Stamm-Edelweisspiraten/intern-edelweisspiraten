<script lang="ts">
    export let data;
    export let form;
    export const csr = false;

    import PublicFooter from "$lib/components/PublicFooter.svelte";

    let accountType: "child" | "parent" = "child";
    let password = "";
    let password2 = "";

    $: passwordMismatch = password && password2 && password !== password2;
</script>

<div class="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100 flex flex-col">
    <div class="flex-1 flex items-center justify-center px-4 py-10">
        <div class="w-full max-w-xl bg-white/90 backdrop-blur-sm border border-gray-200 shadow-xl rounded-2xl p-8 space-y-6">
            <div class="flex items-center justify-between flex-wrap gap-2">
                <div>
                    <p class="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">Benutzerkonto erstellen</p>
                    <h1 class="text-2xl font-bold text-gray-900">Für {data.member.firstname} {data.member.lastname}</h1>
                    <p class="text-sm text-gray-600 mt-1">Wähle, ob du dich als Kind oder Elternteil registrierst.</p>
                </div>
                <span class="inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold rounded-full border border-blue-200 bg-blue-50 text-blue-700">
                    <span class="bi bi-shield-lock"></span> Datenschutz
                </span>
            </div>

            <div class="grid grid-cols-2 gap-2">
                <button
                        type="button"
                        class={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl border ${accountType === "child" ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-700"}`}
                        on:click={() => accountType = "child"}
                >
                    <span class="bi bi-person"></span> Kind
                </button>
                <button
                        type="button"
                        class={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl border ${accountType === "parent" ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-700"}`}
                        on:click={() => accountType = "parent"}
                >
                    <span class="bi bi-people"></span> Elternteil
                </button>
            </div>

            <div class="flex items-center justify-between gap-3 p-3 border border-gray-200 rounded-xl bg-gray-50">
                <div class="text-sm text-gray-700">
                    <div class="font-semibold text-gray-900">Schon ein Konto?</div>
                    <div>Einfach anmelden und verknüpfen.</div>
                </div>
                <a
                        href={`/login?join=${data.member.id}`}
                        class="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-100 border border-gray-300 text-gray-800 rounded-xl shadow-sm font-semibold"
                >
                    <span class="bi bi-box-arrow-in-right"></span>
                    Login
                </a>
            </div>

            <form method="post" class="space-y-4">
                <input type="hidden" name="accountType" value={accountType} />

                <div class="space-y-1">
                    <label class="block text-sm font-medium text-gray-700">Name</label>
                    <input name="name" required class="w-full px-4 py-3 border rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"/>
                </div>

                <div class="space-y-1">
                    <label class="block text-sm font-medium text-gray-700">E-Mail</label>
                    <input name="email" type="email" required class="w-full px-4 py-3 border rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"/>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div class="space-y-1">
                        <label class="block mb-1 text-sm font-medium text-gray-700">Passwort</label>
                        <input
                                name="password"
                                type="password"
                                required
                                minlength="8"
                                class="w-full px-4 py-3 border rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                                bind:value={password}
                        />
                    </div>
                    <div class="space-y-1">
                        <label class="block mb-1 text-sm font-medium text-gray-700">Passwort wiederholen</label>
                        <input
                                name="password2"
                                type="password"
                                required
                                minlength="8"
                                class="w-full px-4 py-3 border rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                                bind:value={password2}
                        />
                        {#if passwordMismatch}
                            <p class="text-red-600 text-xs mt-1">Passwörter stimmen nicht überein.</p>
                        {/if}
                    </div>
                </div>

                {#if form?.error}
                    <p class="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-3 py-2">{form.error}</p>
                {/if}

                <button class="w-full py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-60 shadow-sm font-semibold"
                        disabled={passwordMismatch}>
                    Konto erstellen
                </button>
            </form>

            <div class="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-700">
                <p class="font-semibold mb-2">Datenschutz</p>
                <p>Deine Daten werden nur für die interne Verwaltung des Stammes genutzt und nicht an Dritte weitergegeben.</p>
            </div>

            <div class="mt-4 text-center">
                <p class="text-gray-600 mb-2">Du hast bereits ein Konto?</p>
                <a
                        href={`/login?join=${data.member.id}`}
                        class="inline-flex items-center gap-2 px-5 py-3 bg-white hover:bg-gray-50 border border-gray-200 text-gray-800 rounded-xl shadow-sm font-semibold"
                >
                    <span class="bi bi-box-arrow-in-right"></span>
                    Mit bestehendem Konto anmelden &amp; verknüpfen
                </a>
            </div>
        </div>
    </div>
    <PublicFooter />
</div>
