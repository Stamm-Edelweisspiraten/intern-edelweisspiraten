<script lang="ts">
    export let data;
    export const csr = false;
</script>

<div class="max-w-6xl mx-auto mt-12 space-y-8">
    <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div class="space-y-2">
            <p class="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">Gruppe</p>
            <div class="flex items-center gap-3 flex-wrap">
                <h1 class="text-3xl font-bold text-gray-900">{data.group.name}</h1>
                <span class="px-3 py-1 text-xs font-semibold rounded-full border border-blue-200 bg-blue-50 text-blue-700">
                    {data.group.type}
                </span>
                <span class="px-3 py-1 text-xs font-semibold rounded-full border border-amber-200 bg-amber-50 text-amber-800">
                    {data.group.meeting_time || "Kein Termin"}
                </span>
            </div>
            <p class="text-gray-600 max-w-3xl">
                {data.group.description || "Keine Beschreibung"}
            </p>
            <div class="flex flex-wrap gap-2">
                <a
                        href="/intern/groups"
                        class="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl font-semibold text-gray-800 shadow-sm transition"
                >
                    <span class="bi bi-arrow-left"></span>
                    Zurück
                </a>
                <a
                        href={`/intern/groups/${data.group.id}/members.pdf`}
                        class="inline-flex items-center gap-2 px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-800 border border-red-200 rounded-xl font-semibold shadow-sm transition"
                >
                    <span class="bi bi-filetype-pdf"></span>
                    PDF Export
                </a>
                <a
                        href={`/intern/email?group=${data.group.id}`}
                        class="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-sm transition"
                >
                    <span class="bi bi-envelope"></span>
                    E-Mail an Mitglieder
                </a>
            </div>
        </div>
        <div class="grid grid-cols-2 gap-3 w-full md:w-[320px]">
            <div class="p-4 rounded-xl border border-gray-200 bg-white shadow-sm">
                <p class="text-xs text-gray-500">Mitglieder</p>
                <p class="text-2xl font-bold text-gray-900">{data.members.length}</p>
            </div>
            <div class="p-4 rounded-xl border border-gray-200 bg-white shadow-sm">
                <p class="text-xs text-gray-500">Meeting</p>
                <p class="text-2xl font-bold text-gray-900">{data.group.meeting_time || "k.A."}</p>
            </div>
        </div>
    </div>

    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
        <div class="flex items-center justify-between flex-wrap gap-3 mb-4">
            <h2 class="text-xl font-semibold text-gray-900">Mitglieder</h2>
            <span class="px-3 py-1 text-xs rounded-full border border-gray-200 bg-gray-50 text-gray-700">
                {data.members.length} Personen
            </span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            {#each data.members as m}
                <div class="border border-gray-200 rounded-xl p-4 flex items-start justify-between gap-3">
                    <div class="space-y-1">
                        <div class="text-sm font-semibold text-gray-900 flex items-center gap-2">
                            <span class="bi bi-person-circle text-gray-500"></span>
                            {m.firstname} {m.lastname}
                        </div>
                        <div class="flex flex-wrap gap-2 text-xs text-gray-700">
                            {#if m.emails?.length}
                                {#each m.emails as e}
                                    <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-blue-100 bg-blue-50 text-blue-700">
                                        <span class="bi bi-envelope"></span>{e.email}
                                    </span>
                                {/each}
                            {:else}
                                <span class="text-gray-400">Keine E-Mail hinterlegt</span>
                            {/if}
                        </div>
                    </div>
                    <a href={`/intern/members/${m.id}`} class="text-blue-600 text-xs font-semibold hover:underline whitespace-nowrap mt-1">Details</a>
                </div>
            {/each}
            {#if data.members.length === 0}
                <div class="p-4 text-gray-500 text-sm border border-dashed border-gray-300 rounded-xl">Keine Mitglieder in dieser Gruppe.</div>
            {/if}
        </div>
    </div>
</div>
