<script lang="ts">
    export let data;

    let search = "";
    $: filteredPermissions = (data.allPermissions ?? []).filter((p: string) =>
        p.toLowerCase().includes(search.toLowerCase())
    );
    let selectedGroup: string | null = null;
    $: selectedGroupName = data.groups.find((g: any) => String(g.pk) === selectedGroup)?.name ?? "";
</script>

<div class="max-w-6xl mx-auto mt-16 space-y-8">
    <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
            <p class="text-sm font-semibold text-gray-700 uppercase tracking-wide">Admin</p>
            <h1 class="text-4xl font-bold text-gray-900">Berechtigungen</h1>
            <p class="text-sm text-gray-600 mt-1">Rollen und Zugriffsrechte verwalten.</p>
        </div>
    </div>

    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 space-y-6">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 items-end">
            <div class="lg:col-span-2">
                <label class="text-sm font-semibold text-gray-700">Gruppe auswählen</label>
                <select
                        bind:value={selectedGroup}
                        class="mt-1 w-full px-4 py-3 rounded-xl text-sm border border-gray-300 bg-white shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-400"
                >
                    <option value={null}>Bitte wählen...</option>
                    {#each data.groups as g}
                        <option value={String(g.pk)}>{g.name}</option>
                    {/each}
                </select>
            </div>
            <div>
                <label class="text-sm font-semibold text-gray-700">Suche</label>
                <div class="mt-1 relative">
                    <span class="bi bi-search absolute left-3 top-2.5 text-gray-400"></span>
                    <input
                            type="text"
                            placeholder="Permissions durchsuchen..."
                            bind:value={search}
                            class="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-300 bg-white shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-400 text-sm text-gray-700"
                    />
                </div>
            </div>
        </div>

        {#if selectedGroup}
            <form method="post" action="?/save" class="space-y-4">
                <input type="hidden" name="groupPk" value={selectedGroup} />
                <input type="hidden" name="groupName" value={selectedGroupName} />

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {#each filteredPermissions as perm}
                        <label class="flex items-center gap-3 p-3 border border-gray-200 rounded-lg bg-white shadow-sm hover:border-blue-200 hover:bg-blue-50 transition">
                            <input
                                    type="checkbox"
                                    name="permissions"
                                    value={perm}
                                    checked={data.groupPermissions[selectedGroup]?.includes(perm)}
                            />
                            <span class="text-sm text-gray-800">{perm}</span>
                        </label>
                    {/each}
                </div>

                <div class="flex justify-end">
                    <button class="inline-flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-sm">
                        <span class="bi bi-save"></span>
                        Speichern
                    </button>
                </div>
            </form>
        {:else}
            <p class="text-sm text-gray-600">Wähle zuerst eine Gruppe, um Berechtigungen anzupassen.</p>
        {/if}
    </div>
</div>
