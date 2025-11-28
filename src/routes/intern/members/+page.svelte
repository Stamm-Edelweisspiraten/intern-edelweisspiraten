<script lang="ts">
    export let data;

    let search = "";

    // Live-Filterfunktion
    $: filteredMembers = data.members.filter((member) => {
        const q = search.toLowerCase();

        // Hilfsfunktion für Arrays wie emails, numbers
        const includesInArray = (arr: any[], field: string) =>
            arr?.some((item) => item[field]?.toLowerCase().includes(q));

        return (
            member.firstname.toLowerCase().includes(q) ||
            member.lastname.toLowerCase().includes(q) ||
            member.id.toLowerCase().includes(q) ||
            (member.group ?? "").toLowerCase().includes(q) ||
            (member.status ?? "").toLowerCase().includes(q) ||
            includesInArray(member.emails, "email") ||
            includesInArray(member.numbers, "number")
        );
    });
</script>


<div class="max-w-6xl mx-auto mt-12">

    <!-- Titel + Aktionen -->
    <div class="flex justify-between items-center mb-8">
        <h1 class="text-4xl font-bold text-gray-900">Mitgliederverwaltung</h1>

        <a
                href="/intern/members/create"
                class="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow transition font-medium"
        >
            + Neues Mitglied
        </a>
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

    <div class="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">

        <table class="w-full text-left">
            <thead class="bg-gray-100 border-b border-gray-300">
            <tr>
                <th class="px-6 py-4 text-sm font-semibold text-gray-700">Name</th>
                <th class="px-6 py-4 text-sm font-semibold text-gray-700">Gruppe</th>
                <th class="px-6 py-4 text-sm font-semibold text-gray-700">Status</th>
                <th class="px-6 py-4 text-sm font-semibold text-gray-700">E-Mails</th>
                <th class="px-6 py-4 text-sm font-semibold text-gray-700">Telefon</th>
                <th class="px-6 py-4 text-sm font-semibold text-gray-700 text-right">Aktionen</th>
            </tr>
            </thead>

            <tbody class="divide-y divide-gray-200">

            {#each filteredMembers as m}
                <tr class="hover:bg-gray-50 transition">

                    <!-- Name -->
                    <td class="px-6 py-4 font-medium text-gray-900">
                        {m.firstname} {m.lastname}
                    </td>

                    <!-- Gruppe -->
                    <td class="px-6 py-4 text-gray-700">
                        {m.group ?? "—"}
                    </td>

                    <!-- Status -->
                    <td class="px-6 py-4">
                            <span class="px-2 py-1 rounded text-sm
                                {m.status === 'aktiv' ? 'bg-green-100 text-green-700' : ''}
                                {m.status === 'passiv' ? 'bg-yellow-100 text-yellow-700' : ''}
                                {m.status === 'gekündigt' ? 'bg-red-100 text-red-700' : ''}
                            ">
                                {m.status ?? "—"}
                            </span>
                    </td>

                    <!-- Emails -->
                    <td class="px-6 py-4 text-gray-700">
                        {#if m.emails?.length > 0}
                            {m.emails.map(e => e.email).join(", ")}
                        {:else}
                            —
                        {/if}
                    </td>

                    <!-- Telefonnummern -->
                    <td class="px-6 py-4 text-gray-700">
                        {#if m.numbers?.length > 0}
                            {m.numbers.map(n => n.number).join(", ")}
                        {:else}
                            —
                        {/if}
                    </td>

                    <!-- Aktionen -->
                    <td class="px-6 py-4 text-right whitespace-nowrap flex justify-end gap-2">

                        <!-- Ansehen -->
                        <a
                                href={`/intern/members/${m.id}`}
                                class="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition text-gray-700 shadow-sm"
                        >
                            👁️
                        </a>

                        <!-- Bearbeiten -->
                        <a
                                href={`/intern/members/${m.id}?scope=edit`}
                                class="px-3 py-2 rounded-lg bg-blue-100 hover:bg-blue-200 transition text-blue-700 shadow-sm"
                        >
                            ✏️
                        </a>

                        <!-- Löschen -->
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

                        <!-- Beitritts PDF -->
                        <a
                                href={`/intern/members/${m.id}/invite.pdf`}
                                class="px-3 py-2 rounded-lg bg-red-400 hover:bg-red-500 transition text-red-700 shadow-sm"
                        >
                            📄
                        </a>


                    </td>

                </tr>
            {/each}

            {#if filteredMembers.length === 0}
                <tr>
                    <td colspan="6" class="px-6 py-8 text-center text-gray-500">
                        Keine Mitglieder gefunden.
                    </td>
                </tr>
            {/if}

            </tbody>
        </table>

    </div>

</div>
