<script lang="ts">
    export let data;

    let search = "";

    $: filtered = data.groups.filter((g) =>
        g.name.toLowerCase().includes(search.toLowerCase())
    );
</script>

<div class="max-w-5xl mx-auto mt-12">
    <div class="flex items-center justify-between mb-8">
        <div>
            <h1 class="text-3xl font-bold text-gray-900">Gruppen</h1>
            <p class="text-gray-600">Übersicht aller Gruppen</p>
        </div>
        <input
                type="text"
                placeholder="Gruppen suchen..."
                bind:value={search}
                class="px-4 py-2 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
        />
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each filtered as g}
            <a
                    href={`/intern/groups/${g.id}`}
                    class="block p-5 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition"
            >
                <div class="text-sm uppercase text-gray-500 font-semibold tracking-wide">{g.type}</div>
                <div class="text-xl font-bold text-gray-900 mt-1">{g.name}</div>
                <div class="text-gray-600 text-sm mt-2">{g.description || "Keine Beschreibung"}</div>
                <div class="text-gray-500 text-xs mt-3">Treffen: {g.meeting_time || "k.A."}</div>
            </a>
        {/each}

        {#if filtered.length === 0}
            <div class="col-span-full text-gray-500 text-center py-10">
                Keine Gruppen gefunden.
            </div>
        {/if}
    </div>
</div>
