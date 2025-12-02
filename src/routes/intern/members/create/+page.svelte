<script lang="ts">
    import { enhance } from "$app/forms";
    import type { SubmitFunction } from "@sveltejs/kit";

    export let data;

    let loading = false;

    // --------------------------------------------
    // Emails
    // --------------------------------------------
    let emails = [{ label: "", email: "" }];
    function addEmail() { emails = [...emails, { label: "", email: "" }]; }

    // --------------------------------------------
    // Telefonnummern
    // --------------------------------------------
    let numbers = [{ label: "", number: "" }];
    function addNumber() { numbers = [...numbers, { label: "", number: "" }]; }

    // --------------------------------------------
    // Gruppen Dropdown / Auswahl
    // --------------------------------------------
    let selectedGroups: string[] = [];
    let showGroupDropdown = false;

    function toggleGroup(id: string) {
        selectedGroups = selectedGroups.includes(id)
            ? selectedGroups.filter(x => x !== id)
            : [...selectedGroups, id];
    }

    const onSubmit: SubmitFunction = () => loading = true;
</script>


<div class="max-w-4xl mx-auto mt-12 p-10 bg-white rounded-2xl shadow-xl border border-gray-200">

    <h1 class="text-4xl font-bold mb-8 text-gray-900">Neues Mitglied anlegen</h1>

    <form method="post" use:enhance={onSubmit} class="space-y-8">

        <input type="hidden" name="groups" value={JSON.stringify(selectedGroups)} />

        <!-- NAME -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Vorname</label>
                <input name="firstname" required
                       class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:ring-2 ring-blue-500" />
            </div>

            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Nachname</label>
                <input name="lastname" required
                       class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:ring-2 ring-blue-500" />
            </div>
        </div>

        <!-- Geburtstag -->
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Geburtsdatum</label>
            <input type="date" name="birthday" required
                   class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:ring-2 ring-blue-500" />
        </div>

        <!-- Adresse -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <label class="text-sm font-medium text-gray-700 mb-1 block">Straße & Hausnummer</label>
                <input name="address_street" placeholder="Beispielweg 1" required
                       class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:ring-2 ring-blue-500" />
            </div>

            <div>
                <label class="text-sm font-medium text-gray-700 mb-1 block">PLZ</label>
                <input name="address_zip" placeholder="12345" required
                       class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:ring-2 ring-blue-500" />
            </div>

            <div>
                <label class="text-sm font-medium text-gray-700 mb-1 block">Stadt</label>
                <input name="address_city" placeholder="Musterstadt" required
                       class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:ring-2 ring-blue-500" />
            </div>
        </div>

        <!-- Stand -->
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Stand</label>
            <select name="stand"
                    class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:ring-2 ring-blue-500">

                <option>Wildling-Wölfling</option>
                <option>Wölfling</option>
                <option>Jungpfadfinder</option>
                <option>Knappe</option>
                <option>Wildling-Pfadinder</option>
                <option>Pfadfinder</option>
                <option>Späher</option>
                <option>Kreuzpfadfinder</option>

            </select>
        </div>

        <!-- Status -->
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select name="status"
                    class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:ring-2 ring-blue-500">

                <option>aktiv</option>
                <option>passiv</option>
                <option>gekündigt</option>

            </select>
        </div>

        <!-- Gruppen Auswahl -->
        <div class="relative">
            <label class="block text-sm font-medium text-gray-700 mb-1">Gruppen</label>

            <button type="button"
                    on:click={() => showGroupDropdown = !showGroupDropdown}
                    class="w-full px-4 py-3 border rounded-lg bg-gray-50 text-left">
                {#if selectedGroups.length === 0}
                    Keine Gruppen ausgewählt
                {:else}
                    {selectedGroups.length} Gruppe(n) ausgewählt
                {/if}
            </button>

            {#if showGroupDropdown}
                <div class="absolute w-full mt-1 bg-white border rounded-lg shadow-lg max-h-64 overflow-auto z-40 p-3">

                    {#each data.groups as g}
                        <label class="flex items-center gap-2 py-1 cursor-pointer">
                            <input type="checkbox"
                                   checked={selectedGroups.includes(g.id)}
                                   on:change={() => toggleGroup(g.id)} />
                            <span>{g.name} ({g.type})</span>
                        </label>
                    {/each}

                </div>
            {/if}
        </div>

        <!-- Emails -->
        <div class="space-y-4">
            <label class="text-sm font-medium text-gray-700">E-Mails</label>

            {#each emails as email, i}
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input placeholder="Bezeichnung"
                           name={`email_label_${i}`} bind:value={email.label}
                           class="px-4 py-3 border rounded-lg bg-gray-50 focus:ring-2 ring-blue-500" />

                    <input placeholder="E-Mail"
                           name={`email_email_${i}`} bind:value={email.email}
                           class="px-4 py-3 border rounded-lg bg-gray-50 focus:ring-2 ring-blue-500" />
                </div>
            {/each}

            <button type="button" on:click={addEmail}
                    class="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg">+ Weitere E-Mail</button>
        </div>

        <!-- Telefonnummern -->
        <div class="space-y-4 pt-4">
            <label class="text-sm font-medium text-gray-700">Telefonnummern</label>

            {#each numbers as num, i}
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input placeholder="Bezeichnung"
                           name={`number_label_${i}`} bind:value={num.label}
                           class="px-4 py-3 border rounded-lg bg-gray-50 focus:ring-2 ring-blue-500" />

                    <input placeholder="Telefonnummer"
                           name={`number_number_${i}`} bind:value={num.number}
                           class="px-4 py-3 border rounded-lg bg-gray-50 focus:ring-2 ring-blue-500" />
                </div>
            {/each}

            <button type="button" on:click={addNumber}
                    class="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg">+ Weitere Nummer</button>
        </div>

        <!-- Eintritt -->
        <div class="pt-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">Eintrittsdatum</label>
            <input type="date" name="joined"
                   class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:ring-2 ring-blue-500" />
        </div>

        <!-- ACTION BUTTONS -->
        <div class="flex items-center gap-4 pt-6">
            <a href="/intern/members"
               class="px-5 py-3 bg-gray-100 hover:bg-gray-200 rounded-lg">Abbrechen</a>

            <button type="submit" formaction="?/createMember"
                    disabled={loading}
                    class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow">
                {loading ? "Speichere..." : "Erstellen"}
            </button>
        </div>
    </form>
</div>
