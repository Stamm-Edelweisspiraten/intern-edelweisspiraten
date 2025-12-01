<script lang="ts">
    export let data;

    let search = "";

    // Live gefilterte Gruppenliste
    $: filteredGroups = data.groups.filter((group) => {
        const q = search.toLowerCase();

        return (
            group.name.toLowerCase().includes(q) ||
            group.type.toLowerCase().includes(q) ||
            group.id.toLowerCase().includes(q) ||
            group.meeting_time.toLowerCase().includes(q)
        );
    });
</script>

<div class="max-w-5xl mx-auto mt-12">

    <!-- Titel + Aktionen -->
    <div class="flex justify-between items-center mb-8">
        <h1 class="text-4xl font-bold text-gray-900">Gruppenverwaltung</h1>

        <a
                href="/intern/admin/groups/create"
                class="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow transition font-medium"
        >
            + Neue Gruppe
        </a>
    </div>

    <!-- SUCHFELD -->
    <div class="mb-6">
        <input
                type="text"
                placeholder="Suche nach Name, Typ, ID oder Gruppenstunden..."
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
                <th class="px-6 py-4 text-sm font-semibold text-gray-700">Typ</th>
                <th class="px-6 py-4 text-sm font-semibold text-gray-700">Gruppenstunden</th>
                <th class="px-6 py-4 text-sm font-semibold text-gray-700 text-right">Aktionen</th>
            </tr>
            </thead>

            <tbody class="divide-y divide-gray-200">
            {#each filteredGroups as group}
                <tr class="hover:bg-gray-50 transition">

                    <td class="px-6 py-4 font-medium text-gray-900">
                        {group.name}
                    </td>

                    <td class="px-6 py-4 text-gray-700 capitalize">
                        {group.type}
                    </td>

                    <td class="px-6 py-4 text-gray-700">
                        {group.meeting_time}
                    </td>

                    <td class="px-6 py-4 text-right whitespace-nowrap flex justify-end gap-2">

                        <!-- Ansehen -->
                        <a
                                href={`/intern/admin/groups/${group.id}`}
                                class="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition text-gray-700 shadow-sm"
                        >
                            👁️
                        </a>

                        <!-- Bearbeiten -->
                        <a
                                href={`/intern/admin/groups/${group.id}?scope=edit`}
                                class="px-3 py-2 rounded-lg bg-blue-100 hover:bg-blue-200 transition text-blue-700 shadow-sm"
                        >
                            ✏️
                        </a>

                        <!-- Löschen -->
                        <form method="post" action="?/delete" class="inline">
                            <input type="hidden" name="id" value={group.id} />

                            <button
                                    type="submit"
                                    on:click={() => confirm("Willst du diese Gruppe wirklich löschen?")}
                                    class="px-3 py-2 rounded-lg bg-red-100 hover:bg-red-200 transition text-red-700 shadow-sm"
                            >
                                🗑️
                            </button>
                        </form>

                    </td>
                </tr>
            {/each}

            {#if filteredGroups.length === 0}
                <tr>
                    <td colspan="4" class="px-6 py-8 text-center text-gray-500">
                        Keine Gruppen gefunden.
                    </td>
                </tr>
            {/if}
            </tbody>
        </table>
    </div>

</div>
