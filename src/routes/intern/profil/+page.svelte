<script lang="ts">
    export let data;

    const userinfo = data.userinfo ?? { email: "", name: "", groups: [] };
    const members = data.members ?? [];
    const dbUser = data.dbUser;

    const groups = userinfo.groups ?? [];

    const age = (birthday?: string) => {
        if (!birthday) return null;
        const d = new Date(birthday);
        if (isNaN(d.getTime())) return null;
        const today = new Date();
        let years = today.getFullYear() - d.getFullYear();
        const m = today.getMonth() - d.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < d.getDate())) years--;
        return years;
    };
</script>

<svelte:head>
    <title>Profil - Stamm Edelweisspiraten</title>
</svelte:head>

<div class="max-w-5xl mx-auto mt-16 space-y-8">
    <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
            <p class="text-sm font-semibold text-gray-700 uppercase tracking-wide">Profil</p>
            <h1 class="text-3xl font-bold text-gray-900">Dein Zugang</h1>
            <p class="text-sm text-gray-600 mt-1">Basisdaten, verknuepfte Mitglieder und Rollen.</p>
        </div>
        <div class="flex flex-wrap gap-2">
            <span class="px-3 py-1 rounded-full border border-blue-200 bg-blue-50 text-blue-700 text-sm font-semibold">
                {userinfo.email || "keine E-Mail"}
            </span>
        </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="p-5 bg-white border border-gray-200 rounded-2xl shadow-sm space-y-2">
            <p class="text-sm font-semibold text-gray-700 uppercase tracking-wide">Name</p>
            <p class="text-xl font-bold text-gray-900">{userinfo.name || "-"}</p>
            <p class="text-sm text-gray-500">Account-Typ: {dbUser?.type ?? "unbekannt"}</p>
        </div>
        <div class="p-5 bg-white border border-gray-200 rounded-2xl shadow-sm space-y-2">
            <p class="text-sm font-semibold text-gray-700 uppercase tracking-wide">Verknuepfte Mitglieder</p>
            <p class="text-3xl font-bold text-gray-900">{members.length}</p>
            <p class="text-sm text-gray-500">Namen werden unten aufgelistet.</p>
        </div>
    </div>

    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-3">
            <h2 class="text-lg font-semibold text-gray-900">Verknuepfte Mitglieder</h2>
            <span class="text-sm text-gray-500">{members.length} Eintraege</span>
        </div>
        {#if members.length === 0}
            <p class="text-sm text-gray-500">Keine Mitglieder verknuepft.</p>
        {:else}
            <div class="divide-y divide-gray-100">
                {#each members as member}
                    <div class="py-4 flex flex-wrap items-start justify-between gap-3">
                        <div class="space-y-1">
                            <p class="text-base font-semibold text-gray-900">{member.firstname} {member.lastname}</p>
                            <div class="flex flex-wrap gap-2 text-xs text-gray-700">
                                {#if member.stand}
                                    <span class="px-3 py-1 rounded-full border border-gray-200 bg-gray-50">Stand {member.stand}</span>
                                {/if}
                                {#if member.status}
                                    <span class="px-3 py-1 rounded-full border border-sky-200 bg-sky-50 text-sky-800 capitalize">{member.status}</span>
                                {/if}
                                {#if age(member.birthday) !== null}
                                    <span class="px-3 py-1 rounded-full border border-gray-200 bg-gray-50">{age(member.birthday)} Jahre</span>
                                {/if}
                            </div>
                        </div>
                        {#if member.groups?.length}
                            <div class="flex flex-wrap gap-2 text-xs">
                                {#each member.groups as g}
                                    <span class="px-3 py-1 rounded-full border border-gray-200 bg-white text-gray-700">{g}</span>
                                {/each}
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
        {/if}
    </div>

    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-3">
            <h2 class="text-lg font-semibold text-gray-900">Rollen & Zugang</h2>
            <span class="text-sm text-gray-500">{groups.length} Rollen</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-2">
                <p class="text-sm font-semibold text-gray-700">E-Mail</p>
                <p class="text-gray-900 font-medium">{userinfo.email || "-"}</p>
                {#if dbUser?.createdAt}
                    <p class="text-xs text-gray-500">Angelegt: {dbUser.createdAt?.slice?.(0, 10) ?? dbUser.createdAt}</p>
                {/if}
            </div>
            <div class="space-y-2">
                <p class="text-sm font-semibold text-gray-700">Rollen</p>
                {#if groups.length}
                    <div class="flex flex-wrap gap-2">
                        {#each groups as role}
                            <span class="px-3 py-1 rounded-full border border-blue-200 bg-blue-50 text-blue-700 text-sm font-semibold capitalize">{role}</span>
                        {/each}
                    </div>
                {:else}
                    <p class="text-sm text-gray-500">Keine Rollen zugewiesen.</p>
                {/if}
            </div>
        </div>
    </div>

    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-3">
            <h2 class="text-lg font-semibold text-gray-900">Technische Daten (JWT)</h2>
            <span class="text-sm text-gray-500">Readonly</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            {#each Object.entries(userinfo) as [key, value]}
                {#if !["email", "name", "groups", "sub", "iss"].includes(key)}
                    <div class="bg-gray-50 px-4 py-3 rounded-lg border border-gray-200">
                        <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">{key}</p>
                        <p class="text-gray-800 font-mono break-all text-sm">{value}</p>
                    </div>
                {/if}
            {/each}
        </div>
    </div>
</div>
