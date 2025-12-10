<script lang="ts">
    export let data;

    const formatDate = (iso: string) => new Date(iso).toLocaleString("de-DE");
</script>

<div class="max-w-3xl mx-auto mt-12 space-y-6">
    <div class="flex items-start justify-between gap-3">
        <div>
            <h1 class="text-3xl font-bold text-gray-900">Änderungslog</h1>
            <p class="text-gray-600">
                Mitglied: {data.member.firstname} {data.member.lastname}
                {#if data.member.fahrtenname} ({data.member.fahrtenname}){/if}
            </p>
            {#if data.member.updatedAt}
                <p class="text-xs text-gray-500 mt-1">
                    Zuletzt geändert {formatDate(data.member.updatedAt)}
                    {#if data.member.updatedBy} von {data.member.updatedBy}{/if}
                </p>
            {/if}
        </div>
        <a href={`/intern/members/${data.member.id}`} class="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow">
            Zurück zum Mitglied
        </a>
    </div>

    {#if (data.logs ?? []).length === 0}
        <div class="p-4 rounded-xl border border-gray-200 bg-white text-gray-600 text-sm">
            Keine Änderungen protokolliert.
        </div>
    {:else}
        <div class="space-y-3">
            {#each data.logs as log}
                <div class="border border-gray-200 rounded-xl p-4 bg-white shadow-sm">
                    <div class="flex items-center justify-between flex-wrap gap-2">
                        <div class="text-sm text-gray-700">
                            {formatDate(log.createdAt)} · {log.user}
                        </div>
                        <span class="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-800 uppercase tracking-wide">
                            {log.action}
                        </span>
                    </div>
                    {#if log.changes && log.changes.length > 0}
                        <table class="mt-3 w-full text-sm">
                            <tbody class="divide-y divide-gray-100">
                            {#each log.changes as c}
                                <tr>
                                    <td class="py-1 pr-2 font-semibold text-gray-800 align-top w-1/4">{c.field}</td>
                                    <td class="py-1 pr-2 text-gray-600 font-mono text-xs break-all align-top">{JSON.stringify(c.before) ?? "—"}</td>
                                    <td class="py-1 text-gray-900 font-mono text-xs break-all align-top">→ {JSON.stringify(c.after) ?? "—"}</td>
                                </tr>
                            {/each}
                            </tbody>
                        </table>
                    {:else}
                        <p class="mt-2 text-sm text-gray-600">Keine Felddetails vorhanden.</p>
                    {/if}
                </div>
            {/each}
        </div>
    {/if}
</div>
