<script lang="ts">
    export let data;

    let search = "";

    $: filteredGroups = (data.groups ?? []).filter((group: any) => {
        const q = search.toLowerCase();
        return (
            group.name.toLowerCase().includes(q) ||
            group.type.toLowerCase().includes(q) ||
            group.id.toLowerCase().includes(q) ||
            group.meeting_time.toLowerCase().includes(q)
        );
    });
</script>

<div class="max-w-6xl mx-auto mt-16 space-y-8">
    <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
            <p class="text-sm font-semibold text-gray-700 uppercase tracking-wide">Admin</p>
            <h1 class="text-4xl font-bold text-gray-900">Gruppenverwaltung</h1>
            <p class="text-sm text-gray-600 mt-1">Gruppen anlegen, suchen und öffnen.</p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
            <a
                    href="/intern/admin"
                    class="inline-flex items-center gap-2 px-4 py-3 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl font-semibold text-gray-800 shadow-sm transition"
            >
                <span class="bi bi-arrow-left"></span>
                Zurück
            </a>
            <a
                    href="/intern/admin/groups/create"
                    class="inline-flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-sm transition"
            >
                <span class="bi bi-plus-circle"></span>
                Neue Gruppe
            </a>
        </div>
    </div>

    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-3">
            <div class="w-full md:w-80">
                <label class="text-sm font-semibold text-gray-700">Suchen</label>
                <div class="mt-1 relative">
                    <span class="bi bi-search absolute left-3 top-2.5 text-gray-400"></span>
                    <input
                            type="text"
                            placeholder="Name, Typ, ID oder Gruppenstunden"
                            bind:value={search}
                            class="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-300 bg-white shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-400 text-sm text-gray-700"
                    />
                </div>
            </div>
            <span class="text-sm text-gray-500">{filteredGroups.length} Einträge</span>
        </div>

        <div class="overflow-x-auto hidden xl:block">
            <table class="w-full min-w-full divide-y divide-gray-200 text-sm">
                <thead class="bg-gray-50">
                <tr>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Typ</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Gruppenstunden</th>
                    <th class="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Aktionen</th>
                </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                {#if filteredGroups.length === 0}
                    <tr>
                        <td colspan="4" class="px-6 py-6 text-center text-gray-500">Keine Gruppen gefunden.</td>
                    </tr>
                {:else}
                    {#each filteredGroups as group}
                        <tr class="hover:bg-gray-50 transition">
                            <td class="px-6 py-4 font-semibold text-gray-900">{group.name}</td>
                            <td class="px-6 py-4 text-gray-700 capitalize">{group.type}</td>
                            <td class="px-6 py-4 text-gray-700">{group.meeting_time}</td>
                            <td class="px-6 py-4">
                                <div class="flex justify-end gap-2 text-xs">
                                    <a
                                            href={`/intern/admin/groups/${group.id}`}
                                            class="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 shadow-sm"
                                    >
                                        <span class="bi bi-box-arrow-in-right"></span> Öffnen
                                    </a>
                                </div>
                            </td>
                        </tr>
                    {/each}
                {/if}
                </tbody>
            </table>
        </div>
        <div class="xl:hidden divide-y divide-gray-200">
            {#if filteredGroups.length === 0}
                <div class="px-4 py-4 text-sm text-gray-500 text-center">Keine Gruppen gefunden.</div>
            {:else}
                {#each filteredGroups as group}
                    <div class="p-4 space-y-2">
                        <div class="flex items-start justify-between gap-3">
                            <div>
                                <p class="text-lg font-semibold text-gray-900">{group.name}</p>
                                <p class="text-sm text-gray-700 capitalize">{group.type}</p>
                                <p class="text-xs text-gray-500">{group.meeting_time}</p>
                            </div>
                        </div>
                        <div class="flex justify-end">
                            <a
                                    href={`/intern/admin/groups/${group.id}`}
                                    class="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 shadow-sm"
                            >
                                <span class="bi bi-box-arrow-in-right"></span> Oeffnen
                            </a>
                        </div>
                    </div>
                {/each}
            {/if}
        </div>
    </div>
</div>
