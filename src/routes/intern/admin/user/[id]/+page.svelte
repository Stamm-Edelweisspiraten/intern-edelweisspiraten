<script lang="ts">
    export let data;

    let name = data.user.name;
    let email = data.user.email;
    const mode = data.scope === "edit" ? "edit" : "view";
    let selectedGroups = Array.isArray(data.user.groups) ? [...data.user.groups] : [];

    // Mehrere Member pro User
    let memberIds = Array.isArray(data.user.memberIds) ? [...data.user.memberIds] : [];

    // Member-Autocomplete
    let memberSearch = "";
    let memberShowList = false;
    let memberSuggestions: any[] = [];

    // Autocomplete Filter
    $: memberSuggestions =
        memberSearch.length > 0
            ? data.members.filter((m) =>
                (m.firstname + " " + m.lastname).toLowerCase().includes(memberSearch.toLowerCase()) ||
                m.id.toLowerCase().includes(memberSearch.toLowerCase())
            )
            : [];

    function addMemberToUser(id: string) {
        id = String(id);
        if (!memberIds.includes(id)) {
            memberIds = [...memberIds, id];
        }
    }

    function removeMemberFromUser(id: string) {
        id = String(id);
        memberIds = memberIds.filter((m) => m !== id);
    }
</script>

<div class="max-w-3xl mx-auto mt-12 p-8 bg-white rounded-2xl shadow-xl border border-gray-200">
    {#if mode === "view"}

        <h1 class="text-4xl font-bold mb-8 text-gray-900 flex items-center gap-3">
            Benutzer ansehen
        </h1>

        <div class="space-y-4 text-lg text-gray-700">
            <p><strong class="text-gray-900">Name:</strong> {data.user.name}</p>
            <p><strong class="text-gray-900">E-Mail:</strong> {data.user.email}</p>
            <p><strong class="text-gray-900">Member-ID:</strong> {data.user.memberId ?? "-"}</p>

            <div>
                <strong class="text-gray-900">Gruppen (Authentik):</strong>
                {#if (data.user.groups ?? []).length > 0}
                    <ul class="list-disc ml-5">
                        {#each data.user.groups as gid}
                            {#if data.authentikGroups.find((g) => g.pk?.toString?.() === gid)}
                                <li>{data.authentikGroups.find((g) => g.pk?.toString?.() === gid)?.name} ({gid})</li>
                            {:else}
                                <li>{gid}</li>
                            {/if}
                        {/each}
                    </ul>
                {:else}
                    <span class="text-gray-500 ml-1">Keine Gruppen</span>
                {/if}
            </div>

            <p>
                <strong class="text-gray-900">Erstellt:</strong>
                {new Date(data.user.createdAt).toLocaleString("de-DE")}
            </p>

            <p><strong class="text-gray-900">User-ID:</strong> {data.user.id ?? "-"}</p>
        </div>

        <div class="flex gap-4 mt-10 flex-wrap">
            <a
                    href={`/intern/admin/user/${data.user.id}?scope=edit`}
                    data-sveltekit-reload
                    class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
            >
                Benutzer bearbeiten
            </a>

            {#if data.canImpersonate}
                <form method="post" action="/intern/admin/impersonate">
                    <input type="hidden" name="userId" value={data.user.id} />
                    <button
                            type="submit"
                            class="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition border border-amber-300 shadow-sm"
                    >
                        Als diesen Benutzer ansehen
                    </button>
                </form>
            {/if}

            <a
                    href="/intern/admin/user"
                    class="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-medium transition"
            >
                Zurueck
            </a>
        </div>

    {:else}

        <h1 class="text-4xl font-bold mb-8 text-gray-900 flex items-center gap-3">
            Benutzer bearbeiten
        </h1>

        <form method="post" action="?/update" class="space-y-6">
            <input type="hidden" name="id" value={data.user.id} />

            <div>
                <label class="block text-sm font-medium text-gray-600 mb-1">Name</label>
                <input
                        type="text"
                        name="name"
                        bind:value={name}
                        required
                        class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition"
                />
            </div>

            <div>
                <label class="block text-sm font-medium text-gray-600 mb-1">E-Mail</label>
                <input
                        type="email"
                        name="email"
                        bind:value={email}
                        required
                        class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition"
                />
            </div>

            <div>
                <label class="block text-sm font-medium text-gray-600 mb-1">User-ID</label>
                <input
                        type="text"
                        value={data.user.id}
                        class="w-full px-4 py-3 border rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
                        disabled
                />
            </div>

            <div class="flex gap-4 pt-6">
                <button
                        type="submit"
                        class="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition"
                >
                    Speichern
                </button>

                <a
                        href={`/intern/admin/user/`}
                        data-sveltekit-reload
                        class="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-medium transition"
                >
                    Abbrechen
                </a>
            </div>
        </form>

    {/if}
</div>

{#if mode === "edit"}
    <div class="max-w-3xl mx-auto mt-10 p-8 bg-white rounded-2xl shadow-xl border border-gray-200">
        <h2 class="text-2xl font-semibold mb-4 text-gray-900">Gruppen in Authentik</h2>
        <p class="text-sm text-gray-600 mb-4">Waehle, in welchen Gruppen der Benutzer in Authentik sein soll.</p>

        <form method="post" action="?/update-groups" class="space-y-4">
            <input type="hidden" name="userId" value={data.user.id} />

            <label class="block text-sm font-medium text-gray-700">Gruppen auswaehlen</label>
            <select
                    name="groups"
                    multiple
                    bind:value={selectedGroups}
                    class="w-full h-56 px-4 py-3 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
                {#each data.authentikGroups as group}
                    <option value={group.pk?.toString?.()}>{group.name}</option>
                {/each}
            </select>
            <p class="text-xs text-gray-500">STRG/CMD gedrueckt halten fuer Mehrfachauswahl.</p>

            <button
                    type="submit"
                    class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
            >
                Gruppen speichern
            </button>
        </form>
    </div>
{/if}

<div class="max-w-3xl mx-auto mt-12 p-8 bg-white rounded-2xl shadow-xl border border-gray-200">

    <h2 class="text-2xl font-semibold mb-4 text-gray-900">
        Mitgliederzuordnung (User &lt;-&gt; Mitglied)
    </h2>

    {#if mode === "edit"}

        <form method="post" action="?/update-members" class="space-y-6">

            <input type="hidden" name="userId" value={data.user.id} />
            <input type="hidden" name="memberIds" value={JSON.stringify(memberIds)} />

            <div class="relative">
                <label class="block text-sm font-medium text-gray-600 mb-1">
                    Member hinzufuegen
                </label>

                <input
                        type="text"
                        placeholder="Name oder Member-ID eingeben..."
                        bind:value={memberSearch}
                        on:focus={() => (memberShowList = true)}
                        class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white
                           focus:ring-2 focus:ring-blue-500 outline-none transition"
                />

                {#if memberShowList && memberSuggestions.length > 0}
                    <ul
                            class="absolute z-20 mt-1 w-full bg-white border rounded-lg shadow-lg
                               max-h-60 overflow-auto"
                    >
                        {#each memberSuggestions as m}
                            {#if !memberIds.includes(m.id)}
                                <li
                                        class="px-4 py-2 hover:bg-blue-50 cursor-pointer"
                                        role="button"
                                        tabindex="0"
                                        on:click={() => addMemberToUser(m.id)}
                                        on:keydown={(e) => e.key === "Enter" && addMemberToUser(m.id)}
                                >
                                    <strong>{m.firstname} {m.lastname}</strong>
                                    <span class="text-gray-500 ml-2">({m.id})</span>
                                </li>
                            {/if}
                        {/each}
                    </ul>
                {/if}
            </div>

            <div class="space-y-3 mt-4">
                {#if memberIds.length > 0}
                    {#each memberIds as id}
                        {#each data.members.filter((m) => m.id === id) as m}
                            <div class="flex justify-between items-center bg-white border rounded-lg px-4 py-3 shadow-sm">
                                <span>{m.firstname} {m.lastname} ({m.id})</span>
                                <button
                                        type="button"
                                        on:click={() => removeMemberFromUser(id)}
                                        class="px-3 py-2 bg-red-100 text-red-700 rounded-lg"
                                >
                                    Entfernen
                                </button>
                            </div>
                        {/each}
                    {/each}
                {:else}
                    <p class="text-gray-500">Keine Mitglieder zugeordnet.</p>
                {/if}
            </div>

            <button
                    type="submit"
                    class="mt-4 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg shadow"
            >
                Mitglieder-Zuordnung speichern
            </button>

        </form>

    {:else}

        {#if (data.user.memberIds ?? []).length > 0}
            <ul class="list-disc ml-5">
                {#each (data.user.memberIds ?? []) as id}
                    {#each data.members.filter((m) => m.id === id) as m}
                        <li>{m.firstname} {m.lastname} ({m.id})</li>
                    {/each}
                {/each}
            </ul>
        {:else}
            <span class="text-gray-500">Keine Mitglieder zugeordnet.</span>
        {/if}

    {/if}
</div>
