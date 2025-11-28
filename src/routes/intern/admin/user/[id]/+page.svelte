<script lang="ts">
    export let data;


    let name = data.user.name;
    let email = data.user.email;
    const mode = data.scope === "edit" ? "edit" : "view";

    // Mehrere Member pro User
    let memberIds = Array.isArray(data.user.memberIds)
        ? [...data.user.memberIds]
        : [];

    let displayMember = "";

    // Member-Autocomplete
    let memberSearch = "";
    let memberShowList = false;
    let memberSuggestions: any[] = [];

    // Autocomplete Filter
    $: memberSuggestions =
        memberSearch.length > 0
            ? data.members.filter((m) =>
                (m.firstname + " " + m.lastname)
                    .toLowerCase()
                    .includes(memberSearch.toLowerCase()) ||
                m.id.toLowerCase().includes(memberSearch.toLowerCase())
            )
            : [];

    // Autocomplete-Anzeige für bestehenden Wert
    $: memberSearch === "" && memberIds.length === 1
        ? (() => {
            const m = data.members.find(mem => mem.id === memberIds[0]);
            if (m) {
                displayMember = `${m.id} (${m.firstname} ${m.lastname})`;
            }
        })()
        : null;

    function addMemberToUser(id: string) {
        id = String(id);
        if (!memberIds.includes(id)) {
            memberIds = [...memberIds, id];
        }
    }

    // Entfernen
    function removeMemberFromUser(id: string) {
        id = String(id);
        memberIds = memberIds.filter(m => m !== id);
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
            <p><strong class="text-gray-900">Member-ID:</strong> {data.user.memberId ?? "—"}</p>

            <p>
                <strong class="text-gray-900">Erstellt:</strong>
                {new Date(data.user.createdAt).toLocaleString("de-DE")}
            </p>

            <p><strong class="text-gray-900">User-ID:</strong> {data.user.id ?? "—"}</p>
        </div>

        <div class="flex gap-4 mt-10">
            <a
                    href={`/intern/admin/user/${data.user.id}?scope=edit`}
                    data-sveltekit-reload
                    class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
            >
                ✏️ Benutzer bearbeiten
            </a>

            <a
                    href="/intern/admin/user"
                    class="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-medium transition"
            >
                Zurück
            </a>
        </div>

    {:else}

        <h1 class="text-4xl font-bold mb-8 text-gray-900 flex items-center gap-3">
            Benutzer bearbeiten
        </h1>

        <form method="post" action="?/update" class="space-y-6">

            <input type="hidden" name="id" value={data.user.id} />

            <!-- Name -->
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

            <!-- Email -->
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

            <!-- Action buttons -->
            <div class="flex gap-4 pt-6">
                <button
                        type="submit"
                        class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
                >
                    💾 Speichern
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

<!-- ============================= -->
<!--   MEMBER-ZUORDNUNG (Autocomplete)   -->
<!-- ============================= -->
<div class="max-w-3xl mx-auto mt-12 p-8 bg-white rounded-2xl shadow-xl border border-gray-200">

    <h2 class="text-2xl font-semibold mb-4 text-gray-900">
        Mitgliederzuordnung (User ↔ Mitglied)
    </h2>

    {#if mode === "edit"}

        <form method="post" action="?/update-members" class="space-y-6">

            <input type="hidden" name="userId" value={data.user.id} />
            <input type="hidden" name="memberIds" value={JSON.stringify(memberIds)} />

            <!-- Member Autocomplete -->
            <div class="relative">
                <label class="block text-sm font-medium text-gray-600 mb-1">
                    Member hinzufügen
                </label>

                <input
                        type="text"
                        placeholder="Name oder Member-ID eingeben..."
                        bind:value={memberSearch}
                        on:focus={() => memberShowList = true}
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

            <!-- Zugeordnete Member -->
            <div class="space-y-3 mt-4">
                {#if memberIds.length > 0}
                    {#each memberIds as id}
                        {#each data.members.filter(m => m.id === id) as m}
                            <div class="flex justify-between items-center bg-white border rounded-lg px-4 py-3 shadow-sm">
                                <span>{m.firstname} {m.lastname} ({m.id})</span>
                                <button
                                        type="button"
                                        on:click={() => removeMemberFromUser(id)}
                                        class="px-3 py-2 bg-red-100 text-red-700 rounded-lg"
                                >
                                    ✕ Entfernen
                                </button>
                            </div>
                        {/each}
                    {/each}
                {:else}
                    <p class="text-gray-500">Keine Mitglieder zugeordnet.</p>
                {/if}
            </div>

            <!-- Speichern -->
            <button
                    type="submit"
                    class="mt-4 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg shadow"
            >
                💾 Mitglieder-Zuordnung speichern
            </button>

        </form>

    {:else}

        <!-- VIEW MODE -->
        {#if (data.user.memberIds ?? []).length > 0}
            <ul class="list-disc ml-5">
                {#each (data.user.memberIds ?? []) as id}
                    {#each data.members.filter(m => m.id === id) as m}
                        <li>{m.firstname} {m.lastname} ({m.id})</li>
                    {/each}
                {/each}
            </ul>
        {:else}
            — Keine Mitglieder zugeordnet —
        {/if}

    {/if}
</div>


