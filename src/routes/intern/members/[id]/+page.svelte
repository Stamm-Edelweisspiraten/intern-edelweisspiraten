<script lang="ts">
    export let data;

    // Mode
    const mode = data.scope === "edit" ? "edit" : "view";

    // WICHTIG: echtes Disabled Flag für Svelte
    const disabled = mode === "view" ? true : undefined;

    // Form Felder
    let firstname = data.member.firstname;
    let lastname = data.member.lastname;
    let birthday = data.member.birthday;

    let address_street = data.member.address.street;
    let address_city = data.member.address.city;
    let address_zip = data.member.address.zip;

    let stand = data.member.stand;
    let status = data.member.status;

    // Gruppen
    let selectedGroups: string[] = [...(data.member.groups ?? [])];
    let groupDropdown = false;

    function toggleGroup(id: string) {
        if (disabled) return;
        selectedGroups = selectedGroups.includes(id)
            ? selectedGroups.filter(x => x !== id)
            : [...selectedGroups, id];
    }

    // Entry Date
    let entryDate = data.member.entryDate;

    // Emails
    let emails = [...data.member.emails];
    function addEmail() {
        if (disabled) return;
        emails = [...emails, { label: "", email: "" }];
    }
    function removeEmail(i: number) {
        if (disabled) return;
        emails = emails.filter((_, idx) => idx !== i);
    }

    // Numbers
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

    let memberUserIds = Array.isArray(data.member.userIds)
        ? [...data.member.userIds]
        : [];

    $: filteredUsers = (data.allUsers ?? []).filter(u =>
        (u.name ?? "").toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.email ?? "").toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.id ?? "").toLowerCase().includes(userSearch.toLowerCase())
    );

    function addUser(uid: string) {
        if (disabled) return;
        if (!memberUserIds.includes(uid)) {
            memberUserIds = [...memberUserIds, uid];
        }
        showUserList = false;
        userSearch = "";
    }

    function removeUser(uid: string) {
        if (disabled) return;
        memberUserIds = memberUserIds.filter(id => id !== uid);
    }
</script>


<!-- =============================================== -->
<!--  EINHEITLICHER BLOCK – VIEW = EDIT, aber disabled -->
<!-- =============================================== -->
<div class="max-w-3xl mx-auto mt-12 p-8 bg-white rounded-2xl shadow-xl border">

    <h1 class="text-4xl font-bold mb-8 text-gray-900">
        {mode === "view" ? "Mitglied ansehen" : "Mitglied bearbeiten"}
    </h1>

    <form method="post" action={mode === "edit" ? "?/update" : undefined} class="space-y-7">

        <input type="hidden" name="id" value={data.member.id} />
        <input type="hidden" name="groups" value={JSON.stringify(selectedGroups)} />

        <!-- Name -->
        <div class="grid grid-cols-2 gap-5">
            <div>
                <label>Vorname</label>
                <input
                        type="text"
                        name="firstname"
                        bind:value={firstname}
                        disabled={disabled}
                        class="w-full px-4 py-3 border rounded-lg bg-gray-50 disabled:opacity-70"
                />
            </div>

            <div>
                <label>Nachname</label>
                <input
                        type="text"
                        name="lastname"
                        bind:value={lastname}
                        disabled={disabled}
                        class="w-full px-4 py-3 border rounded-lg bg-gray-50 disabled:opacity-70"
                />
            </div>
        </div>

        <!-- Geburtstag -->
        <div>
            <label>Geburtstag</label>
            <input
                    type="date"
                    name="birthday"
                    bind:value={birthday}
                    disabled={disabled}
                    class="w-full px-4 py-3 border rounded-lg bg-gray-50 disabled:opacity-70"
            />
        </div>

        <!-- Adresse -->
        <div>
            <label>Adresse</label>

            <input
                    type="text"
                    name="address_street"
                    bind:value={address_street}
                    disabled={disabled}
                    placeholder="Straße"
                    class="w-full px-4 py-3 border rounded-lg bg-gray-50 mb-2 disabled:opacity-70"
            />

            <input
                    type="text"
                    name="address_zip"
                    bind:value={address_zip}
                    disabled={disabled}
                    placeholder="PLZ"
                    class="w-full px-4 py-3 border rounded-lg bg-gray-50 mb-2 disabled:opacity-70"
            />

            <input
                    type="text"
                    name="address_city"
                    bind:value={address_city}
                    disabled={disabled}
                    placeholder="Stadt"
                    class="w-full px-4 py-3 border rounded-lg bg-gray-50 disabled:opacity-70"
            />
        </div>

        <!-- Stand / Status / Gruppen -->
        <div class="grid grid-cols-3 gap-5">

            <!-- Stand -->
            <div>
                <label>Stand</label>
                <select
                        name="stand"
                        bind:value={stand}
                        disabled={disabled}
                        class="w-full px-4 py-3 border rounded-lg bg-gray-50 disabled:opacity-70"
                >
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
                <label>Status</label>
                <select
                        name="status"
                        bind:value={status}
                        disabled={disabled}
                        class="w-full px-4 py-3 border rounded-lg bg-gray-50 disabled:opacity-70"
                >
                    <option>aktiv</option>
                    <option>passiv</option>
                    <option>gekündigt</option>
                </select>
            </div>

            <!-- Gruppen -->
            <div class="relative">
                <label>Gruppen</label>

                <button
                        type="button"
                        class="w-full text-left px-4 py-3 border rounded-lg bg-gray-50 disabled:opacity-70"
                        disabled={disabled}
                        on:click={() => groupDropdown = !groupDropdown}
                >
                    {#if selectedGroups.length === 0}
                        Keine Gruppen ausgewählt
                    {:else}
                        {selectedGroups.length} Gruppe(n)
                    {/if}
                </button>

                {#if groupDropdown && !disabled}
                    <div class="absolute z-20 w-full mt-1 bg-white border rounded-lg shadow-lg p-3 max-h-64 overflow-auto">
                        {#each data.groups as g}
                            <label class="flex items-center gap-2 py-1 cursor-pointer">
                                <input
                                        type="checkbox"
                                        checked={selectedGroups.includes(g.id)}
                                        on:change={() => toggleGroup(g.id)}
                                />
                                <span>{g.name} ({g.type})</span>
                            </label>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>

        <!-- Emails -->
        <div>
            <label>E-Mails</label>

            {#each emails as e, i}
                <div class="flex gap-3 mb-3">
                    <input
                            name={`email_label_${i}`}
                            bind:value={e.label}
                            disabled={disabled}
                            placeholder="Bezeichnung"
                            class="flex-1 px-4 py-3 border rounded-lg bg-gray-50 disabled:opacity-70"
                    />

                    <input
                            name={`email_email_${i}`}
                            bind:value={e.email}
                            disabled={disabled}
                            placeholder="E-Mail"
                            class="flex-1 px-4 py-3 border rounded-lg bg-gray-50 disabled:opacity-70"
                    />

                    {#if !disabled}
                        <button
                                type="button"
                                on:click={() => removeEmail(i)}
                                class="px-3 py-2 bg-red-100 text-red-700 rounded-lg"
                        >
                            ✕
                        </button>
                    {/if}
                </div>
            {/each}

            {#if !disabled}
                <button type="button" on:click={addEmail}
                        class="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg">
                    + E-Mail hinzufügen
                </button>
            {/if}
        </div>

        <!-- Nummern -->
        <div>
            <label>Telefonnummern</label>

            {#each numbers as n, i}
                <div class="flex gap-3 mb-3">
                    <input
                            name={`number_label_${i}`}
                            bind:value={n.label}
                            disabled={disabled}
                            placeholder="Bezeichnung"
                            class="flex-1 px-4 py-3 border rounded-lg bg-gray-50 disabled:opacity-70"
                    />

                    <input
                            name={`number_number_${i}`}
                            bind:value={n.number}
                            disabled={disabled}
                            placeholder="Nummer"
                            class="flex-1 px-4 py-3 border rounded-lg bg-gray-50 disabled:opacity-70"
                    />

                    {#if !disabled}
                        <button
                                type="button"
                                on:click={() => removeNumber(i)}
                                class="px-3 py-2 bg-red-100 text-red-700 rounded-lg"
                        >
                            ✕
                        </button>
                    {/if}
                </div>
            {/each}

            {#if !disabled}
                <button
                        type="button"
                        on:click={addNumber}
                        class="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg"
                >
                    + Nummer hinzufügen
                </button>
            {/if}
        </div>


        <!-- Speichern / Abbrechen -->
        {#if mode === "edit"}
            <div class="flex gap-4 pt-8">
                <button type="submit"
                        class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                    💾 Speichern
                </button>

                <a href="/intern/members"
                   class="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg">
                    Abbrechen
                </a>
            </div>
        {/if}

        {#if mode === "view"}
            <div class="flex gap-4 mt-10">
                <a href={`/intern/members/${data.member.id}?scope=edit`}
                   data-sveltekit-reload
                   class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                    ✏️ Bearbeiten
                </a>

                <a href="/intern/members"
                   class="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg">
                    Zurück
                </a>
            </div>
        {/if}

    </form>
</div>


<!-- ===================================== -->
<!-- USER ZUORDNUNG -->
<!-- ===================================== -->
<div class="max-w-3xl mx-auto mt-12 p-8 bg-white rounded-2xl shadow-xl border">

    <h2 class="text-2xl font-semibold mb-4">Benutzerzuordnung</h2>

    {#if mode === "edit"}

        <form method="post" action="?/update-users">
            <input type="hidden" name="memberId" value={memberId} />
            <input type="hidden" name="userIds" value={JSON.stringify(memberUserIds)} />

            <div class="relative">
                <label>User hinzufügen</label>

                <input
                        type="text"
                        placeholder="Name, E-Mail oder ID..."
                        bind:value={userSearch}
                        on:focus={() => showUserList = true}
                        class="w-full px-4 py-3 border rounded-lg bg-gray-50"
                />

                {#if showUserList && filteredUsers.length > 0}
                    <ul class="absolute z-20 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-60 overflow-auto">
                        {#each filteredUsers as u}
                            {#if !memberUserIds.includes(u.id)}
                                <li class="px-4 py-2 hover:bg-blue-50 cursor-pointer"
                                    on:click={() => addUser(u.id)}>
                                    <strong>{u.name}</strong>
                                    <span class="text-gray-500 ml-2">({u.email})</span>
                                </li>
                            {/if}
                        {/each}
                    </ul>
                {/if}
            </div>

            <div class="space-y-3 mt-4">
                {#each memberUserIds as uid}
                    {#each (data.allUsers ?? []).filter(u => u.id === uid) as u}
                        <div class="flex justify-between items-center bg-white border rounded-lg px-4 py-3 shadow-sm">
                            <span>{u.name} ({u.email})</span>

                            <button
                                    type="button"
                                    on:click={() => removeUser(uid)}
                                    class="px-3 py-2 bg-red-100 text-red-700 rounded-lg"
                            >
                                ✕ Entfernen
                            </button>
                        </div>
                    {/each}
                {/each}

                {#if memberUserIds.length === 0}
                    <p class="text-gray-500">Keine Benutzer zugeordnet.</p>
                {/if}
            </div>

            <button type="submit"
                    class="mt-4 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg shadow">
                💾 Benutzer speichern
            </button>

        </form>

    {:else}

        {#if (data.member.userIds ?? []).length > 0}
            <ul class="list-disc ml-5">
                {#each (data.member.userIds ?? []) as uid}
                    {#each (data.allUsers ?? []).filter(u => u.id === uid) as u}
                        <li>{u.name} ({u.email})</li>
                    {/each}
                {/each}
            </ul>
        {:else}
            — Keine Benutzer zugeordnet —
        {/if}

    {/if}
</div>
