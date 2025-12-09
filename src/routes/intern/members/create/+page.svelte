<script lang="ts">
    import { enhance } from "$app/forms";
    import type { SubmitFunction } from "@sveltejs/kit";

    export let data;

    let loading = false;
    let successMsg = "";
    let errorMsg = "";

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
    // Gruppen als wiederholbare Selects
    // --------------------------------------------
    let selectedGroups: string[] = [];
    function addGroup() {
        const first = data.groups?.[0]?.id ?? "";
        selectedGroups = [...selectedGroups, first];
    }
    function updateGroup(idx: number, value: string) {
        const copy = [...selectedGroups];
        copy[idx] = value;
        selectedGroups = copy;
    }
    function removeGroup(idx: number) {
        selectedGroups = selectedGroups.filter((_, i) => i !== idx);
    }

    const resetFormState = () => {
        emails = [{ label: "", email: "" }];
        numbers = [{ label: "", number: "" }];
        selectedGroups = [];
    };

    const onSubmit: SubmitFunction = ({ update }) => {
        loading = true;
        successMsg = "";
        errorMsg = "";
        return async ({ result, form }) => {
            if (result.type === "success") {
                successMsg = result.data?.memberName
                    ? `Das Mitglied ${result.data.memberName} wurde erfolgreich erstellt!`
                    : "Das Mitglied wurde erfolgreich erstellt!";
                form?.reset();
                resetFormState();
            } else if (result.type === "failure") {
                errorMsg = result.data?.error ?? "Speichern fehlgeschlagen.";
            } else if (result.type === "error") {
                errorMsg = result.error?.message ?? "Speichern fehlgeschlagen.";
            }
            loading = false;
            await update();
        };
    };
</script>


<div class="max-w-4xl mx-auto mt-12 p-10 bg-white rounded-2xl shadow-xl border border-gray-200">

    <h1 class="text-4xl font-bold mb-8 text-gray-900">Neues Mitglied anlegen</h1>

    {#if successMsg}
        <div class="mb-4 px-4 py-3 rounded-lg bg-green-100 text-green-800 border border-green-200">
            {successMsg}
        </div>
    {/if}
    {#if errorMsg}
        <div class="mb-4 px-4 py-3 rounded-lg bg-red-100 text-red-800 border border-red-200">
            {errorMsg}
        </div>
    {/if}

    <form method="post" enctype="multipart/form-data" use:enhance={onSubmit} class="space-y-8">

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

        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Fahrtenname (optional)</label>
            <input name="fahrtenname" placeholder="Spitzname fuer Fahrten"
                   class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:ring-2 ring-blue-500" />
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

                <option>Neuling-Wölfling</option>
                <option>Wölfling</option>
                <option>Jungpfadfinder</option>
                <option>Knappe</option>
                <option>Neuling-Pfadinder</option>
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

        <!-- Gruppen Auswahl (mehrere Selects) -->
        <div class="space-y-3">
            <label class="block text-sm font-medium text-gray-700 mb-1">Gruppen</label>
            {#if selectedGroups.length === 0}
                <p class="text-sm text-gray-500">Keine Gruppe ausgewählt.</p>
            {/if}
            {#each selectedGroups as gid, i}
                <div class="flex gap-3 items-center">
                    <select
                            class="flex-1 px-4 py-3 border rounded-lg bg-gray-50 focus:ring-2 ring-blue-500"
                            bind:value={selectedGroups[i]}
                            on:change={(e) => updateGroup(i, (e.target as HTMLSelectElement).value)}
                    >
                        {#each data.groups as g}
                            <option value={g.id}>{g.name} ({g.type})</option>
                        {/each}
                    </select>
                    <button type="button"
                            class="px-4 py-3 bg-red-100 text-red-700 rounded-lg h-full"
                            on:click={() => removeGroup(i)}>
                        Entfernen
                    </button>
                </div>
            {/each}
            <button type="button" on:click={addGroup}
                    class="px-4 py-3 bg-blue-100 text-blue-700 rounded-lg">
                + Gruppe hinzufügen
            </button>
        </div>

        <!-- Medien-Einverständnis -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label class="flex items-center gap-2">
                <input type="checkbox" name="consent_social" />
                <span>Social Media erlaubt</span>
            </label>
            <label class="flex items-center gap-2">
                <input type="checkbox" name="consent_website" />
                <span>Stammeswebsite erlaubt</span>
            </label>
            <label class="flex items-center gap-2">
                <input type="checkbox" name="consent_print" />
                <span>Print erlaubt</span>
            </label>
        </div>

        <!-- Uploads -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Datenschutzerklärung / Einwilligung (PDF/JPG/PNG, max. 10 MB)</label>
                <input type="file" name="consent_file" accept=".pdf,image/png,image/jpeg"
                       class="w-full border rounded-lg px-3 py-2" />
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Stammesanmeldung (PDF/JPG/PNG, max. 10 MB)</label>
                <input type="file" name="application_file" accept=".pdf,image/png,image/jpeg"
                       class="w-full border rounded-lg px-3 py-2" />
            </div>
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
