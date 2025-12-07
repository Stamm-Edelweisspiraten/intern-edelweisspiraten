<script lang="ts">
    export let data;
</script>

<div class="max-w-6xl mx-auto mt-12 space-y-8">
    <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
            <p class="text-sm text-gray-500">Gruppe</p>
            <h1 class="text-3xl font-bold text-gray-900 mt-1">{data.group.name}</h1>
            <p class="text-gray-600 mt-2">
                {data.group.description || "Keine Beschreibung"} · Treffen: {data.group.meeting_time || "k.A."}
            </p>
        </div>
        <a
                href={`/intern/email?group=${data.group.id}`}
                class="inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-sm"
        >
            E-Mail an Mitglieder
        </a>
    </div>

    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
        <h2 class="text-xl font-semibold text-gray-900 mb-4">Mitglieder</h2>
        <div class="divide-y divide-gray-200">
            {#each data.members as m}
                <div class="py-3 flex justify-between items-center">
                    <div>
                        <div class="font-medium text-gray-900">{m.firstname} {m.lastname}</div>
                        <div class="text-sm text-gray-600">{m.emails?.map((e) => e.email).join(", ") || "-"}</div>
                    </div>
                    <a href={`/intern/members/${m.id}`} class="text-blue-600 text-sm hover:underline">Details</a>
                </div>
            {/each}
            {#if data.members.length === 0}
                <div class="py-4 text-gray-500 text-sm">Keine Mitglieder in dieser Gruppe.</div>
            {/if}
        </div>
    </div>
</div>
