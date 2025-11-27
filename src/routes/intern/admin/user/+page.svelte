<script lang="ts">
    export let data;

    let search = "";

    // Hilfsfunktion: Member-Name anhand einer ID holen
    function getMemberName(id: string | null) {
        if (!id) return "—";
        const m = data.members.find((m) => m.id === id);
        return m ? m.name : id; // Fallback falls Member gelöscht wurde
    }

    // Live gefilterte User-Liste
    $: filteredUsers = data.users.filter((user) => {
        const q = search.toLowerCase();

        return (
            user.name.toLowerCase().includes(q) ||
            user.email.toLowerCase().includes(q) ||
            user.id.toLowerCase().includes(q) ||
            (getMemberName(user.memberId).toLowerCase().includes(q))
        );
    });
</script>

<div class="max-w-5xl mx-auto mt-12">

    <!-- Titel + Aktionen -->
    <div class="flex justify-between items-center mb-8">
        <h1 class="text-4xl font-bold text-gray-900">Benutzerverwaltung</h1>

        <a
                href="/intern/admin/user/create"
                class="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow transition font-medium"
        >
            + Neuer Benutzer
        </a>
    </div>

    <!-- SUCHFELD -->
    <div class="mb-6">
        <input
                type="text"
                placeholder="Suche nach Name, E-Mail, ID oder Member-ID..."
                bind:value={search}
                class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white
                   focus:ring-2 focus:ring-blue-500 outline-none transition text-gray-700"
        />
    </div>

    <div class="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
        <table class="w-full text-left">
            <thead class="bg-gray-100 border-b border-gray-300">
            <tr>
                <th class="px-6 py-4 text-sm font-semibold text-gray-700">Name</th>
                <th class="px-6 py-4 text-sm font-semibold text-gray-700">E-Mail</th>
                <th class="px-6 py-4 text-sm font-semibold text-gray-700">Member</th>
                <th class="px-6 py-4 text-sm font-semibold text-gray-700 text-right">Aktionen</th>
            </tr>
            </thead>

            <tbody class="divide-y divide-gray-200">
            {#each filteredUsers as user}
                <tr class="hover:bg-gray-50 transition">

                    <td class="px-6 py-4 font-medium text-gray-900">
                        {user.name}
                    </td>

                    <td class="px-6 py-4 text-gray-700">
                        {user.email}
                    </td>

                    <td class="px-6 py-4 text-gray-700">
                        {getMemberName(user.memberId) ?? "—"}
                    </td>

                    <td class="px-6 py-4 text-right whitespace-nowrap flex justify-end gap-2">

                        <!-- Ansehen -->
                        <a
                                href={`/intern/admin/user/${user.id}`}
                                class="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition text-gray-700 shadow-sm"
                                data-tip="Ansehen"
                        >
                            👁️
                        </a>

                        <!-- Bearbeiten -->
                        <a
                                href={`/intern/admin/user/${user.id}?scope=edit`}
                                class="px-3 py-2 rounded-lg bg-blue-100 hover:bg-blue-200 transition text-blue-700 shadow-sm"
                                data-tip="Bearbeiten"
                        >
                            ✏️
                        </a>

                        <!-- Löschen -->
                        <form method="post" action="?/delete" class="inline">
                            <input type="hidden" name="id" value={user.id} />

                            <button
                                    type="submit"
                                    class="px-3 py-2 rounded-lg bg-red-100 hover:bg-red-200 transition text-red-700 shadow-sm"
                                    data-tip="Löschen"
                                    on:click={() => confirm("Willst du diesen Benutzer wirklich löschen?")}
                            >
                                🗑️
                            </button>
                        </form>

                    </td>
                </tr>
            {/each}

            {#if filteredUsers.length === 0}
                <tr>
                    <td colspan="4" class="px-6 py-8 text-center text-gray-500">
                        Keine Benutzer gefunden.
                    </td>
                </tr>
            {/if}
            </tbody>
        </table>
    </div>

</div>
