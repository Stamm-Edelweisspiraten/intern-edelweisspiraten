<script lang="ts">
    export let data;

    const birthdays = (data.birthdays ?? []).slice(0, 3);
</script>

<div class="max-w-6xl mx-auto mt-10 space-y-6">
    <div class="bg-white border border-gray-200 rounded-2xl shadow p-6">
        <h1 class="text-3xl font-bold text-gray-900">Willkommen, {data.userName}!</h1>
        <p class="text-gray-600 mt-2">Hier findest du einen schnellen Überblick und die nächsten Geburtstage.</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2">
            <div class="bg-white border border-gray-200 rounded-2xl shadow p-6">
                <h2 class="text-2xl font-semibold text-gray-900 mb-2">Übersicht</h2>
                <p class="text-gray-600 text-sm">Füge hier weitere Widgets hinzu.</p>
            </div>
        </div>

        <div class="bg-white border border-gray-200 rounded-2xl shadow p-6 lg:col-span-1">
            <div class="flex items-center justify-between mb-4">
                <div>
                    <h2 class="text-xl font-semibold text-gray-900">Nächste Geburtstage</h2>
                    <p class="text-gray-600 text-sm">Top 3 demnächst.</p>
                </div>
            </div>

            {#if birthdays.length > 0}
                <div class="space-y-3">
                    {#each birthdays as b}
                        <div class="border border-gray-100 rounded-xl p-3 bg-gray-50">
                            <div class="flex justify-between items-center mb-1">
                                <div class="text-sm text-gray-500">in {b.inDays} Tag{b.inDays === 1 ? "" : "en"}</div>
                                <div class="text-sm font-semibold text-gray-700">{b.dateLabel}</div>
                            </div>
                            <div class="text-lg font-semibold text-gray-900">{b.firstname ?? "-"}</div>
                            <div class="text-sm text-gray-600">{b.group ?? "-"}</div>
                            <div class="text-sm text-gray-500">wird {b.age}</div>
                        </div>
                    {/each}
                </div>
            {:else}
                <p class="text-gray-600">Keine Geburtstage gefunden.</p>
            {/if}
        </div>
    </div>
</div>
