<script lang="ts">
    export let data;


    let name = data.user.name;
    let email = data.user.email;
    const mode = data.scope === "edit" ? "edit" : "view";

    // Felder aus User
    let memberId = data.user.memberId ?? "";
    let displayMember = "";

    // Autocomplete State
    let search = "";
    let showList = false;
    let suggestions: any[] = [];

    $: if (search.length > 0) {
        suggestions = data.members.filter((m) =>
            (m.firstname + " " + m.lastname).toLowerCase().includes(search.toLowerCase()) ||
            m.id.toLowerCase().includes(search.toLowerCase())
        );
    } else {
        suggestions = [];
    }

    $: if (memberId && search === "") {
        const m = data.members.find(mem => mem.id === memberId);
        if (m) {
            displayMember = `${m.id} (${m.firstname} ${m.lastname})`;
        }
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

            <!-- Member-ID Autocomplete -->
            <div class="relative">
                <label class="block text-sm font-medium text-gray-600 mb-1">Member</label>

                <input
                        type="text"
                        placeholder="Member ID oder Name eingeben..."
                        bind:value={search}
                        on:focus={() => showList = true}
                        class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white
               focus:ring-2 focus:ring-blue-500 outline-none transition"
                />

                {#if showList && suggestions.length > 0}
                    <ul
                            class="absolute z-20 mt-1 w-full bg-white border rounded-lg shadow-lg
                   max-h-60 overflow-auto"
                    >
                        {#each suggestions as m}
                            <li
                                    class="px-4 py-2 hover:bg-blue-50 cursor-pointer"
                                    on:click={() => {
                        memberId = m.id;
                        search = `${m.id} (${m.firstname} ${m.lastname})`;
                        showList = false;
                    }}
                            >
                                <strong>{m.firstname} {m.lastname}</strong>
                                <span class="text-gray-500 text-sm ml-2">({m.id})</span>
                            </li>
                        {/each}
                    </ul>
                {/if}
            </div>
            {#if memberId}
                <button
                        type="button"
                        class="mt-2 text-red-600 text-sm underline"
                        on:click={() => {
            memberId = "";
            search = "";
        }}
                >
                    ❌ Mitglied entfernen
                </button>
            {/if}


            <!-- Hidden input für das Backend -->
            <input type="hidden" name="memberId" value={memberId} />


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
