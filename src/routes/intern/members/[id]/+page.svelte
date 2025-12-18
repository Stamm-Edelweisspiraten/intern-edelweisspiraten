<script lang="ts">
    export let data;

    const permissions: string[] = data.permissions ?? [];
    const hasPerm = (p: string) => permissions.includes("*") || permissions.includes(p);

    const canEdit = hasPerm("members.edit") || hasPerm("groupleader.members.edit");
    const canDelete = hasPerm("members.delete") || hasPerm("groupleader.members.delete");
    const groupMap = new Map((data.groupNames ?? data.groups ?? []).map((g) => [g.id, g.name]));
    const mode = data.scope === "edit" && canEdit ? "edit" : "view";
    const disabled = mode === "view" ? true : undefined;

    let firstname = data.member.firstname;
    let lastname = data.member.lastname;
    let fahrtenname = data.member.fahrtenname;
    let birthday = data.member.birthday;
    const calcAge = (iso: string | null | undefined) => {
        if (!iso) return null;
        const b = new Date(iso);
        if (Number.isNaN(b.getTime())) return null;
        const now = new Date();
        let age = now.getFullYear() - b.getFullYear();
        const m = now.getMonth() - b.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
        return age >= 0 ? age : null;
    };
    $: age = calcAge(birthday);

    let address_street = data.member.address.street;
    let address_city = data.member.address.city;
    let address_zip = data.member.address.zip;

    let stand = data.member.stand;
    let status = data.member.status;

    let isSecondMember = data.member.isSecondMember ?? false;
    let contributionDues = {
        stamm: data.member.contributionDues?.stamm ?? (isSecondMember ? true : false),
        gau: data.member.contributionDues?.gau ?? false,
        landesmark: data.member.contributionDues?.landesmark ?? false,
        bund: data.member.contributionDues?.bund ?? false
    };

    $: if (!isSecondMember && (contributionDues.stamm || contributionDues.gau || contributionDues.landesmark || contributionDues.bund)) {
        contributionDues = { stamm: false, gau: false, landesmark: false, bund: false };
    }

    $: if (isSecondMember && !contributionDues.stamm) {
        contributionDues = { ...contributionDues, stamm: true };
    }

    let consentSocial = data.member.mediaConsent?.socialMedia ?? false;
    let consentWebsite = data.member.mediaConsent?.website ?? false;
    let consentPrint = data.member.mediaConsent?.print ?? false;
    let removeConsent = false;
    let removeApplication = false;

    let selectedGroups: string[] = [...(data.member.groups ?? [])];
    function addGroup() {
        if (disabled) return;
        const first = data.groups?.[0]?.id ?? "";
        selectedGroups = [...selectedGroups, first];
    }
    function updateGroup(idx: number, value: string) {
        if (disabled) return;
        const copy = [...selectedGroups];
        copy[idx] = value;
        selectedGroups = copy;
    }
    function removeGroup(idx: number) {
        if (disabled) return;
        selectedGroups = selectedGroups.filter((_, i) => i !== idx);
    }

    let entryDate = data.member.entryDate;

    let emails = [...data.member.emails];
    function addEmail() {
        if (disabled) return;
        emails = [...emails, { label: "", email: "" }];
    }
    function removeEmail(i: number) {
        if (disabled) return;
        emails = emails.filter((_, idx) => idx !== i);
    }

    let numbers = [...data.member.numbers];
    function addNumber() {
        if (disabled) return;
        numbers = [...numbers, { label: "", number: "" }];
    }
    function removeNumber(i: number) {
        if (disabled) return;
        numbers = numbers.filter((_, idx) => idx !== i);
    }

    let userSearch = "";
    let showUserList = false;
    const memberId = data.member.id;
    let memberUserIds = Array.isArray(data.member.userIds) ? [...data.member.userIds] : [];
    const userById = new Map((data.allUsers ?? []).map((u: any) => [u.id, u]));

    $: filteredUsers = (data.allUsers ?? []).filter(
        (u) =>
            (u.name ?? "").toLowerCase().includes(userSearch.toLowerCase()) ||
            (u.email ?? "").toLowerCase().includes(userSearch.toLowerCase()) ||
            (u.id ?? "").toLowerCase().includes(userSearch.toLowerCase())
    );

    function addUser(uid: string) {
        if (disabled) return;
        if (!memberUserIds.includes(uid)) {
            memberUserIds = [...memberUserIds, uid];
        }
        userSearch = "";
        showUserList = false;
    }

    function removeUser(uid: string) {
        if (disabled) return;
        memberUserIds = memberUserIds.filter((id) => id !== uid);
    }

    const formatDate = (iso: string) => new Date(iso).toLocaleString("de-DE");
    const lastChanged = data.member.updatedAt ? formatDate(data.member.updatedAt) : null;
</script>

<div class="max-w-6xl mx-auto mt-12 space-y-6">
    <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
            <p class="text-sm font-semibold text-gray-700 uppercase tracking-wide">Mitglieder</p>
            <h1 class="text-4xl font-bold text-gray-900">
                {mode === "view" ? "Mitglied ansehen" : "Mitglied bearbeiten"}
            </h1>
            {#if lastChanged}
                <p class="text-sm text-gray-600 mt-2">
                    Zuletzt geändert {lastChanged}{data.member.updatedBy ? ` von ${data.member.updatedBy}` : ""}
                </p>
            {/if}
        </div>
        <div class="flex items-center gap-2 flex-wrap">
            <a
                    href="/intern/members"
                    class="inline-flex items-center gap-2 px-4 py-3 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl font-semibold text-gray-800 shadow-sm transition"
            >
                <span class="bi bi-arrow-left"></span>
                Zurück
            </a>
            {#if mode === "view" && canEdit}
                <a
                        href={`/intern/members/${data.member.id}?scope=edit`}
                        class="inline-flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-sm transition"
                >
                    <span class="bi bi-pencil-square"></span>
                    Bearbeiten
                </a>
            {/if}
            <a
                href={`/intern/members/${data.member.id}/log`}
                class="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 shadow-sm"
            >
                <span class="bi bi-clock-history"></span>
                Änderungslog
            </a>
        </div>
    </div>

    <form method="post" enctype={mode === "edit" ? "multipart/form-data" : undefined} action={mode === "edit" ? "?/update" : undefined} class="space-y-7 bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
        <input type="hidden" name="id" value={data.member.id} />
        <input type="hidden" name="groups" value={JSON.stringify(selectedGroups)} />

        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div class="space-y-2">
                <label class="font-medium text-gray-800">Vorname</label>
                <input type="text" name="firstname" bind:value={firstname} disabled={disabled} class="w-full px-4 py-3 border rounded-lg bg-gray-50 disabled:opacity-70 focus:ring-2 focus:ring-blue-500" />
            </div>

            <div class="space-y-2">
                <label class="font-medium text-gray-800">Nachname</label>
                <input type="text" name="lastname" bind:value={lastname} disabled={disabled} class="w-full px-4 py-3 border rounded-lg bg-gray-50 disabled:opacity-70 focus:ring-2 focus:ring-blue-500" />
            </div>
        </div>

        <div class="space-y-2">
            <label class="font-medium text-gray-800">Fahrtenname (optional)</label>
            <input type="text" name="fahrtenname" bind:value={fahrtenname} disabled={disabled} class="w-full px-4 py-3 border rounded-lg bg-gray-50 disabled:opacity-70 focus:ring-2 focus:ring-blue-500" />
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label class="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" name="consent_social" bind:checked={consentSocial} disabled={disabled} />
                <span>Social Media erlaubt</span>
            </label>
            <label class="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" name="consent_website" bind:checked={consentWebsite} disabled={disabled} />
                <span>Stammeswebsite erlaubt</span>
            </label>
            <label class="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" name="consent_print" bind:checked={consentPrint} disabled={disabled} />
                <span>Print erlaubt</span>
            </label>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-2">
                <label class="font-medium text-gray-800">Datenschutzerklärung / Einwilligung (PDF/JPG/PNG)</label>
                <input type="file" name="consent_file" accept=".pdf,image/png,image/jpeg" disabled={disabled} class="w-full border rounded-lg px-3 py-2 bg-gray-50 disabled:opacity-70" />
                {#if data.member.consentFile}
                    <div class="flex items-center gap-3 text-sm">
                        <a class="text-blue-600 underline" href={`/intern/members/${data.member.id}/files/consent`} target="_blank" rel="noreferrer">
                            {data.member.consentFile.filename} ({Math.round(data.member.consentFile.size / 1024)} KB)
                        </a>
                        {#if mode === "edit"}
                            <input type="hidden" name="remove_consent" value={removeConsent ? "true" : ""} />
                            <button type="button"
                                    class={`px-3 py-2 rounded border text-sm ${removeConsent ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}
                                    on:click={() => { removeConsent = !removeConsent; }}>
                                {removeConsent ? "Entfernen rückgängig" : "Datei entfernen"}
                            </button>
                        {/if}
                    </div>
                {/if}
            </div>
            <div class="space-y-2">
                <label class="font-medium text-gray-800">Stammesanmeldung (PDF/JPG/PNG)</label>
                <input type="file" name="application_file" accept=".pdf,image/png,image/jpeg" disabled={disabled} class="w-full border rounded-lg px-3 py-2 bg-gray-50 disabled:opacity-70" />
                {#if data.member.applicationFile}
                    <div class="flex items-center gap-3 text-sm">
                        <a class="text-blue-600 underline" href={`/intern/members/${data.member.id}/files/application`} target="_blank" rel="noreferrer">
                            {data.member.applicationFile.filename} ({Math.round(data.member.applicationFile.size / 1024)} KB)
                        </a>
                        {#if mode === "edit"}
                            <input type="hidden" name="remove_application" value={removeApplication ? "true" : ""} />
                            <button type="button"
                                    class={`px-3 py-2 rounded border text-sm ${removeApplication ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}
                                    on:click={() => { removeApplication = !removeApplication; }}>
                                {removeApplication ? "Entfernen rückgängig" : "Datei entfernen"}
                            </button>
                        {/if}
                    </div>
                {/if}
            </div>
        </div>

        <div class="space-y-2">
            <div class="flex items-center justify-between gap-3">
                <label class="font-medium text-gray-800">Geburtstag</label>
                {#if age !== null}
                    <span class="px-2.5 py-1 text-xs font-semibold rounded-full border border-gray-200 bg-gray-50 text-gray-700">
                        {age} Jahre
                    </span>
                {/if}
            </div>
            <input type="date" name="birthday" bind:value={birthday} disabled={disabled} class="w-full px-4 py-3 border rounded-lg bg-gray-50 disabled:opacity-70 focus:ring-2 focus:ring-blue-500" />
        </div>

        <div class="space-y-2">
            <label class="font-medium text-gray-800">Adresse</label>
            <input type="text" name="address_street" bind:value={address_street} disabled={disabled} placeholder="Straße" class="w-full px-4 py-3 border rounded-lg bg-gray-50 mb-2 disabled:opacity-70 focus:ring-2 focus:ring-blue-500" />
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input type="text" name="address_zip" bind:value={address_zip} disabled={disabled} placeholder="PLZ" class="w-full px-4 py-3 border rounded-lg bg-gray-50 disabled:opacity-70 focus:ring-2 focus:ring-blue-500" />
                <input type="text" name="address_city" bind:value={address_city} disabled={disabled} placeholder="Stadt" class="w-full px-4 py-3 border rounded-lg bg-gray-50 disabled:opacity-70 focus:ring-2 focus:ring-blue-500" />
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div class="space-y-2">
                <label class="font-medium text-gray-800">Stand</label>
                <input type="text" name="stand" bind:value={stand} disabled={disabled} class="w-full px-4 py-3 border rounded-lg bg-gray-50 disabled:opacity-70 focus:ring-2 focus:ring-blue-500" />
            </div>
            <div class="space-y-2">
                <label class="font-medium text-gray-800">Status</label>
                <input type="text" name="status" bind:value={status} disabled={disabled} class="w-full px-4 py-3 border rounded-lg bg-gray-50 disabled:opacity-70 focus:ring-2 focus:ring-blue-500" />
            </div>
            <div class="space-y-2">
                <label class="font-medium text-gray-800">Eintrittsdatum</label>
                <input type="date" name="entryDate" bind:value={entryDate} disabled={disabled} class="w-full px-4 py-3 border rounded-lg bg-gray-50 disabled:opacity-70 focus:ring-2 focus:ring-blue-500" />
            </div>
        </div>

        <div class="space-y-3">
            <div class="flex items-center gap-3">
                <label class="font-medium text-gray-800">Ist Zweitmitglied?</label>
                <input type="checkbox" name="isSecondMember" bind:checked={isSecondMember} disabled={disabled} />
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                {#each ["stamm","gau","landesmark","bund"] as key}
                    <label class="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50">
                        <input type="checkbox" name={`contributionDues_${key}`} bind:checked={contributionDues[key]} disabled={disabled} />
                        <span class="capitalize">{key}</span>
                    </label>
                {/each}
            </div>
        </div>

        <div class="space-y-2">
            <div class="flex items-center justify-between">
                <label class="font-medium text-gray-800">Gruppen</label>
                {#if !disabled}
                    <button type="button" class="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm hover:bg-gray-50" on:click={addGroup}>
                        <span class="bi bi-plus"></span>
                        Gruppe hinzufügen
                    </button>
                {/if}
            </div>
            <div class="space-y-2">
                {#if selectedGroups.length === 0}
                    <p class="text-sm text-gray-500">Keine Gruppen zugeordnet.</p>
                {:else}
                    {#each selectedGroups as gid, idx}
                        <div class="flex items-center gap-2">
                            <select
                                    class="flex-1 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm"
                                    value={gid}
                                    disabled={disabled}
                                    on:change={(e) => updateGroup(idx, (e.currentTarget as HTMLSelectElement).value)}
                            >
                                {#each data.groups as g}
                                    <option value={g.id} selected={g.id === gid}>{g.name}</option>
                                {/each}
                            </select>
                            {#if !disabled}
                                <button type="button" class="px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm" on:click={() => removeGroup(idx)}>
                                    <span class="bi bi-trash"></span>
                                </button>
                            {/if}
                        </div>
                    {/each}
                {/if}
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-2">
                <div class="flex items-center justify-between">
                    <label class="font-medium text-gray-800">E-Mails</label>
                    {#if !disabled}
                        <button type="button" class="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm hover:bg-gray-50" on:click={addEmail}>
                            <span class="bi bi-plus"></span>
                            Hinzufügen
                        </button>
                    {/if}
                </div>
                <div class="space-y-2">
                    {#each emails as email, idx}
                        <div class="flex items-center gap-2">
                            <input type="text" name={`email_label_${idx}`} value={email.label} disabled={disabled} placeholder="Label" class="w-28 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm" />
                            <input type="email" name={`email_email_${idx}`} value={email.email} disabled={disabled} placeholder="email@example.de" class="flex-1 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm" />
                            {#if !disabled}
                                <button type="button" class="px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm" on:click={() => removeEmail(idx)}>
                                    <span class="bi bi-trash"></span>
                                </button>
                            {/if}
                        </div>
                    {/each}
                </div>
            </div>

            <div class="space-y-2">
                <div class="flex items-center justify-between">
                    <label class="font-medium text-gray-800">Telefon</label>
                    {#if !disabled}
                        <button type="button" class="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm hover:bg-gray-50" on:click={addNumber}>
                            <span class="bi bi-plus"></span>
                            Hinzufügen
                        </button>
                    {/if}
                </div>
                <div class="space-y-2">
                    {#each numbers as number, idx}
                        <div class="flex items-center gap-2">
                            <input type="text" name={`number_label_${idx}`} value={number.label} disabled={disabled} placeholder="Label" class="w-28 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm" />
                            <input type="text" name={`number_number_${idx}`} value={number.number} disabled={disabled} placeholder="+49..." class="flex-1 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm" />
                            {#if !disabled}
                                <button type="button" class="px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm" on:click={() => removeNumber(idx)}>
                                    <span class="bi bi-trash"></span>
                                </button>
                            {/if}
                        </div>
                    {/each}
                </div>
            </div>
        </div>

        <div class="space-y-2">
            <label class="font-medium text-gray-800">Benutzer-Zuordnung</label>
            <div class="space-y-2">
                <input type="hidden" name="userIds" value={JSON.stringify(memberUserIds)} />
                <div class="flex items-center gap-2 flex-wrap">
                    {#each memberUserIds as uid}
                        {#if userById.get(uid)}
                            <span class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-blue-200 bg-blue-50 text-blue-700 text-sm">
                                <span class="bi bi-person"></span>
                                <span>{userById.get(uid)?.name} ({userById.get(uid)?.email})</span>
                                {#if !disabled}
                                    <button type="button" class="text-blue-700 hover:text-blue-900" on:click={() => removeUser(uid)}>
                                        <span class="bi bi-x-lg"></span>
                                    </button>
                                {/if}
                            </span>
                        {:else}
                            <span class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gray-200 bg-gray-50 text-gray-600 text-sm">
                                <span class="bi bi-question-circle"></span>
                                <span>{uid}</span>
                                {#if !disabled}
                                    <button type="button" class="text-gray-600 hover:text-gray-800" on:click={() => removeUser(uid)}>
                                        <span class="bi bi-x-lg"></span>
                                    </button>
                                {/if}
                            </span>
                        {/if}
                    {/each}
                    {#if memberUserIds.length === 0}
                        <span class="text-sm text-gray-500">Keine User zugeordnet.</span>
                    {/if}
                </div>

                {#if !disabled}
                    <div class="space-y-2">
                        <input
                                type="text"
                                placeholder="Nach Benutzer suchen (Name/E-Mail/ID)"
                                bind:value={userSearch}
                                on:focus={() => showUserList = true}
                                class="w-full px-4 py-2.5 rounded-lg border border-gray-300 bg-white shadow-sm focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                        {#if showUserList && userSearch.length > 0}
                            <div class="border border-gray-200 rounded-lg shadow max-h-48 overflow-auto bg-white">
                                {#each filteredUsers as u}
                                    <button type="button" class="w-full text-left px-3 py-2 hover:bg-blue-50 flex justify-between text-sm" on:click={() => addUser(u.id)}>
                                        <span>{u.name} ({u.email})</span>
                                        <span class="text-gray-400">{u.id}</span>
                                    </button>
                                {/each}
                                {#if filteredUsers.length === 0}
                                    <div class="px-3 py-2 text-sm text-gray-500">Kein Treffer.</div>
                                {/if}
                            </div>
                        {/if}
                    </div>
                {/if}
            </div>
        </div>

        <div class="flex items-center justify-end gap-3">
            <a
                    href="/intern/members"
                    class="inline-flex items-center gap-2 px-4 py-3 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl font-semibold text-gray-800 shadow-sm transition"
            >
                <span class="bi bi-arrow-left"></span>
                Abbrechen
            </a>
            {#if mode === "edit"}
                <button type="submit" class="inline-flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-sm">
                    <span class="bi bi-save"></span>
                    Speichern
                </button>
            {/if}
        </div>
    </form>
</div>
