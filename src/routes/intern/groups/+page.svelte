<script lang="ts">
    export let data;
    export const csr = false;

    let search = "";

    $: filtered = data.groups.filter((g) =>
        g.name.toLowerCase().includes(search.toLowerCase())
    );
</script>

<div class="max-w-6xl mx-auto mt-12 space-y-8">
    <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div class="space-y-2">
            <p class="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">Gruppen</p>
            <div class="flex items-center gap-3 flex-wrap">
                <h1 class="text-3xl font-bold text-gray-900">Gruppenverwaltung</h1>
                <span class="px-3 py-1 text-xs font-semibold rounded-full border border-blue-200 bg-blue-50 text-blue-700">
                    {data.groups.length} Gruppen
                </span>
            </div>
            <p class="text-gray-600 max-w-3xl">Übersicht aller Gruppen, Termine und Beschreibungen.</p>
            <div class="flex flex-wrap gap-2">
                <a
                        href="/intern/dashboard"
                        class="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl font-semibold text-gray-800 shadow-sm transition"
                >
                    <span class="bi bi-arrow-left"></span>
                    Zurück
                </a>
                <a
                        href="/intern/admin"
                        class="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-sm transition"
                >
                    <span class="bi bi-speedometer2"></span>
                    Admin
                </a>
            </div>
        </div>
        <div class="w-full md:w-80">
            <label class="text-sm font-semibold text-gray-700">Gruppen suchen</label>
            <div class="mt-1 relative">
                <span class="bi bi-search absolute left-3 top-2.5 text-gray-400"></span>
                <input
                        type="text"
                        placeholder="Name, Typ, Beschreibung..."
                        bind:value={search}
                        class="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-300 bg-white shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-400 text-sm text-gray-700"
                />
            </div>
        </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each filtered as g}
            <a
                    href={`/intern/groups/${g.id}`}
                    class="block p-5 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition"
            >
                <div class="flex items-center justify-between gap-3">
                    <div class="text-sm uppercase text-gray-500 font-semibold tracking-wide">{g.type}</div>
                    <span class="px-2.5 py-1 text-[11px] rounded-full border border-amber-200 bg-amber-50 text-amber-800">
                        {g.meeting_time || "Kein Termin"}
                    </span>
                </div>
                <div class="text-xl font-bold text-gray-900 mt-1">{g.name}</div>
                <div class="text-gray-600 text-sm mt-2 line-clamp-3">{g.description || "Keine Beschreibung"}</div>
            </a>
        {/each}

        {#if filtered.length === 0}
            <div class="col-span-full text-gray-500 text-center py-10 border border-dashed border-gray-300 rounded-xl">
                Keine Gruppen gefunden.
            </div>
        {/if}
    </div>
</div>
