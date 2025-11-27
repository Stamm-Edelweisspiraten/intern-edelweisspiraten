<script lang="ts">
    export let data;

    let selectedGroup: string | null = null;
    let search = "";

    $: filteredPermissions = data.allPermissions.filter(p =>
        p.toLowerCase().includes(search.toLowerCase())
    );
</script>

<div class="max-w-6xl mx-auto mt-12">
    <h1 class="text-4xl font-bold mb-8">Permissions verwalten</h1>

    <!-- Gruppe auswählen -->
    <div class="mb-6">
        <label class="font-medium text-gray-700 mb-2 block">Gruppe auswählen</label>

        <select bind:value={selectedGroup}>
            <option value={null}>Bitte wählen...</option>
            {#each data.groups as g}
                <option value={String(g.pk)}>{g.name}</option>
            {/each}
        </select>
    </div>

    {#if selectedGroup}
        <form method="post" action="?/save" class="space-y-6">
            <input type="hidden" name="groupPk" value={selectedGroup} />

            <!-- Suche -->
            <input
                    type="text"
                    placeholder="Permissions durchsuchen..."
                    bind:value={search}
                    class="px-4 py-3 border rounded-lg w-full"
            />

            <!-- Permissions Liste -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">

                {#each filteredPermissions as perm}
                    <label class="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50">
                        <input
                                type="checkbox"
                                name="permissions"
                                value={perm}
                                checked={data.groupPermissions[selectedGroup]?.includes(perm)}
                        />
                        <span>{perm}</span>
                    </label>
                {/each}

            </div>

            <button class="px-6 py-3 bg-blue-600 text-white rounded-lg">
                💾 Speichern
            </button>
        </form>
    {/if}
</div>
