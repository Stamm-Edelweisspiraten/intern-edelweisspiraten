<script lang="ts">
    export let data;

    // scope: "view" oder "edit"
    const mode = data.scope === "edit" ? "edit" : "view";

    // Form-Felder
    let firstname = data.member.firstname;
    let lastname = data.member.lastname;
    let birthday = data.member.birthday;

    let address_street = data.member.address.street;
    let address_city = data.member.address.city;
    let address_zip = data.member.address.zip;

    let stand = data.member.stand;
    let status = data.member.status;
    let group = data.member.group;

    let entryDate = data.member.entryDate;

    let emails = [...data.member.emails];
    let numbers = [...data.member.numbers];

    function addEmail() {
        emails = [...emails, { label: "", email: "" }];
    }

    function removeEmail(i: number) {
        emails = emails.filter((_, idx) => idx !== i);
    }

    function addNumber() {
        numbers = [...numbers, { label: "", number: "" }];
    }

    function removeNumber(i: number) {
        numbers = numbers.filter((_, idx) => idx !== i);
    }

    // Für User-Suche
    let userSearch = "";
    let showUserList = false;
    let filteredUsers = data.allUsers;

    // Member-ID
    const memberId = data.member.id;
    let displayMember = "";

    // User-IDs initial
    let memberUserIds = Array.isArray(data.member.userIds)
        ? [...data.member.userIds]
        : [];

    // Autocomplete filtern
    $: filteredUsers = (data.allUsers ?? []).filter(u =>
        (u.name ?? "").toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.email ?? "").toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.id ?? "").toLowerCase().includes(userSearch.toLowerCase())
    );

    // User zuordnen
    function addUser(uid: string) {
        if (!memberUserIds.includes(uid)) {
            memberUserIds = [...memberUserIds, uid];
        }
        userSearch = "";
        showUserList = false;
    }

    // Entfernen
    function removeUser(uid: string) {
        memberUserIds = memberUserIds.filter(id => id !== uid);
    }

</script>


<div class="max-w-3xl mx-auto mt-12 p-8 bg-white rounded-2xl shadow-xl border border-gray-200">

    <!-- VIEW MODUS -->
    {#if mode === "view"}
        <h1 class="text-4xl font-bold mb-8 text-gray-900">
            Mitglied ansehen
        </h1>

        <div class="space-y-4 text-lg text-gray-700">

            <p><strong class="text-gray-900">Name:</strong> {data.member.firstname} {data.member.lastname}</p>
            <p><strong class="text-gray-900">Geburtstag:</strong> {data.member.birthday}</p>

            <p><strong class="text-gray-900">Adresse:</strong><br/>
                {data.member.address.street}<br/>
                {data.member.address.zip} {data.member.address.city}
            </p>

            <p><strong class="text-gray-900">Stand:</strong> {data.member.stand}</p>
            <p><strong class="text-gray-900">Status:</strong> {data.member.status}</p>
            <p><strong class="text-gray-900">Gruppe:</strong> {data.member.group}</p>

            <p><strong class="text-gray-900">Eintrittsdatum:</strong> {data.member.entryDate}</p>

            <p><strong class="text-gray-900">Mitglieds-ID:</strong> {data.member.id}</p>

            <div>
                <strong class="text-gray-900">E-Mails:</strong>
                {#if data.member.emails.length > 0}
                    <ul class="list-disc ml-5">
                        {#each data.member.emails as e}
                            <li>{e.label}: {e.email}</li>
                        {/each}
                    </ul>
                {:else}
                    — Keine eingetragen —
                {/if}
            </div>

            <div>
                <strong class="text-gray-900">Telefonnummern:</strong>
                {#if data.member.numbers.length > 0}
                    <ul class="list-disc ml-5">
                        {#each data.member.numbers as n}
                            <li>{n.label}: {n.number}</li>
                        {/each}
                    </ul>
                {:else}
                    — Keine eingetragen —
                {/if}
            </div>

        </div>

        <div class="flex gap-4 mt-10">
            <a
                    href={`/intern/members/${data.member.id}?scope=edit`}
                    data-sveltekit-reload
                    class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
            >
                ✏️ Mitglied bearbeiten
            </a>

            <a
                    href="/intern/members"
                    class="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-medium transition"
            >
                Zurück
            </a>
        </div>


        <!-- EDIT MODUS -->
    {:else}

        <h1 class="text-4xl font-bold mb-8 text-gray-900">
            Mitglied bearbeiten
        </h1>

        <form method="post" action="?/update" class="space-y-7">

            <input type="hidden" name="id" value={data.member.id} />

            <!-- Name -->
            <div class="grid grid-cols-2 gap-5">
                <div>
                    <label class="block text-sm font-medium text-gray-600 mb-1">Vorname</label>
                    <input
                            type="text" name="firstname" bind:value={firstname}
                            class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500"
                            required
                    />
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-600 mb-1">Nachname</label>
                    <input
                            type="text" name="lastname" bind:value={lastname}
                            class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500"
                            required
                    />
                </div>
            </div>

            <!-- Geburtstag -->
            <div>
                <label class="block text-sm font-medium text-gray-600 mb-1">Geburtstag</label>
                <input
                        type="date" name="birthday" bind:value={birthday}
                        class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white"
                        required
                />
            </div>

            <!-- Adresse -->
            <div class="grid grid-cols-1 gap-4">
                <label class="block text-sm font-medium text-gray-600 mb-1">Adresse</label>

                <input type="text" name="address_street" bind:value={address_street}
                       class="w-full px-4 py-3 border rounded-lg bg-gray-50" placeholder="Straße" />

                <input type="text" name="address_zip" bind:value={address_zip}
                       class="w-full px-4 py-3 border rounded-lg bg-gray-50" placeholder="PLZ" />

                <input type="text" name="address_city" bind:value={address_city}
                       class="w-full px-4 py-3 border rounded-lg bg-gray-50" placeholder="Stadt" />
            </div>

            <!-- Stand / Status / Gruppe -->
            <div class="grid grid-cols-3 gap-5">

                <div>
                    <label class="block text-sm font-medium text-gray-600 mb-1">Stand</label>
                    <input type="text" name="stand" bind:value={stand}
                           class="w-full px-4 py-3 border rounded-lg bg-gray-50" />
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-600 mb-1">Status</label>
                    <input type="text" name="status" bind:value={status}
                           class="w-full px-4 py-3 border rounded-lg bg-gray-50" />
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-600 mb-1">Gruppe</label>
                    <input type="text" name="group" bind:value={group}
                           class="w-full px-4 py-3 border rounded-lg bg-gray-50" />
                </div>

            </div>

            <!-- E-Mails -->
            <div>
                <label class="block text-sm font-medium text-gray-600 mb-1">E-Mails</label>

                {#each emails as e, i}
                    <div class="flex gap-3 mb-3">
                        <input type="text" name={`email_label_${i}`} bind:value={e.label}
                               class="flex-1 px-4 py-3 border rounded-lg bg-gray-50" placeholder="Name" />

                        <input type="email" name={`email_email_${i}`} bind:value={e.email}
                               class="flex-1 px-4 py-3 border rounded-lg bg-gray-50" placeholder="E-Mail" />

                        <button type="button" on:click={() => removeEmail(i)}
                                class="px-3 py-2 bg-red-100 text-red-700 rounded-lg">✕</button>
                    </div>
                {/each}

                <button type="button" on:click={addEmail}
                        class="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg">
                    + E-Mail hinzufügen
                </button>
            </div>

            <!-- Telefonnummern -->
            <div>
                <label class="block text-sm font-medium text-gray-600 mb-1">Telefonnummern</label>

                {#each numbers as n, i}
                    <div class="flex gap-3 mb-3">
                        <input type="text" name={`number_label_${i}`} bind:value={n.label}
                               class="flex-1 px-4 py-3 border rounded-lg bg-gray-50" placeholder="Name" />

                        <input type="text" name={`number_number_${i}`} bind:value={n.number}
                               class="flex-1 px-4 py-3 border rounded-lg bg-gray-50" placeholder="Nummer" />

                        <button type="button" on:click={() => removeNumber(i)}
                                class="px-3 py-2 bg-red-100 text-red-700 rounded-lg">✕</button>
                    </div>
                {/each}

                <button type="button" on:click={addNumber}
                        class="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg">
                    + Nummer hinzufügen
                </button>
            </div>

            <!-- Speichern / Abbrechen -->
            <div class="flex gap-4 pt-8">
                <button type="submit"
                        class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition">
                    💾 Speichern
                </button>

                <a href="/intern/members"
                   class="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg transition">
                    Abbrechen
                </a>
            </div>

        </form>

    {/if}
</div>

<!-- ============================= -->
<!--   USER-ZUORDNUNG (Autocomplete)   -->
<!-- ============================= -->
<div class="max-w-3xl mx-auto mt-12 p-8 bg-white rounded-2xl shadow-xl border border-gray-200">

    <h2 class="text-2xl font-semibold mb-4 text-gray-900">
        Benutzerzuordnung (User ↔ Mitglied)
    </h2>

    {#if mode === "edit"}

        <form method="post" action="?/update-users" class="space-y-6">

            <input type="hidden" name="memberId" value={memberId} />
            <input type="hidden" name="userIds" value={JSON.stringify(memberUserIds)} />

            <!-- User Autocomplete -->
            <div class="relative">
                <label class="block text-sm font-medium text-gray-600 mb-1">User hinzufügen</label>

                <input
                        type="text"
                        placeholder="Name, E-Mail oder User-ID eingeben..."
                        bind:value={userSearch}
                        on:focus={() => showUserList = true}
                        class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white
                           focus:ring-2 focus:ring-blue-500 outline-none transition"
                />

                {#if showUserList && filteredUsers.length > 0}
                    <ul class="absolute z-20 mt-1 w-full bg-white border rounded-lg shadow-lg
                               max-h-60 overflow-auto">

                        {#each filteredUsers as u}
                            <!-- nur User anzeigen die noch NICHT zugeordnet sind -->
                            {#if !memberUserIds.includes(u.id)}
                                <li
                                        class="px-4 py-2 hover:bg-blue-50 cursor-pointer"
                                        on:click={() => addUser(u.id)}
                                >
                                    <strong>{u.name}</strong>
                                    <span class="text-gray-500 ml-2">({u.email})</span>
                                </li>
                            {/if}
                        {/each}
                    </ul>
                {/if}
            </div>

            <!-- Zugeordnete User -->
            <div class="space-y-3 mt-4">
                {#if memberUserIds.length > 0}
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
                {:else}
                    <p class="text-gray-500">Noch keine Benutzer zugeordnet.</p>
                {/if}
            </div>

            <!-- Speichern -->
            <button
                    type="submit"
                    class="mt-4 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg shadow"
            >
                💾 Benutzer-Zuordnung speichern
            </button>

        </form>

    {:else}

        <!-- View Mode -->
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