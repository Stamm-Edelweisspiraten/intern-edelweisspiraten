<script lang="ts">
    export let data;
    export const csr = false;

    import { addToast } from "$lib/toastStore";

    let search = "";
    let selected = new Set<string>();
    let allSelected = false;
    const groupMap = new Map(data.groups?.map((g) => [g.id, g.name]) ?? []);

    let filterOpen = false;
    let filterGroups: Set<string> = new Set();
    let filterStands: Set<string> = new Set();
    let filterStatuses: Set<string> = new Set();
    let filterMinAge: number | null = null;
    let filterMaxAge: number | null = null;
    let groupMenuOpen = false;
    let standMenuOpen = false;
    let statusMenuOpen = false;

    function toggleRow(id: string) {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id); else next.add(id);
        selected = next;
    }

    const includesInArray = (arr: any[], field: string, q: string) =>
        arr?.some((item) => item[field]?.toLowerCase().includes(q));

    function getAge(birthday?: string) {
        if (!birthday) return null;
        const birthDate = new Date(birthday);
        if (isNaN(birthDate.getTime())) return null;
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    }

    const baseMembers = [...data.members].sort((a, b) => a.lastname.localeCompare(b.lastname));

    $: filteredMembers = baseMembers.filter((member) => {
        filterGroups;
        filterStands;
        filterStatuses;
        filterMinAge;
        filterMaxAge;

        const q = search.toLowerCase();
        const matchesSearch = (
            member.firstname.toLowerCase().includes(q) ||
            member.lastname.toLowerCase().includes(q) ||
            (member.fahrtenname ?? "").toLowerCase().includes(q) ||
            member.id.toLowerCase().includes(q) ||
            (member.status ?? "").toLowerCase().includes(q) ||
            includesInArray(member.emails, "email", q) ||
            includesInArray(member.numbers, "number", q) ||
            (member.groups ?? []).some((gid: string) =>
                (groupMap.get(gid) ?? gid).toLowerCase().includes(q)
            )
        );

        if (!matchesSearch) return false;

        if (filterGroups.size > 0 && !(member.groups ?? []).some((g: string) => filterGroups.has(g))) return false;
        if (filterStands.size > 0 && (member.stand ? !filterStands.has(member.stand) : true)) return false;
        if (filterStatuses.size > 0 && !filterStatuses.has(member.status)) return false;

        const age = getAge(member.birthday);
        if (filterMinAge !== null && (age === null || age < filterMinAge)) return false;
        if (filterMaxAge !== null && (age === null || age > filterMaxAge)) return false;

        return true;
    });

    $: {
        const visibleIds = filteredMembers.map((m) => m.id);
        const hasAll = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
        allSelected = hasAll;
    }

    const statusTone = (status?: string) => {
        if (status === "active") return "bg-emerald-50 border-emerald-200 text-emerald-800";
        if (status === "trial") return "bg-amber-50 border-amber-200 text-amber-800";
        if (status === "inactive") return "bg-red-50 border-red-200 text-red-700";
        return "bg-gray-100 border-gray-200 text-gray-700";
    };

    $: activeFilters = (() => {
        const items: { label: string; onRemove: () => void }[] = [];
        filterGroups.forEach((gid) => {
            items.push({
                label: `Gruppe: ${groupMap.get(gid) ?? gid}`,
                onRemove: () => {
                    const next = new Set(filterGroups);
                    next.delete(gid);
                    filterGroups = next;
                }
            });
        });
        filterStands.forEach((st) => {
            items.push({
                label: `Stand: ${st}`,
                onRemove: () => {
                    const next = new Set(filterStands);
                    next.delete(st);
                    filterStands = next;
                }
            });
        });
        filterStatuses.forEach((st) => {
            items.push({
                label: `Status: ${st}`,
                onRemove: () => {
                    const next = new Set(filterStatuses);
                    next.delete(st);
                    filterStatuses = next;
                }
            });
        });
        if (filterMinAge !== null) {
            items.push({
                label: `Alter ab ${filterMinAge}`,
                onRemove: () => {
                    filterMinAge = null;
                }
            });
        }
        if (filterMaxAge !== null) {
            items.push({
                label: `Alter bis ${filterMaxAge}`,
                onRemove: () => {
                    filterMaxAge = null;
                }
            });
        }
        return items;
    })();
</script>

<div class="max-w-6xl mx-auto mt-16 space-y-8">
    <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
            <p class="text-sm font-semibold text-gray-700 uppercase tracking-wide">Mitglieder</p>
            <h1 class="text-4xl font-bold text-gray-900">Mitgliederverwaltung</h1>
            <p class="text-sm text-gray-600 mt-1">Mitglieder suchen, filtern, anlegen.</p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
            <a
                    href="/intern/dashboard"
                    class="inline-flex items-center gap-2 px-4 py-3 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl font-semibold text-gray-800 shadow-sm transition"
            >
                <span class="bi bi-arrow-left"></span>
                Zurück
            </a>
            <a
                    href="/intern/members/create"
                    class="inline-flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-sm transition"
            >
                <span class="bi bi-person-plus"></span>
                Neues Mitglied
            </a>
            <a
                    class={`inline-flex items-center gap-2 px-4 py-3 rounded-xl font-semibold shadow-sm transition ${selected.size > 0 ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100" : "bg-gray-100 text-gray-500 border border-gray-200 cursor-not-allowed"}`}
                    aria-disabled={selected.size === 0}
                    href={selected.size > 0 ? `/intern/email?members=${Array.from(selected).join(",")}` : undefined}
                    on:click={(e) => { if (selected.size === 0) { e.preventDefault(); addToast("Bitte zuerst Mitglieder auswählen.", "info"); } }}
            >
                <span class="bi bi-envelope"></span>
                E-Mail an Auswahl ({selected.size})
            </a>
        </div>
    </div>

    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 space-y-4">
        <div class="flex flex-col md:flex-row md:items-center gap-3">
            <div class="flex-1">
                <label class="text-sm font-semibold text-gray-700">Suchen</label>
                <div class="mt-1 relative">
                    <span class="bi bi-search absolute left-3 top-2.5 text-gray-400"></span>
                    <input
                            type="text"
                            placeholder="Name, Gruppe, Status, E-Mail, Telefon..."
                            bind:value={search}
                            class="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-300 bg-white shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-400 text-sm text-gray-700"
                    />
                </div>
            </div>
            <button
                    type="button"
                    class="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 bg-white shadow-sm hover:bg-blue-50 text-blue-700"
                    on:click={() => filterOpen = !filterOpen}
            >
                <span class="bi bi-funnel"></span>
                Filter {filterOpen ? "schließen" : "Öffnen"}
            </button>
        </div>

        {#if activeFilters.length}
            <div class="flex flex-wrap gap-2">
                {#each activeFilters as filter}
                    <span class="flex items-center gap-2 bg-blue-50 text-blue-800 border border-blue-200 px-3 py-1 rounded-full text-sm">
                        {filter.label}
                        <button type="button" class="text-blue-800 hover:text-blue-900" on:click={filter.onRemove} aria-label="Filter entfernen">
                            <span class="bi bi-x-lg"></span>
                        </button>
                    </span>
                {/each}
                <button
                        type="button"
                        class="text-sm text-gray-600 underline"
                        on:click={() => {
                            filterGroups = new Set();
                            filterStands = new Set();
                            filterStatuses = new Set();
                            filterMinAge = null;
                            filterMaxAge = null;
                        }}>
                    Alle Filter löschen
                </button>
            </div>
        {/if}

        {#if filterOpen}
            <div class="border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div class="relative">
                        <label class="text-sm text-gray-700">Gruppe</label>
                        <button type="button"
                                class="w-full border rounded-lg px-3 py-2 bg-white text-left shadow-sm"
                                on:click={() => {
                                    groupMenuOpen = !groupMenuOpen;
                                    standMenuOpen = false;
                                    statusMenuOpen = false;
                                }}>
                            Gruppe wählen ({filterGroups.size || "alle"})
                        </button>
                        {#if groupMenuOpen}
                            <div class="absolute z-30 mt-1 w-full border rounded-lg bg-white shadow max-h-48 overflow-auto">
                                {#each data.groups as g}
                                    <button type="button"
                                            class="w-full text-left text-sm px-3 py-2 hover:bg-blue-50 flex justify-between"
                                            on:click={() => {
                                                const next = new Set(filterGroups);
                                                next.has(g.id) ? next.delete(g.id) : next.add(g.id);
                                                filterGroups = next;
                                            }}>
                                        <span>{g.name} ({g.type})</span>
                                        {#if filterGroups.has(g.id)}<span aria-hidden="true">&#10003;</span>{/if}
                                    </button>
                                {/each}
                            </div>
                        {/if}
                    </div>

                    <div class="relative">
                        <label class="text-sm text-gray-700">Stand</label>
                        <button type="button"
                                class="w-full border rounded-lg px-3 py-2 bg-white text-left shadow-sm"
                                on:click={() => {
                                    standMenuOpen = !standMenuOpen;
                                    groupMenuOpen = false;
                                    statusMenuOpen = false;
                                }}>
                            Stand wählen ({filterStands.size || "alle"})
                        </button>
                        {#if standMenuOpen}
                            <div class="absolute z-30 mt-1 w-full border rounded-lg bg-white shadow max-h-48 overflow-auto">
                                {#each ["Wildling-Woelfling","Woelfling","Jungpfadfinder","Knappe","Wildling-Pfadfinder","Pfadfinder","Spaeher","Kreuzpfadfinder"] as st}
                                    <button type="button"
                                            class="w-full text-left text-sm px-3 py-2 hover:bg-blue-50 flex justify-between"
                                            on:click={() => {
                                                const next = new Set(filterStands);
                                                next.has(st) ? next.delete(st) : next.add(st);
                                                filterStands = next;
                                            }}>
                                        <span>{st}</span>
                                        {#if filterStands.has(st)}<span aria-hidden="true">&#10003;</span>{/if}
                                    </button>
                                {/each}
                            </div>
                        {/if}
                    </div>

                    <div class="relative">
                        <label class="text-sm text-gray-700">Status</label>
                        <button type="button"
                                class="w-full border rounded-lg px-3 py-2 bg-white text-left shadow-sm"
                                on:click={() => {
                                    statusMenuOpen = !statusMenuOpen;
                                    groupMenuOpen = false;
                                    standMenuOpen = false;
                                }}>
                            Status wählen ({filterStatuses.size || "alle"})
                        </button>
                        {#if statusMenuOpen}
                            <div class="absolute z-30 mt-1 w-full border rounded-lg bg-white shadow max-h-48 overflow-auto">
                                {#each ["active","trial","alumni","inactive"] as st}
                                    <button type="button"
                                            class="w-full text-left text-sm px-3 py-2 hover:bg-blue-50 flex justify-between"
                                            on:click={() => {
                                                const next = new Set(filterStatuses);
                                                next.has(st) ? next.delete(st) : next.add(st);
                                                filterStatuses = next;
                                            }}>
                                        <span>{st}</span>
                                        {#if filterStatuses.has(st)}<span aria-hidden="true">&#10003;</span>{/if}
                                    </button>
                                {/each}
                            </div>
                        {/if}
                    </div>

                    <div class="space-y-2">
                        <label class="text-sm text-gray-700">Alter</label>
                        <div class="grid grid-cols-2 gap-2">
                            <input type="number" min="0" placeholder="von" bind:value={filterMinAge} class="border rounded-lg px-3 py-2 text-sm" />
                            <input type="number" min="0" placeholder="bis" bind:value={filterMaxAge} class="border rounded-lg px-3 py-2 text-sm" />
                        </div>
                    </div>
                </div>
            </div>
        {/if}
    </div>

    <div class="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div class="px-6 py-4 flex items-center justify-between">
            <h2 class="text-lg font-semibold text-gray-900">Mitglieder</h2>
            <span class="text-sm text-gray-500">{filteredMembers.length} Einträge</span>
        </div>
        <div class="overflow-x-auto hidden lg:block">
            <table class="w-full min-w-full divide-y divide-gray-200 text-sm">
                <thead class="bg-gray-50">
                <tr>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        <label class="inline-flex items-center gap-2">
                            <input type="checkbox" checked={allSelected} on:change={(e) => {
                                const checked = (e.currentTarget as HTMLInputElement).checked;
                                const next = new Set(selected);
                                if (checked) {
                                    filteredMembers.forEach((m) => next.add(m.id));
                                } else {
                                    filteredMembers.forEach((m) => next.delete(m.id));
                                }
                                selected = next;
                            }} />
                            Alle
                        </label>
                    </th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Gruppe</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Alter</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Kontakt</th>
                    <th class="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Aktionen</th>
                </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                {#if filteredMembers.length === 0}
                    <tr>
                        <td colspan="7" class="px-6 py-6 text-center text-sm text-gray-500">Keine Mitglieder gefunden.</td>
                    </tr>
                {:else}
                    {#each filteredMembers as member}
                        {#if member}
                            <tr class="hover:bg-gray-50 transition">
                                <td class="px-6 py-4">
                                    <input type="checkbox" checked={selected.has(member.id)} on:change={() => toggleRow(member.id)} />
                                </td>
                                <td class="px-6 py-4 font-semibold text-gray-900">
                                    <div>{member.firstname} {member.lastname}</div>
                                    {#if member.fahrtenname}<div class="text-xs text-gray-500">{member.fahrtenname}</div>{/if}
                                </td>
                                <td class="px-6 py-4 text-gray-700">
                                    <div class="flex flex-wrap gap-2">
                                        {#each member.groups ?? [] as gid}
                                            <span class="px-2 py-1 text-[11px] rounded-full border border-sky-200 bg-sky-50 text-sky-800 font-semibold">{groupMap.get(gid) ?? gid}</span>
                                        {/each}
                                        {#if (member.groups ?? []).length === 0}
                                            <span class="text-xs text-gray-500">Keine Gruppe</span>
                                        {/if}
                                    </div>
                                </td>
                                <td class="px-6 py-4 text-gray-700">
                                    <span class={`px-2.5 py-1 text-xs font-semibold rounded-full border ${statusTone(member.status)}`}>
                                        {member.status ?? "-"}
                                    </span>
                                </td>
                                <td class="px-6 py-4 text-gray-700">
                                    {#if getAge(member.birthday) !== null}
                                        {getAge(member.birthday)} Jahre
                                    {:else}
                                        <span class="text-xs text-gray-500">-</span>
                                    {/if}
                                </td>
                                <td class="px-6 py-4 text-gray-700">
                                    <div class="space-y-1 text-xs">
                                        {#if member.emails?.length}
                                            <div class="text-gray-700">{member.emails[0].email}</div>
                                        {/if}
                                        {#if member.numbers?.length}
                                            <div class="text-gray-600">{member.numbers[0].number}</div>
                                        {/if}
                                    </div>
                                </td>
                                <td class="px-6 py-4">
                                    <div class="flex justify-end gap-2 text-xs">
                                        <a
                                                href={`/intern/members/${member.id}`}
                                                class="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 shadow-sm"
                                        >
                                            <span class="bi bi-eye"></span> Öffnen
                                        </a>
                                        <a
                                                href={`/intern/members/${member.id}/invite.pdf`}
                                                target="_blank"
                                                class="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-800 shadow-sm"
                                        >
                                            <span class="bi bi-filetype-pdf"></span> Einladung
                                        </a>
                                        <a
                                                href={`/intern/members/${member.id}?scope=edit`}
                                                class="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 shadow-sm"
                                        >
                                            <span class="bi bi-pencil"></span> Bearbeiten
                                        </a>
                                    </div>
                                </td>
                            </tr>
                        {/if}
                    {/each}
                {/if}
                </tbody>
            </table>
        </div>

        <div class="lg:hidden divide-y divide-gray-200">
            {#if filteredMembers.length === 0}
                <div class="px-4 py-4 text-sm text-gray-500 text-center">Keine Mitglieder gefunden.</div>
            {:else}
                {#each filteredMembers as member}
                    {#if member}
                        <div class="p-4 space-y-3">
                            <div class="flex items-start justify-between gap-3">
                                <div>
                                    <div class="text-lg font-semibold text-gray-900">{member.firstname} {member.lastname}</div>
                                    {#if member.fahrtenname}<div class="text-xs text-gray-500">{member.fahrtenname}</div>{/if}
                                    <div class="mt-2 flex flex-wrap gap-2">
                                        {#each member.groups ?? [] as gid}
                                            <span class="px-2 py-1 text-[11px] rounded-full border border-sky-200 bg-sky-50 text-sky-800 font-semibold">{groupMap.get(gid) ?? gid}</span>
                                        {/each}
                                        {#if (member.groups ?? []).length === 0}
                                            <span class="text-xs text-gray-500">Keine Gruppe</span>
                                        {/if}
                                    </div>
                                </div>
                                <div class="flex flex-col items-end gap-2">
                                    <input type="checkbox" checked={selected.has(member.id)} on:change={() => toggleRow(member.id)} />
                                    <span class={`px-2 py-1 text-[11px] font-semibold rounded-full border ${statusTone(member.status)}`}>
                                        {member.status ?? "-"}
                                    </span>
                                </div>
                            </div>
                            <div class="flex items-center gap-3 text-sm text-gray-700 flex-wrap">
                                {#if getAge(member.birthday) !== null}
                                    <span class="px-2 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs">{getAge(member.birthday)} Jahre</span>
                                {/if}
                                {#if member.emails?.length}
                                    <span class="text-xs">{member.emails[0].email}</span>
                                {/if}
                                {#if member.numbers?.length}
                                    <span class="text-xs text-gray-600">{member.numbers[0].number}</span>
                                {/if}
                            </div>
                            <div class="flex justify-end gap-2 text-xs">
                                <a
                                        href={`/intern/members/${member.id}`}
                                        class="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 shadow-sm"
                                >
                                    <span class="bi bi-eye"></span> Öffnen
                                </a>
                                <a
                                        href={`/intern/members/${member.id}/invite.pdf`}
                                        target="_blank"
                                        class="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-800 shadow-sm"
                                >
                                    <span class="bi bi-filetype-pdf"></span> Einladung
                                </a>
                                <a
                                        href={`/intern/members/${member.id}?scope=edit`}
                                        class="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 shadow-sm"
                                >
                                    <span class="bi bi-pencil"></span> Bearbeiten
                                </a>
                            </div>
                        </div>
                    {/if}
                {/each}
            {/if}
        </div>
    </div>
</div>
