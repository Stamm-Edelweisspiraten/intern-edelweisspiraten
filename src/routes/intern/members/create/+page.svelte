<script lang="ts">
    import { enhance } from "$app/forms";
    import type { SubmitFunction } from "@sveltejs/kit";

    export let data;

    let loading = false;

    // E-Mail Felder
    let emails = [{ label: "", email: "" }];

    function addEmail() {
        emails = [...emails, { label: "", email: "" }];
    }

    // Telefonnummern
    let numbers = [{ label: "", number: "" }];

    function addNumber() {
        numbers = [...numbers, { label: "", number: "" }];
    }

    const onSubmit: SubmitFunction = () => {
        loading = true;
    };
</script>

<div class="max-w-4xl mx-auto mt-12 p-10 bg-white rounded-2xl shadow-xl border border-gray-200">

    <h1 class="text-4xl font-bold mb-8 text-gray-900">
        Neues Mitglied anlegen
    </h1>

    <form method="post" use:enhance={onSubmit} class="space-y-8">

        <!-- NAME -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Vorname</label>
                <input
                        name="firstname"
                        required
                        class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white
                           focus:ring-2 focus:ring-blue-500 outline-none transition"
                />
            </div>

            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Nachname</label>
                <input
                        name="lastname"
                        required
                        class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white
                           focus:ring-2 focus:ring-blue-500 outline-none transition"
                />
            </div>
        </div>

        <!-- Geburtstag -->
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Geburtsdatum</label>
            <input
                    type="date"
                    name="birthday"
                    required
                    class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white
                       focus:ring-2 focus:ring-blue-500 outline-none transition"
            />
        </div>

        <!-- Adresse -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <label class="text-sm font-medium text-gray-700 mb-1 block">Straße & Hausnummer</label>
                <input
                        name="address_street"
                        placeholder="Musterstraße 12"
                        required
                        class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white
                           focus:ring-2 focus:ring-blue-500 outline-none transition"
                />
            </div>

            <div>
                <label class="text-sm font-medium text-gray-700 mb-1 block">PLZ & Stadt</label>
                <input
                        name="address_city"
                        placeholder="12345 Musterstadt"
                        required
                        class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white
                           focus:ring-2 focus:ring-blue-500 outline-none transition"
                />
            </div>
        </div>

        <!-- Stand -->
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Stand (Rang)</label>
            <input
                    name="stand"
                    placeholder="z.B. Wölfling, Pfadfinder, Rover..."
                    class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white
                       focus:ring-2 focus:ring-blue-500 outline-none transition"
            />
        </div>

        <!-- Status -->
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>

            <select
                    name="status"
                    class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white
                       focus:ring-2 focus:ring-blue-500 outline-none transition"
            >
                <option>aktiv</option>
                <option>passiv</option>
                <option>gekündigt</option>
            </select>
        </div>

        <!-- Gruppe -->
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Gruppe</label>
            <input
                    name="group"
                    placeholder="z.B. Sippe Adler"
                    class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white
                       focus:ring-2 focus:ring-blue-500 outline-none transition"
            />
        </div>

        <!-- E-MAILS -->
        <div class="space-y-4">
            <label class="text-sm font-medium text-gray-700">E-Mails</label>

            {#each emails as email, i}
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input
                            placeholder="Name (z.B. Mutter)"
                            name={`email_label_${i}`}
                            bind:value={email.label}
                            class="px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 transition"
                    />
                    <input
                            placeholder="E-Mail-Adresse"
                            name={`email_email_${i}`}
                            bind:value={email.email}
                            class="px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 transition"
                    />
                </div>
            {/each}

            <button
                    type="button"
                    class="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition"
                    on:click={addEmail}
            >
                + Weitere E-Mail hinzufügen
            </button>
        </div>

        <!-- Telefon -->
        <div class="space-y-4 pt-4">
            <label class="text-sm font-medium text-gray-700">Telefonnummern</label>

            {#each numbers as num, i}
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input
                            placeholder="Name (z.B. Vater)"
                            name={`number_label_${i}`}
                            bind:value={num.label}
                            class="px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 transition"
                    />
                    <input
                            placeholder="Telefonnummer"
                            name={`number_number_${i}`}
                            bind:value={num.number}
                            class="px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 transition"
                    />
                </div>
            {/each}

            <button
                    type="button"
                    class="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition"
                    on:click={addNumber}
            >
                + Weitere Nummer hinzufügen
            </button>
        </div>

        <!-- Datum Eintritt -->
        <div class="pt-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">Eintrittsdatum</label>
            <input
                    type="date"
                    name="joined"
                    class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white
                       focus:ring-2 focus:ring-blue-500 outline-none transition"
            />
        </div>

        <!-- ACTION BUTTONS -->
        <div class="flex items-center gap-4 pt-6">
            <a
                    href="/intern/members"
                    class="px-5 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900
                       rounded-lg font-medium transition"
            >
                Abbrechen
            </a>

            <button
                    type="submit"
                    formaction="?/createMember"
                    class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg
                       font-medium transition shadow"
                    disabled={loading}
            >
                {loading ? "Speichere Mitglied..." : "Erstellen"}
            </button>
        </div>

    </form>

</div>
