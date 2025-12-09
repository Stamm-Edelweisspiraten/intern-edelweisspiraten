<script lang="ts">
    export let data;

    let search = "";
    let selected = new Set<string>();
    const groupMap = new Map(data.groups?.map((g) => [g.id, g.name]) ?? []);

    let filterOpen = false;
    let filterGroups: Set<string> = new Set();
    let filterStands: Set<string> = new Set();
    let filterStatus: Set<string> = new Set();
    let filterMinAge: number | null = null;
    let filterMaxAge: number | null = null;
    let filterVersion = 0; // bump on apply to trigger reactivity

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

    const matchesFilters = (member: any) => {
        if (filterGroups.size > 0 && !(member.groups ?? []).some((g: string) => filterGroups.has(g))) return false;
        if (filterStands.size > 0 && (member.stand ? !filterStands.has(member.stand) : true)) return false;
        if (filterStatus.size > 0 && !filterStatus.has(member.status)) return false;

        const age = getAge(member.birthday);
        if (filterMinAge !== null && (age === null || age < filterMinAge)) return false;
        if (filterMaxAge !== null && (age === null || age > filterMaxAge)) return false;

        return true;
    };

    $: filteredMembers = data.members.filter((member) => {
        const q = search.toLowerCase();
        const matchesSearch = (
            member.firstname.toLowerCase().includes(q) ||
            member.lastname.toLowerCase().includes(q) ||
            member.id.toLowerCase().includes(q) ||
            (member.status ?? "").toLowerCase().includes(q) ||
            includesInArray(member.emails, "email", q) ||
            includesInArray(member.numbers, "number", q) ||
            (member.groups ?? []).some((gid: string) =>
                (groupMap.get(gid) ?? gid).toLowerCase().includes(q)
            )
        );
        // depend on filterVersion to re-run when Apply pressed
        filterVersion;
        return matchesSearch && matchesFilters(member);
    });

    $: activeFilters = (() => {
        const items: { label: string; onRemove: () => void }[] = [];
        for (const gid of filterGroups) {
            const name = groupMap.get(gid) ?? gid;
            items.push({
                label: `Gruppe: ${name}`,
                onRemove: () => {
                    const next = new Set(filterGroups);
                    next.delete(gid);
                    filterGroups = next;
                    filterVersion += 1;
                }
            });
        }
        for (const st of filterStands) {
            items.push({
                label: `Stand: ${st}`,
                onRemove: () => {
                    const next = new Set(filterStands);
                    next.delete(st);
                    filterStands = next;
                    filterVersion += 1;
                }
            });
        }
        for (const st of filterStatus) {
            items.push({
                label: `Status: ${st}`,
                onRemove: () => {
                    const next = new Set(filterStatus);
                    next.delete(st);
                    filterStatus = next;
                    filterVersion += 1;
                }
            });
        }
        if (filterMinAge !== null) {
            items.push({
                label: `Alter ab ${filterMinAge}`,
                onRemove: () => {
                    filterMinAge = null;
                    filterVersion += 1;
                }
            });
        }
        if (filterMaxAge !== null) {
            items.push({
                label: `Alter bis ${filterMaxAge}`,
                onRemove: () => {
                    filterMaxAge = null;
                    filterVersion += 1;
                }
            });
        }
        return items;
    })();
</script>

<div class="max-w-6xl mx-auto mt-12">
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

    <div class="mb-6 flex flex-col md:flex-row md:items-center gap-3">
        <input
                type="text"
                placeholder="Suche nach Name, Gruppe, Status, E-Mail, Telefon..."
                bind:value={search}
                class="flex-1 px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white
               focus:ring-2 focus:ring-blue-500 outline-none transition text-gray-700"
        />
        <button
                type="button"
                class="px-4 py-3 border rounded-lg bg-white shadow-sm hover:bg-gray-50 text-gray-700"
                on:click={() => filterOpen = !filterOpen}
        >
            Filter {filterOpen ? "schließen" : "öffnen"}
        </button>
    </div>

    {#if activeFilters.length > 0}
        <div class="mb-4 flex flex-wrap gap-2">
            {#each activeFilters as f}
                <span class="flex items-center gap-2 bg-blue-50 text-blue-800 border border-blue-200 px-3 py-1 rounded-full text-sm">
                    {f.label}
                    <button type="button" class="text-blue-800 hover:text-blue-900" on:click={f.onRemove}>×</button>
                </span>
            {/each}
            <button
                    type="button"
                    class="text-sm text-gray-600 underline"
                    on:click={() => {
                        filterGroups = new Set();
                        filterStands = new Set();
                        filterStatus = new Set();
                        filterMinAge = null;
                        filterMaxAge = null;
                        filterVersion += 1;
                    }}>
                Alle Filter löschen
            </button>
        </div>
    {/if}

    {#if filterOpen}
        <div class="mb-6 border border-gray-200 rounded-xl p-4 bg-white shadow-sm space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <div class="relative">
                    <label class="text-sm text-gray-600">Gruppe</label>
                    <details class="border rounded-lg bg-gray-50">
                        <summary class="px-3 py-2 cursor-pointer select-none">Gruppe wählen ({filterGroups.size || "alle"})</summary>
                        <div class="max-h-40 overflow-auto space-y-1 px-3 py-2">
                            {#each data.groups as g}
                                <label class="flex items-center gap-2 text-sm text-gray-700">
                                    <input type="checkbox"
                                           checked={filterGroups.has(g.id)}
                                           on:change={(e) => {
                                               const next = new Set(filterGroups);
                                               (e.target as HTMLInputElement).checked ? next.add(g.id) : next.delete(g.id);
                                               filterGroups = next;
                                           }}
                                    />
                                    <span>{g.name} ({g.type})</span>
                                </label>
                            {/each}
                        </div>
                    </details>
                </div>

                <div class="relative">
                    <label class="text-sm text-gray-600">Stand</label>
                    <details class="border rounded-lg bg-gray-50">
                        <summary class="px-3 py-2 cursor-pointer select-none">Stand wählen ({filterStands.size || "alle"})</summary>
                        <div class="max-h-40 overflow-auto space-y-1 px-3 py-2">
                            {#each ["Wildling-Wölfling","Wölfling","Jungpfadfinder","Knappe","Wildling-Pfadinder","Pfadfinder","Späher","Kreuzpfadfinder"] as st}
                                <label class="flex items-center gap-2 text-sm text-gray-700">
                                    <input type="checkbox"
                                           checked={filterStands.has(st)}
                                           on:change={(e) => {
                                               const next = new Set(filterStands);
                                               (e.target as HTMLInputElement).checked ? next.add(st) : next.delete(st);
                                               filterStands = next;
                                           }}
                                    />
                                    <span>{st}</span>
                                </label>
                            {/each}
                        </div>
                    </details>
                </div>

                <div>
                    <label class="text-sm text-gray-600">Status</label>
                    <div class="flex flex-wrap gap-2 mt-1">
                        {#each ["aktiv", "passiv", "gekündigt"] as st}
                            <label class="flex items-center gap-1 text-sm text-gray-700 border rounded px-2 py-1 bg-gray-50">
                                <input type="checkbox"
                                       checked={filterStatus.has(st)}
                                       on:change={(e) => {
                                           const next = new Set(filterStatus);
                                           (e.target as HTMLInputElement).checked ? next.add(st) : next.delete(st);
                                           filterStatus = next;
                                       }}
                                />
                                {st}
                            </label>
                        {/each}
                    </div>
                </div>

                <div>
                    <label class="text-sm text-gray-600">Alter (min/max)</label>
                    <div class="flex gap-2">
                        <input type="number" min="0" placeholder="min"
                               class="w-full border rounded-lg px-3 py-2 bg-gray-50"
                               bind:value={filterMinAge}
                               on:input={(e) => filterMinAge = (e.target as HTMLInputElement).value ? Number((e.target as HTMLInputElement).value) : null}
                        />
                        <input type="number" min="0" placeholder="max"
                               class="w-full border rounded-lg px-3 py-2 bg-gray-50"
                               bind:value={filterMaxAge}
                               on:input={(e) => filterMaxAge = (e.target as HTMLInputElement).value ? Number((e.target as HTMLInputElement).value) : null}
                        />
                    </div>
                </div>
            </div>

            <div class="flex gap-3">
                <button type="button"
                        class="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg"
                        on:click={() => {
                            filterVersion += 1;
                            filterOpen = false;
                        }}>
                    Anwenden
                </button>
                <button type="button"
                        class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg"
                        on:click={() => {
                            filterGroups = new Set();
                            filterStands = new Set();
                            filterStatus = new Set();
                            filterMinAge = null;
                            filterMaxAge = null;
                            filterVersion += 1;
                        }}>
                    Filter zurücksetzen
                </button>
            </div>
        </div>
    {/if}

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
                <tr
                        class={`hover:bg-gray-50 transition cursor-pointer ${selected.has(m.id) ? "bg-blue-50" : ""}`}
                        on:click={() => toggleRow(m.id)}
                >
                    <td class="px-4 py-4">
                        <input type="checkbox"
                               aria-label="Mitglied auswählen"
                               value={m.id}
                               checked={selected.has(m.id)}
                               on:click|stopPropagation
                               on:change={(e) => {
                                   const checked = (e.target as HTMLInputElement).checked;
                                   const newSet = new Set(selected);
                                   if (checked) newSet.add(m.id); else newSet.delete(m.id);
                                   selected = newSet;
                               }}
                        />
                    </td>

                    <td class="px-6 py-4 font-medium text-gray-900">
                        {m.firstname} {m.lastname}
                    </td>

                    <td class="px-6 py-4 text-gray-700">
                        {#if m.groups?.length > 0}
                            {m.groups.map((gid: string) => groupMap.get(gid) ?? gid).join(", ")}
                        {:else}
                            -
                        {/if}
                    </td>

                    <td class="px-6 py-4">
                        <span class="px-2 py-1 rounded text-sm
                                {m.status === 'aktiv' ? 'bg-green-100 text-green-700' : ''}
                                {m.status === 'passiv' ? 'bg-yellow-100 text-yellow-700' : ''}
                                {m.status === 'gekündigt' ? 'bg-red-100 text-red-700' : ''}"
                        >
                            {m.status ?? "-"}
                        </span>
                    </td>

                    <td class="px-6 py-4 text-gray-700">
                        {#if m.emails?.length > 0}
                            {m.emails.map((e) => e.email).join(", ")}
                        {:else}
                            -
                        {/if}
                    </td>

                    <td class="px-6 py-4 text-gray-700">
                        {#if m.numbers?.length > 0}
                            {m.numbers.map((n) => n.number).join(", ")}
                        {:else}
                            -
                        {/if}
                    </td>

                    <td class="px-6 py-4 text-right whitespace-nowrap">
                        <div class="flex justify-center md:justify-end items-center gap-2" on:click|stopPropagation>
                        <a
                                href={`/intern/members/${m.id}`}
                                class="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition text-gray-700 shadow-sm flex items-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-eye-fill" viewBox="0 0 16 16" aria-hidden="true">
                                <path d="M10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0"/>
                                <path d="M0 8s3-5.5 8-5.5S16 8 16 8s-3 5.5-8 5.5S0 8 0 8m8 3.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7"/>
                            </svg>
                            <span class="sr-only">Ansehen</span>
                        </a>

                        <a
                                href={`/intern/members/${m.id}?scope=edit`}
                                class="px-3 py-2 rounded-lg bg-blue-100 hover:bg-blue-200 transition text-blue-700 shadow-sm flex items-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-pencil-square" viewBox="0 0 16 16" aria-hidden="true">
                                <path d="M15.502 1.94a.5.5 0 0 1 0 .706L14.459 3.69l-2-2L13.502.646a.5.5 0 0 1 .707 0l1.293 1.293zm-1.75 2.456-2-2L4.939 9.21a.5.5 0 0 0-.121.196l-.805 2.414a.25.25 0 0 0 .316.316l2.414-.805a.5.5 0 0 0 .196-.12l6.813-6.814z"/>
                                <path fill-rule="evenodd" d="M1 13.5A1.5 1.5 0 0 0 2.5 15h11a1.5 1.5 0 0 0 1.5-1.5v-6a.5.5 0 0 0-1 0v6a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5H9a.5.5 0 0 0 0-1H2.5A1.5 1.5 0 0 0 1 2.5z"/>
                            </svg>
                            <span class="sr-only">Bearbeiten</span>
                        </a>

                        <form method="post" action="?/delete" class="inline" on:click|stopPropagation>
                            <input type="hidden" name="id" value={m.id} />
                            <button
                                    type="submit"
                                class="px-3 py-2 rounded-lg bg-red-100 hover:bg-red-200 transition text-red-700 shadow-sm flex items-center gap-2"
                                on:click={() => confirm("Willst du dieses Mitglied wirklich löschen?")}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash3" viewBox="0 0 16 16" aria-hidden="true">
                                    <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5M11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1zm1.958 1-.846 10.58a1 1 0 0 1-.997.92h-6.23a1 1 0 0 1-.997-.92L3.042 3.5zm-7.487 1a.5.5 0 0 1 .528.47l.5 8.5a.5.5 0 0 1-.998.06L5 5.03a.5.5 0 0 1 .47-.53Zm5.058 0a.5.5 0 0 1 .47.53l-.5 8.5a.5.5 0 1 1-.998-.06l.5-8.5a.5.5 0 0 1 .528-.47M8 4.5a.5.5 0 0 1 .5.5v8.5a.5.5 0 0 1-1 0V5a.5.5 0 0 1 .5-.5"/>
                                </svg>
                                <span class="sr-only">Löschen</span>
                            </button>
                        </form>

                        <a
                                href={`/intern/members/${m.id}/invite.pdf`}
                                class="px-3 py-2 rounded-lg bg-red-400 hover:bg-red-500 transition text-white shadow-sm flex items-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-file-earmark-pdf" viewBox="0 0 16 16" aria-hidden="true">
                                <path d="M14 14V4.5L9.5 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2M9.5 3A1.5 1.5 0 0 0 11 4.5h2V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h5.5z"/>
                                <path d="M4.603 14.087a.8.8 0 0 1-.438-.42c-.195-.388-.13-.776.08-1.102.198-.307.526-.568.897-.787a7.7 7.7 0 0 1 1.482-.645 20 20 0 0 0 1.062-2.227 7.3 7.3 0 0 1-.43-1.295c-.086-.4-.119-.796-.046-1.136.075-.354.274-.672.65-.823.192-.077.4-.12.602-.077a.7.7 0 0 1 .477.365c.088.164.12.356.127.538.007.188-.012.396-.047.614-.084.51-.27 1.134-.52 1.794a11 11 0 0 0 .98 1.686 5.8 5.8 0 0 1 1.334.05c.364.066.734.195.96.465.12.144.193.32.2.518.007.192-.047.382-.138.563a1.04 1.04 0 0 1-.354.416.86.86 0 0 1-.51.138c-.331-.014-.654-.196-.933-.417a5.7 5.7 0 0 1-.911-.95 11.7 11.7 0 0 0-1.997.406 11.3 11.3 0 0 1-1.02 1.51c-.292.35-.609.656-.927.787a.8.8 0 0 1-.58.029m1.379-1.901q-.25.115-.459.238c-.328.194-.541.383-.647.547-.094.145-.096.25-.04.361q.016.032.026.044l.035-.012c.137-.056.355-.235.635-.572a8 8 0 0 0 .45-.606m1.64-1.33a13 13 0 0 1 1.01-.193 12 12 0 0 1-.51-.858 21 21 0 0 1-.5 1.05zm2.446.45q.226.245.435.41c.24.19.407.253.498.256a.1.1 0 0 0 .07-.015.3.3 0 0 0 .094-.125.44.44 0 0 0 .059-.2.1.1 0 0 0-.026-.063c-.052-.062-.2-.152-.518-.209a4 4 0 0 0-.612-.053zM8.078 7.8a7 7 0 0 0 .2-.828q.046-.282.038-.465a.6.6 0 0 0-.032-.198.5.5 0 0 0-.145.04c-.087.035-.158.106-.196.283-.04.192-.03.469.046.822q.036.167.09.346z"/>
                            </svg>
                            <span class="sr-only">Einladung PDF</span>
                        </a>
                        </div>
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
