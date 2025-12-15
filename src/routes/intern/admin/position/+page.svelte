<script lang="ts">
    export let data;

    let positions = data.positions ?? [];
    let members = data.members ?? [];

    let name = "";
    let email = "";
    let description = "";
    let memberIds: string[] = [];
    let type: "amt" | "gruppenleiter" = "amt";
    let groupId = "";
    let errorMsg = "";
    let successMsg = "";
    let submitting = false;
    let editingId: string | null = null;

    const appendMembers = (ids: string[]) =>
        ids.map((id) => members.find((m: any) => m.id === id)).filter(Boolean);

    const submit = async (event: SubmitEvent) => {
        event.preventDefault();
        submitting = true;
        errorMsg = "";
        successMsg = "";
        try {
            const form = new FormData();
            form.set("name", name);
            form.set("email", email);
            form.set("description", description);
            form.set("type", type);
            form.set("groupId", groupId);
            memberIds.forEach((id) => form.append("memberIds", id));

            const res = await fetch("?/create", { method: "POST", body: form });
            const json = await res.json();
            if (!res.ok || json.error) {
                throw new Error(json.error || "Fehler beim Speichern");
            }
            const newPos = {
                id: json.id ?? crypto.randomUUID(),
                name,
                email,
                description,
                memberIds: [...memberIds],
                members: appendMembers(memberIds),
                type,
                groupId
            };
            positions = [...positions, newPos];
            successMsg = "Amt angelegt.";
            name = "";
            email = "";
            description = "";
            memberIds = [];
            groupId = "";
            type = "amt";
        } catch (err: any) {
            errorMsg = err.message ?? "Unbekannter Fehler";
        } finally {
            submitting = false;
        }
    };

    const submitUpdate = async (event: SubmitEvent, posId: string) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget as HTMLFormElement);
        const ids = form.getAll("memberIds").map((v) => v.toString());
        const t = form.get("type")?.toString() as "amt" | "gruppenleiter";
        const group = form.get("groupId")?.toString() ?? "";
        try {
            const res = await fetch("?/update", { method: "POST", body: form });
            const json = await res.json();
            if (!res.ok || json.error) {
                throw new Error(json.error || "Fehler beim Speichern");
            }

            positions = positions.map((p: any) =>
                p.id === posId
                    ? {
                        ...p,
                        name: form.get("name")?.toString() ?? p.name,
                        email: form.get("email")?.toString() ?? "",
                        description: form.get("description")?.toString() ?? "",
                        memberIds: ids,
                        members: appendMembers(ids),
                        type: t,
                        groupId: group
                    }
                    : p
            );
            editingId = null;
        } catch (err: any) {
            errorMsg = err.message ?? "Unbekannter Fehler";
        }
    };

    const deletePosition = async (id: string, posName: string) => {
        if (!confirm(`Soll das Amt "${posName}" gelöscht werden?`)) return;
        const form = new FormData();
        form.set("id", id);
        const res = await fetch("?/delete", { method: "POST", body: form });
        if (res.ok) {
            positions = positions.filter((p: any) => p.id !== id);
        } else {
            const json = await res.json().catch(() => ({}));
            errorMsg = json.error || "Löschen fehlgeschlagen";
        }
    };
</script>

<div class="max-w-6xl mx-auto mt-16 space-y-8">
    <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
            <p class="text-sm font-semibold text-gray-700 uppercase tracking-wide">Admin</p>
            <h1 class="text-4xl font-bold text-gray-900">Ämter verwalten</h1>
            <p class="text-sm text-gray-600 mt-1">Ämter anlegen, zuordnen und pflegen.</p>
        </div>
        <a
                href="/intern/admin"
                class="inline-flex items-center gap-2 px-4 py-3 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl font-semibold text-gray-800 shadow-sm transition"
        >
            <span class="bi bi-arrow-left"></span>
            Zurück
        </a>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-1 bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
            <div class="flex items-center justify-between">
                <h2 class="text-xl font-semibold text-gray-900">Neues Amt</h2>
                <span class="bi bi-briefcase-fill text-blue-600"></span>
            </div>
            <form class="space-y-4" on:submit|preventDefault={submit}>
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-1">Name *</label>
                    <input
                            class="w-full px-4 py-2.5 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                            bind:value={name}
                            required
                            placeholder="z.B. Kassenwart"
                    />
                </div>
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-1">E-Mail (optional)</label>
                    <input
                            type="email"
                            class="w-full px-4 py-2.5 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                            bind:value={email}
                            placeholder="amt@example.de"
                    />
                </div>
                <div class="space-y-2">
                    <label class="block text-sm font-semibold text-gray-700">Typ</label>
                    <div class="flex items-center gap-4 text-sm text-gray-700">
                        <label class="flex items-center gap-2">
                            <input type="radio" name="type" value="amt" bind:group={type} />
                            Amt
                        </label>
                        <label class="flex items-center gap-2">
                            <input type="radio" name="type" value="gruppenleiter" bind:group={type} />
                            Gruppenleiter
                        </label>
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-1">Gruppe (nur Gruppenleiter)</label>
                    <select
                            class="w-full px-4 py-2.5 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                            bind:value={groupId}
                            name="groupId"
                            disabled={type !== "gruppenleiter"}
                    >
                        <option value="">Keine Gruppe</option>
                        {#each data.groups as g}
                            <option value={g.id}>{g.name}</option>
                        {/each}
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-1">Mitglieder (optional)</label>
                    <select
                            multiple
                            name="memberIds"
                            class="w-full px-4 py-2.5 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                            bind:value={memberIds}
                    >
                        {#each data.members as m}
                            <option value={m.id}>{m.name} {m.email ? `(${m.email})` : ""}</option>
                        {/each}
                    </select>
                    <p class="text-xs text-gray-500 mt-1">Mehrfachauswahl möglich.</p>
                </div>
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-1">Beschreibung (optional)</label>
                    <textarea
                            class="w-full px-4 py-2.5 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                            rows="3"
                            bind:value={description}
                            placeholder="Aufgaben oder Hinweise"
                    ></textarea>
                </div>
                <button
                        class="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl font-semibold shadow-sm hover:bg-blue-700 transition disabled:opacity-60"
                        type="submit"
                        disabled={submitting}
                >
                    <span class="bi bi-save"></span>
                    {submitting ? "Speichern..." : "Amt anlegen"}
                </button>
                {#if successMsg}
                    <p class="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{successMsg}</p>
                {/if}
                {#if errorMsg}
                    <p class="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{errorMsg}</p>
                {/if}
            </form>
        </div>

        <div class="lg:col-span-2 bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-3">
            <div class="flex items-center justify-between">
                <h2 class="text-xl font-semibold text-gray-900">Ämter</h2>
                <span class="text-sm text-gray-500">{positions.length} Einträge</span>
            </div>
            <div class="divide-y divide-gray-200">
                {#if positions.length === 0}
                    <div class="py-6 text-gray-500 text-sm">Noch keine Ämter angelegt.</div>
                {:else}
                    {#each positions as p}
                        <div class="py-4 flex flex-col gap-3">
                            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div class="flex-1">
                                    <div class="flex items-center gap-2 flex-wrap">
                                        <div class="px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-200">
                                            {p.type === "gruppenleiter" ? "Gruppenleiter" : "Amt"}
                                        </div>
                                        {#if p.groupId && p.type === "gruppenleiter"}
                                            <span class="text-xs text-gray-500">Gruppe: {data.groups.find((g: any) => g.id === p.groupId)?.name || p.groupId}</span>
                                        {/if}
                                    </div>
                                    <div class="mt-1 text-lg font-semibold text-gray-900">{p.name}</div>
                                    {#if p.email}
                                        <div class="text-sm text-gray-600">{p.email}</div>
                                    {/if}
                                    {#if p.description}
                                        <div class="text-sm text-gray-700 mt-1">{p.description}</div>
                                    {/if}
                                    <div class="text-sm text-gray-500 mt-1">
                                        {#if p.members?.length > 0}
                                            Zugeordnet: {p.members.map((m: any) => `${m.name}${m.email ? ` (${m.email})` : ""}`).join(", ")}
                                        {:else}
                                            Kein Mitglied zugeordnet
                                        {/if}
                                    </div>
                                </div>
                                <div class="flex items-center gap-2">
                                    <button
                                            type="button"
                                            class="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 shadow-sm"
                                            on:click={() => editingId = editingId === p.id ? null : p.id}
                                    >
                                        <span class="bi bi-pencil"></span>
                                        {editingId === p.id ? "Abbrechen" : "Bearbeiten"}
                                    </button>
                                    <button
                                            type="button"
                                            class="inline-flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 text-red-700 shadow-sm"
                                            on:click={() => deletePosition(p.id, p.name)}
                                    >
                                        <span class="bi bi-trash"></span>
                                        Löschen
                                    </button>
                                </div>
                            </div>

                            {#if editingId === p.id}
                                <div class="pt-2">
                                    <form method="post" action="?/update" class="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 border border-gray-200 rounded-lg p-4" on:submit|preventDefault={(e) => submitUpdate(e, p.id)}>
                                        <input type="hidden" name="id" value={p.id} />
                                        <div class="md:col-span-2">
                                            <label class="block text-sm font-semibold text-gray-700 mb-1">Name *</label>
                                            <input
                                                    class="w-full px-4 py-2.5 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                                    name="name"
                                                    required
                                                    value={p.name}
                                            />
                                        </div>
                                        <div>
                                            <label class="block text-sm font-semibold text-gray-700 mb-1">E-Mail</label>
                                            <input
                                                    type="email"
                                                    class="w-full px-4 py-2.5 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                                    name="email"
                                                    value={p.email}
                                            />
                                        </div>
                                        <div>
                                            <label class="block text-sm font-semibold text-gray-700 mb-1">Beschreibung</label>
                                            <input
                                                    class="w-full px-4 py-2.5 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                                    name="description"
                                                    value={p.description}
                                            />
                                        </div>
                                        <div class="md:col-span-2 flex items-center gap-4 text-sm text-gray-700">
                                            <label class="flex items-center gap-2">
                                                <input type="radio" name="type" value="amt" checked={p.type !== "gruppenleiter"} />
                                                Amt
                                            </label>
                                            <label class="flex items-center gap-2">
                                                <input type="radio" name="type" value="gruppenleiter" checked={p.type === "gruppenleiter"} />
                                                Gruppenleiter
                                            </label>
                                        </div>
                                        <div class="md:col-span-2">
                                            <label class="block text-sm font-semibold text-gray-700 mb-1">Gruppe (nur Gruppenleiter)</label>
                                            <select
                                                    name="groupId"
                                                    class="w-full px-4 py-2.5 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                                    disabled={p.type !== "gruppenleiter"}
                                                >
                                                <option value="">Keine Gruppe</option>
                                                {#each data.groups as g}
                                                    <option value={g.id} selected={p.groupId === g.id}>{g.name}</option>
                                                {/each}
                                            </select>
                                        </div>
                                        <div class="md:col-span-2">
                                            <label class="block text-sm font-semibold text-gray-700 mb-1">Mitglieder</label>
                                            <select
                                                    multiple
                                                    name="memberIds"
                                                    class="w-full px-4 py-2.5 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                            >
                                                {#each data.members as m}
                                                    <option value={m.id} selected={p.memberIds?.includes(m.id)}>
                                                        {m.name} {m.email ? `(${m.email})` : ""}
                                                    </option>
                                                {/each}
                                            </select>
                                            <p class="text-xs text-gray-500 mt-1">Mehrfachauswahl möglich.</p>
                                        </div>
                                        <div class="md:col-span-2 flex gap-3">
                                            <button
                                                    type="submit"
                                                    class="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
                                            >
                                                <span class="bi bi-save"></span>
                                                Speichern
                                            </button>
                                            <button
                                                    type="button"
                                                    class="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm"
                                                    on:click={() => editingId = null}
                                            >
                                                Abbrechen
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            {/if}
                        </div>
                    {/each}
                {/if}
            </div>
        </div>
    </div>
</div>
