<script lang="ts">
    export let data;

    let search = "";

    const getMemberName = (id: string | null) => {
        if (!id) return "";
        const m = data.members.find((m: any) => m.id === id);
        return m ? m.name : id;
    };

    $: filteredUsers = (data.users ?? []).filter((user: any) => {
        const q = search.toLowerCase();
        return (
            user.name.toLowerCase().includes(q) ||
            user.email.toLowerCase().includes(q) ||
            user.id.toLowerCase().includes(q) ||
            getMemberName(user.memberId).toLowerCase().includes(q)
        );
    });
</script>

<div class="max-w-6xl mx-auto mt-16 space-y-8">
    <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
            <p class="text-sm font-semibold text-gray-700 uppercase tracking-wide">Admin</p>
            <h1 class="text-4xl font-bold text-gray-900">Benutzerverwaltung</h1>
            <p class="text-sm text-gray-600 mt-1">Benutzer suchen, ansehen und verwalten.</p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
            <a
                    href="/intern/admin"
                    class="inline-flex items-center gap-2 px-4 py-3 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl font-semibold text-gray-800 shadow-sm transition"
            >
                <span class="bi bi-arrow-left"></span>
                Zurück
            </a>
            <a
                    href="/intern/admin/user/create"
                    class="inline-flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-sm transition"
            >
                <span class="bi bi-person-plus"></span>
                Neuer Benutzer
            </a>
        </div>
    </div>

    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-3">
            <div class="w-full md:w-80">
                <label class="text-sm font-semibold text-gray-700">Suchen</label>
                <div class="mt-1 relative">
                    <span class="bi bi-search absolute left-3 top-2.5 text-gray-400"></span>
                    <input
                            type="text"
                            placeholder="Name, E-Mail, ID oder Mitglied"
                            bind:value={search}
                            class="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-300 bg-white shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-400 text-sm text-gray-700"
                    />
                </div>
            </div>
            <span class="text-sm text-gray-500">{filteredUsers.length} Einträge</span>
        </div>

        <div class="overflow-x-auto hidden xl:block">
            <table class="w-full min-w-full divide-y divide-gray-200 text-sm">
                <thead class="bg-gray-50">
                <tr>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">E-Mail</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Mitglied</th>
                    <th class="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Aktionen</th>
                </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                {#if filteredUsers.length === 0}
                    <tr>
                        <td colspan="4" class="px-6 py-6 text-center text-gray-500">Keine Benutzer gefunden.</td>
                    </tr>
                {:else}
                    {#each filteredUsers as user}
                        <tr class="hover:bg-gray-50 transition">
                            <td class="px-6 py-4 font-semibold text-gray-900">{user.name}</td>
                            <td class="px-6 py-4 text-gray-700">{user.email}</td>
                            <td class="px-6 py-4 text-gray-700">{getMemberName(user.memberId) || "-"}</td>
                            <td class="px-6 py-4">
                                <div class="flex items-center justify-end gap-2 text-xs">
                                    <a
                                            href={`/intern/admin/user/${user.id}`}
                                            class="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 shadow-sm"
                                            aria-label="Benutzer ansehen"
                                    >
                                        <span class="bi bi-eye"></span> Ansehen
                                    </a>
                                    <a
                                            href={`/intern/admin/user/${user.id}?scope=edit`}
                                            class="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 shadow-sm"
                                            aria-label="Benutzer bearbeiten"
                                    >
                                        <span class="bi bi-pencil"></span> Bearbeiten
                                    </a>
                                    <form method="post" action="?/delete" class="inline" on:submit={(e) => {
                                        if (!confirm("Willst du diesen Benutzer wirklich löschen?")) e.preventDefault();
                                    }}>
                                        <input type="hidden" name="id" value={user.id} />
                                        <button
                                                type="submit"
                                                class="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 shadow-sm"
                                                aria-label="Benutzer löschen"
                                        >
                                            <span class="bi bi-trash"></span> Löschen
                                        </button>
                                    </form>
                                </div>
                            </td>
                        </tr>
                    {/each}
                {/if}
                </tbody>
            </table>
        </div>
        <div class="xl:hidden divide-y divide-gray-200">
            {#if filteredUsers.length === 0}
                <div class="px-4 py-4 text-sm text-gray-500 text-center">Keine Benutzer gefunden.</div>
            {:else}
                {#each filteredUsers as user}
                    <div class="p-4 space-y-3">
                        <div class="flex items-start justify-between gap-3">
                            <div>
                                <p class="text-lg font-semibold text-gray-900">{user.name}</p>
                                <p class="text-sm text-gray-700">{user.email}</p>
                                <p class="text-xs text-gray-500 mt-1">{getMemberName(user.memberId) || "-"}</p>
                            </div>
                        </div>
                        <div class="flex flex-wrap justify-end gap-2 text-xs">
                            <a
                                    href={`/intern/admin/user/${user.id}`}
                                    class="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 shadow-sm"
                                    aria-label="Benutzer ansehen"
                            >
                                <span class="bi bi-eye"></span> Ansehen
                            </a>
                            <a
                                    href={`/intern/admin/user/${user.id}?scope=edit`}
                                    class="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 shadow-sm"
                                    aria-label="Benutzer bearbeiten"
                            >
                                <span class="bi bi-pencil"></span> Bearbeiten
                            </a>
                            <form method="post" action="?/delete" class="inline" on:submit={(e) => {
                                if (!confirm("Willst du diesen Benutzer wirklich loeschen?")) e.preventDefault();
                            }}>
                                <input type="hidden" name="id" value={user.id} />
                                <button
                                        type="submit"
                                        class="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 shadow-sm"
                                        aria-label="Benutzer loeschen"
                                >
                                    <span class="bi bi-trash"></span> Loeschen
                                </button>
                            </form>
                        </div>
                    </div>
                {/each}
            {/if}
        </div>
    </div>
</div>
