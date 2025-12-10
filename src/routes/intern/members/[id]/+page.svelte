<script lang="ts">
    export let data;

    const mode = data.scope === "edit" ? "edit" : "view";
    const disabled = mode === "view" ? true : undefined;

    let firstname = data.member.firstname;
    let lastname = data.member.lastname;
    let birthday = data.member.birthday;

    let address_street = data.member.address.street;
    let address_city = data.member.address.city;
    let address_zip = data.member.address.zip;

    let stand = data.member.stand;
    let status = data.member.status;

    let consentSocial = data.member.mediaConsent?.socialMedia ?? false;
    let consentWebsite = data.member.mediaConsent?.website ?? false;
    let consentPrint = data.member.mediaConsent?.print ?? false;
    let removeConsent = false;
    let removeApplication = false;

    let selectedGroups: string[] = [...(data.member.groups ?? [])];
    function addGroup() {
        if (disabled) return;
        const first = data.groups?.[0]?.id ?? "";
        selectedGroups = [...selectedGroups, first];
    }
    function updateGroup(idx: number, value: string) {
        if (disabled) return;
        const copy = [...selectedGroups];
        copy[idx] = value;
        selectedGroups = copy;
    }
    function removeGroup(idx: number) {
        if (disabled) return;
        selectedGroups = selectedGroups.filter((_, i) => i !== idx);
    }

    let entryDate = data.member.entryDate;

    let emails = [...data.member.emails];
    function addEmail() {
        if (disabled) return;
        emails = [...emails, { label: "", email: "" }];
    }
    function removeEmail(i: number) {
        if (disabled) return;
        emails = emails.filter((_, idx) => idx !== i);
    }

    let numbers = [...data.member.numbers];
    function addNumber() {
        if (disabled) return;
        numbers = [...numbers, { label: "", number: "" }];
    }
    function removeNumber(i: number) {
        if (disabled) return;
        numbers = numbers.filter((_, idx) => idx !== i);
    }

    // User-Zuordnung
    let userSearch = "";
    let showUserList = false;
    const memberId = data.member.id;
    let memberUserIds = Array.isArray(data.member.userIds) ? [...data.member.userIds] : [];

    $: filteredUsers = (data.allUsers ?? []).filter(
        (u) =>
            (u.name ?? "").toLowerCase().includes(userSearch.toLowerCase()) ||
            (u.email ?? "").toLowerCase().includes(userSearch.toLowerCase()) ||
            (u.id ?? "").toLowerCase().includes(userSearch.toLowerCase())
    );

    function addUser(uid: string) {
        if (disabled) return;
        if (!memberUserIds.includes(uid)) {
            memberUserIds = [...memberUserIds, uid];
        }
        userSearch = "";
        showUserList = false;
    }

    function removeUser(uid: string) {
        if (disabled) return;
        memberUserIds = memberUserIds.filter((id) => id !== uid);
    }
</script>

<div class="max-w-3xl mx-auto mt-12 p-8 bg-white rounded-2xl shadow-xl border">
    <h1 class="text-4xl font-bold mb-8 text-gray-900">
        {mode === "view" ? "Mitglied ansehen" : "Mitglied bearbeiten"}
    </h1>

    <form method="post" enctype={mode === "edit" ? "multipart/form-data" : undefined} action={mode === "edit" ? "?/update" : undefined} class="space-y-7">
        <input type="hidden" name="id" value={data.member.id} />
        <input type="hidden" name="groups" value={JSON.stringify(selectedGroups)} />

        <div class="grid grid-cols-2 gap-5">
            <div>
                <label>Vorname</label>
                <input type="text" name="firstname" bind:value={firstname} disabled={disabled} class="w-full px-4 py-3 border rounded-lg bg-gray-50 disabled:opacity-70" />
            </div>

            <div>
                <label>Nachname</label>
                <input type="text" name="lastname" bind:value={lastname} disabled={disabled} class="w-full px-4 py-3 border rounded-lg bg-gray-50 disabled:opacity-70" />
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label class="flex items-center gap-2">
                <input type="checkbox" name="consent_social" bind:checked={consentSocial} disabled={disabled} />
                <span>Social Media erlaubt</span>
            </label>
            <label class="flex items-center gap-2">
                <input type="checkbox" name="consent_website" bind:checked={consentWebsite} disabled={disabled} />
                <span>Stammeswebsite erlaubt</span>
            </label>
            <label class="flex items-center gap-2">
                <input type="checkbox" name="consent_print" bind:checked={consentPrint} disabled={disabled} />
                <span>Print erlaubt</span>
            </label>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-2">
                <label>Datenschutzerklaerung / Einwilligung (PDF/JPG/PNG)</label>
                <input type="file" name="consent_file" accept=".pdf,image/png,image/jpeg" disabled={disabled} class="w-full border rounded-lg px-3 py-2 bg-gray-50 disabled:opacity-70" />
                {#if data.member.consentFile}
                    <div class="flex items-center gap-3">
                        <a class="text-blue-600 underline" href={`/intern/members/${data.member.id}/files/consent`} target="_blank" rel="noreferrer">
                            {data.member.consentFile.filename} ({Math.round(data.member.consentFile.size / 1024)} KB)
                        </a>
                        {#if mode === "edit"}
                            <input type="hidden" name="remove_consent" value={removeConsent ? "true" : ""} />
                            <button type="button"
                                    class="px-3 py-2 bg-red-100 text-red-700 rounded"
                                    on:click={() => { removeConsent = !removeConsent; }}>
                                {removeConsent ? "Entfernen rückgängig" : "Datei entfernen"}
                            </button>
                        {/if}
                    </div>
                {/if}
            </div>
            <div class="space-y-2">
                <label>Stammesanmeldung (PDF/JPG/PNG)</label>
                <input type="file" name="application_file" accept=".pdf,image/png,image/jpeg" disabled={disabled} class="w-full border rounded-lg px-3 py-2 bg-gray-50 disabled:opacity-70" />
                {#if data.member.applicationFile}
                    <div class="flex items-center gap-3">
                        <a class="text-blue-600 underline" href={`/intern/members/${data.member.id}/files/application`} target="_blank" rel="noreferrer">
                            {data.member.applicationFile.filename} ({Math.round(data.member.applicationFile.size / 1024)} KB)
                        </a>
                        {#if mode === "edit"}
                            <input type="hidden" name="remove_application" value={removeApplication ? "true" : ""} />
                            <button type="button"
                                    class="px-3 py-2 bg-red-100 text-red-700 rounded"
                                    on:click={() => { removeApplication = !removeApplication; }}>
                                {removeApplication ? "Entfernen rückgängig" : "Datei entfernen"}
                            </button>
                        {/if}
                    </div>
                {/if}
            </div>
        </div>

        <div>
            <label>Geburtstag</label>
            <input type="date" name="birthday" bind:value={birthday} disabled={disabled} class="w-full px-4 py-3 border rounded-lg bg-gray-50 disabled:opacity-70" />
        </div>

        <div>
            <label>Adresse</label>
            <input type="text" name="address_street" bind:value={address_street} disabled={disabled} placeholder="Strasse" class="w-full px-4 py-3 border rounded-lg bg-gray-50 mb-2 disabled:opacity-70" />
            <input type="text" name="address_zip" bind:value={address_zip} disabled={disabled} placeholder="PLZ" class="w-full px-4 py-3 border rounded-lg bg-gray-50 mb-2 disabled:opacity-70" />
            <input type="text" name="address_city" bind:value={address_city} disabled={disabled} placeholder="Stadt" class="w-full px-4 py-3 border rounded-lg bg-gray-50 disabled:opacity-70" />
        </div>

        <div class="grid grid-cols-3 gap-5">
            <div>
                <label>Stand</label>
                <select name="stand" bind:value={stand} disabled={disabled} class="w-full px-4 py-3 border rounded-lg bg-gray-50 disabled:opacity-70">
                    <option>Neuling-Wölfling</option>
                    <option>Wölfling</option>
                    <option>Neuling-Pfadinder</option>
                    <option>Jungpfadfinder</option>
                    <option>Knappe</option>
                    <option>Pfadfinder</option>
                    <option>Späher</option>
                    <option>Kreuzpfadfinder</option>
                </select>
            </div>

            <div>
                <label>Status</label>
                <select name="status" bind:value={status} disabled={disabled} class="w-full px-4 py-3 border rounded-lg bg-gray-50 disabled:opacity-70">
                    <option>aktiv</option>
                    <option>passiv</option>
                    <option>gekündigt</option>
                </select>
            </div>
        </div>

        <div class="space-y-3">
            <label>Gruppen</label>
            {#if selectedGroups.length === 0}
                <p class="text-sm text-gray-500">Keine Gruppe ausgewählt.</p>
            {/if}
            {#each selectedGroups as gid, i}
                <div class="flex gap-3 items-center">
                    <select
                            class="flex-1 px-4 py-3 border rounded-lg bg-gray-50 disabled:opacity-70"
                            bind:value={selectedGroups[i]}
                            disabled={disabled}
                            on:change={(e) => updateGroup(i, (e.target as HTMLSelectElement).value)}
                    >
                        {#each data.groups as g}
                            <option value={g.id}>{g.name} ({g.type})</option>
                        {/each}
                    </select>
                    {#if !disabled}
                        <button type="button"
                                class="px-4 py-3 bg-red-100 text-red-700 rounded-lg h-full"
                                on:click={() => removeGroup(i)}>
                            Entfernen
                        </button>
                    {/if}
                </div>
            {/each}
            {#if !disabled}
                <button type="button" on:click={addGroup}
                        class="px-4 py-3 bg-blue-100 text-blue-700 rounded-lg">
                    + Gruppe hinzufügen
                </button>
            {/if}
        </div>

        <div>
            <label>E-Mails</label>
            {#each emails as e, i}
                <div class="flex gap-3 mb-3">
                    <input name={`email_label_${i}`} bind:value={e.label} disabled={disabled} placeholder="Bezeichnung" class="flex-1 px-4 py-3 border rounded-lg bg-gray-50 disabled:opacity-70" />
                    <input name={`email_email_${i}`} bind:value={e.email} disabled={disabled} placeholder="E-Mail" class="flex-1 px-4 py-3 border rounded-lg bg-gray-50 disabled:opacity-70" />
                    {#if !disabled}
                        <button type="button" on:click={() => removeEmail(i)} class="px-3 py-2 bg-red-100 text-red-700 rounded-lg">
                            Entfernen
                        </button>
                    {/if}
                </div>
            {/each}
            {#if !disabled}
                <button type="button" on:click={addEmail} class="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg">
                    + E-Mail hinzufuegen
                </button>
            {/if}
        </div>

        <div>
            <label>Telefonnummern</label>
            {#each numbers as n, i}
                <div class="flex gap-3 mb-3">
                    <input name={`number_label_${i}`} bind:value={n.label} disabled={disabled} placeholder="Bezeichnung" class="flex-1 px-4 py-3 border rounded-lg bg-gray-50 disabled:opacity-70" />
                    <input name={`number_number_${i}`} bind:value={n.number} disabled={disabled} placeholder="Nummer" class="flex-1 px-4 py-3 border rounded-lg bg-gray-50 disabled:opacity-70" />
                    {#if !disabled}
                        <button type="button" on:click={() => removeNumber(i)} class="px-3 py-2 bg-red-100 text-red-700 rounded-lg">
                            Entfernen
                        </button>
                    {/if}
                </div>
            {/each}
            {#if !disabled}
                <button type="button" on:click={addNumber} class="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg">
                    + Nummer hinzufuegen
                </button>
            {/if}
        </div>

        {#if mode === "edit"}
            <div class="flex gap-4 pt-8">
                <button type="submit" class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                    Speichern
                </button>
                <a href="/intern/members" class="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg">
                    Abbrechen
                </a>
            </div>
        {/if}

        {#if mode === "view"}
            <div class="flex gap-4 mt-10">
                <a href={`/intern/members/${data.member.id}?scope=edit`} data-sveltekit-reload class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                    Bearbeiten
                </a>
                <a href="/intern/members" class="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg">
                    Zurueck
                </a>
            </div>
        {/if}
    </form>
</div>

<div class="max-w-3xl mx-auto mt-12 p-8 bg-white rounded-2xl shadow-xl border border-gray-200">
    <h2 class="text-2xl font-semibold mb-4 text-gray-900">
        Benutzerzuordnung (User zu Mitglied)
    </h2>

    {#if mode === "edit"}
        <form method="post" action="?/update-users" class="space-y-6">
            <input type="hidden" name="memberId" value={memberId} />
            <input type="hidden" name="userIds" value={JSON.stringify(memberUserIds)} />

            <div class="relative">
                <label class="block text-sm font-medium text-gray-600 mb-1">User hinzufuegen</label>
                <input
                    type="text"
                    placeholder="Name, E-Mail oder User-ID eingeben..."
                    bind:value={userSearch}
                    on:focus={() => (showUserList = true)}
                    class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition"
                />

                {#if showUserList && filteredUsers.length > 0}
                    <ul class="absolute z-20 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-60 overflow-auto">
                        {#each filteredUsers as u}
                            {#if !memberUserIds.includes(u.id)}
                                <li class="px-4 py-2 hover:bg-blue-50 cursor-pointer" on:click={() => addUser(u.id)}>
                                    <strong>{u.name}</strong>
                                    <span class="text-gray-500 ml-2">({u.email})</span>
                                </li>
                            {/if}
                        {/each}
                    </ul>
                {/if}
            </div>

            <div class="space-y-3 mt-4">
                {#if memberUserIds.length > 0}
                    {#each memberUserIds as uid}
                        {#each (data.allUsers ?? []).filter((u) => u.id === uid) as u}
                            <div class="flex justify-between items-center bg-white border rounded-lg px-4 py-3 shadow-sm">
                                <span>{u.name} ({u.email})</span>
                                <button type="button" on:click={() => removeUser(uid)} class="px-3 py-2 bg-red-100 text-red-700 rounded-lg">
                                    Entfernen
                                </button>
                            </div>
                        {/each}
                    {/each}
                {:else}
                    <p class="text-gray-500">Noch keine Benutzer zugeordnet.</p>
                {/if}
            </div>

            <button type="submit" class="mt-4 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg shadow">
                Benutzer-Zuordnung speichern
            </button>
        </form>
    {:else}
        {#if (data.member.userIds ?? []).length > 0}
            <ul class="list-disc ml-5">
                {#each (data.member.userIds ?? []) as uid}
                    {#each (data.allUsers ?? []).filter((u) => u.id === uid) as u}
                        <li>{u.name} ({u.email})</li>
                    {/each}
                {/each}
            </ul>
        {:else}
            <span class="text-gray-500">Keine Benutzer zugeordnet.</span>
        {/if}
    {/if}
</div>
