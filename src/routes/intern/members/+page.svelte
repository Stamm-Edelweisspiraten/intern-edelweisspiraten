<script lang="ts">
    export let data;

    let search = "";
    let selected = new Set<string>();
    const groupMap = new Map(
        data.groups?.map((g) => [g.id, g.name]) ?? []
    );

    // Live-Filterfunktion
    $: filteredMembers = data.members.filter((member) => {
        const q = search.toLowerCase();

        const includesInArray = (arr: any[], field: string) =>
            arr?.some((item) => item[field]?.toLowerCase().includes(q));

        return (
            member.firstname.toLowerCase().includes(q) ||
            member.lastname.toLowerCase().includes(q) ||
            member.id.toLowerCase().includes(q) ||
            (member.status ?? "").toLowerCase().includes(q) ||
            includesInArray(member.emails, "email") ||
            includesInArray(member.numbers, "number") ||
            (member.groups ?? []).some((gid: string) =>
                (groupMap.get(gid) ?? gid).toLowerCase().includes(q)
            )
        );
    });
</script>


<div class="max-w-6xl mx-auto mt-12">

    <!-- Titel + Aktionen -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <h1 class="text-4xl font-bold text-gray-900">Mitgliederverwaltung</h1>

        <div class="flex gap-3 flex-wrap">
            <a
                    href="/intern/members/create"
                    class="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow transition font-medium"
            >
                + Neues Mitglied
            </a>
            <a
                    class={`px-5 py-3 rounded-lg shadow transition font-medium ${selected.size > 0 ? "bg-green-600 hover:bg-green-700 text-white" : "bg-gray-200 text-gray-500 cursor-not-allowed"}`}
                    aria-disabled={selected.size === 0}
                    href={selected.size > 0 ? `/intern/email?members=${Array.from(selected).join(",")}` : undefined}
                    on:click={(e) => { if (selected.size === 0) e.preventDefault(); }}
            >
                E-Mail an Auswahl ({selected.size})
            </a>
        </div>
    </div>

    <!-- SUCHFELD -->
    <div class="mb-6">
        <input
                type="text"
                placeholder="Suche nach Name, Gruppe, Status, E-Mail, Telefon..."
                bind:value={search}
                class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white
               focus:ring-2 focus:ring-blue-500 outline-none transition text-gray-700"
        />
    </div>

    <div class="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden hidden md:block">

        <table class="w-full text-left">
            <thead class="bg-gray-100 border-b border-gray-300">
            <tr>
                <th class="px-4 py-4 text-sm font-semibold text-gray-700 w-12">
                    <input type="checkbox"
                           aria-label="Alle auswählen"
                           on:change={(e) => {
                               const checked = (e.target as HTMLInputElement).checked;
                               if (checked) {
                                   selected = new Set(filteredMembers.map((m: any) => m.id));
                               } else {
                                   selected = new Set();
                               }
                           }}
                           checked={selected.size === filteredMembers.length && filteredMembers.length > 0}
                    />
                </th>
                <th class="px-6 py-4 text-sm font-semibold text-gray-700">Name</th>
                <th class="px-6 py-4 text-sm font-semibold text-gray-700">Gruppen</th>
                <th class="px-6 py-4 text-sm font-semibold text-gray-700">Status</th>
                <th class="px-6 py-4 text-sm font-semibold text-gray-700">E-Mails</th>
                <th class="px-6 py-4 text-sm font-semibold text-gray-700">Telefon</th>
                <th class="px-6 py-4 text-sm font-semibold text-gray-700 text-right">Aktionen</th>
            </tr>
            </thead>

            <tbody class="divide-y divide-gray-200">

            {#each filteredMembers as m}
                <tr class="hover:bg-gray-50 transition">

                    <td class="px-4 py-4">
                        <input type="checkbox"
                               aria-label="Mitglied auswählen"
                               value={m.id}
                               checked={selected.has(m.id)}
                               on:change={(e) => {
                                   const checked = (e.target as HTMLInputElement).checked;
                                   const newSet = new Set(selected);
                                   if (checked) newSet.add(m.id); else newSet.delete(m.id);
                                   selected = newSet;
                               }}
                        />
                    </td>

                    <!-- Name -->
                    <td class="px-6 py-4 font-medium text-gray-900">
                        {m.firstname} {m.lastname}
                    </td>

                    <!-- Interne Gruppen -->
                    <td class="px-6 py-4 text-gray-700">
                        {#if m.groups?.length > 0}
                            {m.groups.map((gid: string) => groupMap.get(gid) ?? gid).join(", ")}
                        {:else}
                            –
                        {/if}
                    </td>

                    <!-- Status -->
                    <td class="px-6 py-4">
                            <span class="px-2 py-1 rounded text-sm
                                {m.status === 'aktiv' ? 'bg-green-100 text-green-700' : ''}
                                {m.status === 'passiv' ? 'bg-yellow-100 text-yellow-700' : ''}
                                {m.status === 'gekündigt' ? 'bg-red-100 text-red-700' : ''}"
                            >
                                {m.status ?? "–"}
                            </span>
                    </td>

                    <!-- Emails -->
                    <td class="px-6 py-4 text-gray-700">
                        {#if m.emails?.length > 0}
                            {m.emails.map(e => e.email).join(", ")}
                        {:else}
                            –
                        {/if}
                    </td>

                    <!-- Telefonnummern -->
                    <td class="px-6 py-4 text-gray-700">
                        {#if m.numbers?.length > 0}
                            {m.numbers.map(n => n.number).join(", ")}
                        {:else}
                            –
                        {/if}
                    </td>

                    <!-- Aktionen -->
                    <td class="px-6 py-4 text-right whitespace-nowrap flex justify-end gap-2">

                        <a
                                href={`/intern/members/${m.id}`}
                                class="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition text-gray-700 shadow-sm"
                        >
                            🔍
                        </a>

                        <a
                                href={`/intern/members/${m.id}?scope=edit`}
                                class="px-3 py-2 rounded-lg bg-blue-100 hover:bg-blue-200 transition text-blue-700 shadow-sm"
                        >
                            ✏️
                        </a>

                        <form method="post" action="?/delete" class="inline">
                            <input type="hidden" name="id" value={m.id} />

                            <button
                                    type="submit"
                                    class="px-3 py-2 rounded-lg bg-red-100 hover:bg-red-200 transition text-red-700 shadow-sm"
                                    on:click={() => confirm("Willst du dieses Mitglied wirklich löschen?")}
                            >
                                🗑️
                            </button>
                        </form>

                        <a
                                href={`/intern/members/${m.id}/invite.pdf`}
                                class="px-3 py-2 rounded-lg bg-red-400 hover:bg-red-500 transition text-white shadow-sm"
                        >
                            ⬇️ PDF
                        </a>


                    </td>

                </tr>
            {/each}

            {#if filteredMembers.length === 0}
                <tr>
                    <td colspan="7" class="px-6 py-8 text-center text-gray-500">
                        Keine Mitglieder gefunden.
                    </td>
                </tr>
            {/if}

            </tbody>
        </table>

    </div>

    <!-- Mobile cards -->
    <div class="space-y-4 md:hidden">
        {#each filteredMembers as m}
            <div class="card p-4 border border-gray-200 rounded-xl">
                <div class="flex justify-between items-center">
                    <div>
                        <div class="font-semibold text-lg text-gray-900">{m.firstname} {m.lastname}</div>
                        <div class="text-sm text-gray-500">{m.status ?? "-"}</div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button
                                class="px-2 py-1 border rounded-lg text-sm"
                                on:click={() => {
                                    const newSet = new Set(selected);
                                    newSet.has(m.id) ? newSet.delete(m.id) : newSet.add(m.id);
                                    selected = newSet;
                                }}
                        >
                            {selected.has(m.id) ? "Ausgewählt" : "Wählen"}
                        </button>
                    </div>
                </div>
                <div class="text-sm text-gray-700 mt-2">
                    <strong>Gruppen:</strong> {m.groups?.length > 0 ? m.groups.map((gid: string) => groupMap.get(gid) ?? gid).join(", ") : "-"}
                </div>
                <div class="text-sm text-gray-700">
                    <strong>E-Mail:</strong> {m.emails?.length > 0 ? m.emails.map((e) => e.email).join(", ") : "-"}
                </div>
                <div class="text-sm text-gray-700">
                    <strong>Telefon:</strong> {m.numbers?.length > 0 ? m.numbers.map((n) => n.number).join(", ") : "-"}
                </div>
                <div class="flex gap-2 mt-3 flex-wrap">
                    <a href={`/intern/members/${m.id}`} class="px-3 py-2 bg-gray-100 rounded-lg text-sm">Details</a>
                    <a href={`/intern/members/${m.id}?scope=edit`} class="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm">Bearbeiten</a>
                    <a href={`/intern/members/${m.id}/invite.pdf`} class="px-3 py-2 bg-red-400 text-white rounded-lg text-sm">Einladung</a>
                </div>
            </div>
        {/each}
        {#if filteredMembers.length === 0}
            <div class="text-center text-gray-500 text-sm py-4">Keine Mitglieder gefunden.</div>
        {/if}
    </div>

</div>
