<script lang="ts">
    export let data;
</script>

<div class="max-w-6xl mx-auto mt-10 space-y-8">
    <div class="bg-white border border-gray-200 rounded-2xl shadow p-6">
        <h1 class="text-3xl font-bold text-gray-900">Willkommen, {data.userName}!</h1>
        <p class="text-gray-600 mt-2">Hier findest du einen schnellen Überblick und die nächsten Geburtstage.</p>
    </div>

    <div class="bg-white border border-gray-200 rounded-2xl shadow p-6">
        <div class="flex items-center justify-between mb-4">
            <div>
                <h2 class="text-2xl font-semibold text-gray-900">Nächste Geburtstage</h2>
                <p class="text-gray-600 text-sm">Die nächsten anstehenden Geburtstage aus der Mitgliederliste.</p>
            </div>
        </div>

        {#if data.birthdays?.length > 0}
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {#each data.birthdays as b}
                    <div class="border border-gray-200 rounded-xl p-4 bg-gray-50">
                        <div class="flex justify-between items-center mb-2">
                            <div class="text-sm text-gray-500">in {b.inDays} Tag{b.inDays === 1 ? "" : "en"}</div>
                            <div class="text-sm font-semibold text-gray-700">{b.dateLabel}</div>
                        </div>
                        <div class="text-lg font-semibold text-gray-900">{b.name}</div>
                        <div class="text-sm text-gray-600">wird {b.age}</div>
                    </div>
                {/each}
            </div>
        {:else}
            <p class="text-gray-600">Keine Geburtstage gefunden.</p>
        {/if}
    </div>
</div>
