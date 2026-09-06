<script lang="ts">
    import { enhance } from "$app/forms";
    import { goto, invalidateAll } from "$app/navigation";
    import {
        Alert, Badge, Button, Card, ConfirmDialog,
        FormField, PageHeader, SearchInput, Select, TextInput
    } from "$lib/components/ui";
    import { calculateAge, formatDate, formatDateTime } from "$lib/format";
    import { can } from "$lib/can";
    import { addToast } from "$lib/toastStore";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let savingMember = $state(false);
    let savingUsers = $state(false);

    const STAENDE = [
        "Neuling-Wölfling", "Wölfling", "Neuling-Pfadfinder", "Jungpfadfinder",
        "Knappe", "Pfadfinder", "Späher", "Kreuzpfadfinder"
    ];
    const STATUS = ["aktiv", "passiv", "gekündigt"];

    const permissions = $derived(data.permissions ?? []);
    // Vom Server entschieden -- die Rechte koennen auf die Gruppen dieses
    // Mitglieds beschraenkt sein und stehen dann nicht in `permissions`.
    const canEdit = $derived(data.canEdit);
    const canDelete = $derived(data.canDelete);
    const canViewLog = $derived(data.canViewLog);
    /**
     * Wer festlegt, welche Zugaenge ein Mitglied sehen duerfen, aendert
     * Rechte -- dafuer verlangt die Action zusaetzlich user.edit. Die
     * Oberflaeche fragte bisher nur members.edit ab und zeigte die
     * Schaltflaechen auch dem, der beim Speichern 403 bekommt.
     */
    const canLinkUsers = $derived(data.canLinkUsers);
    // Der Bescheid rechnet mit den Saetzen des Geschaeftsjahrs -- das ist Kasse.
    const canViewFinance = $derived(can(permissions, "finance.view"));

    const editing = $derived(data.scope === "edit" && canEdit);
    const readOnly = $derived(!editing);

    const groupNameById = $derived(
        new Map((data.groupNames ?? data.groups ?? []).map((g) => [g.id, g.name]))
    );

    /**
     * Arbeitskopie der geladenen Daten.
     *
     * Wichtig: sie wird zurückgesetzt, sobald ein ANDERES Mitglied geladen
     * wird. Ohne das zeigte die Seite nach einem Wechsel innerhalb derselben
     * Route weiterhin die Werte des zuvor geöffneten Mitglieds — genau der
     * Fehler, den die alte Variante mit Zuweisungen auf Modulebene hatte.
     */
    let birthday = $state(data.member.birthday);
    let isSecondMember = $state(data.member.isSecondMember ?? false);
    let dues = $state({ ...data.member.contributionDues });
    let selectedGroups = $state<string[]>([...(data.member.groups ?? [])]);
    let emails = $state([...(data.member.emails ?? [])]);
    let numbers = $state([...(data.member.numbers ?? [])]);
    let removeConsent = $state(false);
    let removeApplication = $state(false);

    let memberUserIds = $state<string[]>(
        Array.isArray(data.member.userIds) ? [...data.member.userIds] : []
    );
    let userSearch = $state("");

    let loadedId = data.member.id;
    $effect(() => {
        if (data.member.id === loadedId) return;

        loadedId = data.member.id;
        birthday = data.member.birthday;
        isSecondMember = data.member.isSecondMember ?? false;
        dues = { ...data.member.contributionDues };
        selectedGroups = [...(data.member.groups ?? [])];
        emails = [...(data.member.emails ?? [])];
        numbers = [...(data.member.numbers ?? [])];
        memberUserIds = Array.isArray(data.member.userIds) ? [...data.member.userIds] : [];
        removeConsent = false;
        removeApplication = false;
        userSearch = "";
    });

    let deleteOpen = $state(false);
    let deleteForm = $state<HTMLFormElement | null>(null);

    const age = $derived(calculateAge(birthday));

    const linkedUsers = $derived(
        (data.allUsers ?? []).filter((user) => memberUserIds.includes(user.id))
    );

    const availableUsers = $derived(
        (data.allUsers ?? [])
            .filter((user) => !memberUserIds.includes(user.id))
            .filter((user) => {
                const needle = userSearch.trim().toLowerCase();
                if (!needle) return true;
                return `${user.name} ${user.email}`.toLowerCase().includes(needle);
            })
            .slice(0, 20)
    );

    function addGroup() {
        selectedGroups = [...selectedGroups, data.groups?.[0]?.id ?? ""];
    }
    function removeGroup(index: number) {
        selectedGroups = selectedGroups.filter((_, i) => i !== index);
    }

    function addEmail() {
        emails = [...emails, { label: "", email: "" }];
    }
    function removeEmail(index: number) {
        emails = emails.filter((_, i) => i !== index);
    }

    function addNumber() {
        numbers = [...numbers, { label: "", number: "" }];
    }
    function removeNumber(index: number) {
        numbers = numbers.filter((_, i) => i !== index);
    }

    function addUser(id: string) {
        if (!memberUserIds.includes(id)) memberUserIds = [...memberUserIds, id];
        userSearch = "";
    }
    function removeUser(id: string) {
        memberUserIds = memberUserIds.filter((entry) => entry !== id);
    }

    const inputClass =
        "w-full px-3 py-2 rounded-control text-sm bg-surface text-fg border border-border-strong disabled:opacity-60";

    const fullName = $derived(`${data.member.firstname} ${data.member.lastname}`);
</script>

<svelte:head><title>{fullName} - Mitglied</title></svelte:head>

<div class="max-w-4xl mx-auto space-y-8">
    <PageHeader
        title={fullName}
        eyebrow="Mitglied"
        subtitle={data.member.fahrtenname ? `„${data.member.fahrtenname}“` : data.member.stand}
        back={{ href: "/intern/members" }}
    >
        {#snippet badge()}
            <Badge tone={data.member.status === "aktiv" ? "success" : "neutral"} label={data.member.status} />
            {#if age !== null}
                <Badge tone="neutral" size="xs" label={`${age} Jahre`} />
            {/if}
        {/snippet}

        {#snippet actions()}
            {#if canViewLog}
                <Button href={`/intern/members/${data.member.id}/log`} variant="secondary" icon="clock-history">
                    Änderungen
                </Button>
            {/if}
            <Button href={`/intern/members/${data.member.id}/invite.pdf`} variant="secondary" icon="file-earmark-pdf">
                Einladung
            </Button>
            {#if canViewFinance}
                <Button
                    href={`/intern/members/${data.member.id}/beitragsbescheid.pdf`}
                    variant="secondary"
                    icon="receipt"
                >
                    Beitragsbescheid
                </Button>
            {/if}
            {#if canEdit}
                {#if readOnly}
                    <Button href={`/intern/members/${data.member.id}?scope=edit`} variant="primary" icon="pencil">
                        Bearbeiten
                    </Button>
                {:else}
                    <Button href={`/intern/members/${data.member.id}`} variant="secondary" icon="x-lg">
                        Bearbeitung beenden
                    </Button>
                {/if}
            {/if}
        {/snippet}
    </PageHeader>

    {#if form?.error}<Alert tone="danger" message={form.error} />{/if}
    {#if form?.success}<Alert tone="success" message={form.success} />{/if}

    {#if data.member.updatedAt}
        <p class="text-sm text-fg-subtle">
            Zuletzt geändert {formatDateTime(data.member.updatedAt)}
            {#if data.member.updatedBy}von {data.member.updatedBy}{/if}
        </p>
    {/if}

    <!--
        Beide Formulare dieser Seite antworten gleich und ziehen die Daten
        anschliessend nach. Vorher endete `update` mit einer Weiterleitung und
        `update-users` mit einem Ergebnisobjekt: die eine Aenderung war danach
        zu sehen, die andere nicht.
    -->
    <form
        method="post"
        action="?/update"
        enctype="multipart/form-data"
        class="space-y-8"
        use:enhance={() => {
            savingMember = true;
            return async ({ result, update }) => {
                await update({ reset: false });
                await invalidateAll();
                savingMember = false;

                if (result.type === "success") {
                    // Der Wechsel zurueck in die Ansicht verwirft `form` --
                    // die Bestaetigung kommt deshalb als Kurzmeldung.
                    addToast("Die Änderungen wurden gespeichert.", "success");
                    if (editing) {
                        await goto(`/intern/members/${data.member.id}`, { noScroll: true });
                    }
                }
            };
        }}
    >
        <input type="hidden" name="id" value={data.member.id} />
        <input type="hidden" name="groups" value={JSON.stringify(selectedGroups)} />

        <Card title="Person">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Vorname" required>
                    {#snippet children({ id })}
                        <TextInput {id} name="firstname" value={data.member.firstname} disabled={readOnly} required />
                    {/snippet}
                </FormField>
                <FormField label="Nachname" required>
                    {#snippet children({ id })}
                        <TextInput {id} name="lastname" value={data.member.lastname} disabled={readOnly} required />
                    {/snippet}
                </FormField>
                <FormField label="Fahrtenname">
                    {#snippet children({ id })}
                        <TextInput {id} name="fahrtenname" value={data.member.fahrtenname} disabled={readOnly} />
                    {/snippet}
                </FormField>
                <FormField label="Geburtsdatum" hint={age !== null ? `${age} Jahre alt` : undefined} required>
                    {#snippet children({ id })}
                        <TextInput {id} name="birthday" type="date" bind:value={birthday} disabled={readOnly} required />
                    {/snippet}
                </FormField>
            </div>
        </Card>

        <Card title="Anschrift">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Straße und Hausnummer" class="md:col-span-2">
                    {#snippet children({ id })}
                        <TextInput {id} name="address_street" value={data.member.address?.street ?? ""} disabled={readOnly} />
                    {/snippet}
                </FormField>
                <FormField label="Postleitzahl">
                    {#snippet children({ id })}
                        <TextInput {id} name="address_zip" value={data.member.address?.zip ?? ""} disabled={readOnly} />
                    {/snippet}
                </FormField>
                <FormField label="Ort">
                    {#snippet children({ id })}
                        <TextInput {id} name="address_city" value={data.member.address?.city ?? ""} disabled={readOnly} />
                    {/snippet}
                </FormField>
            </div>
        </Card>

        <Card title="Mitgliedschaft">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField label="Stand">
                    {#snippet children({ id })}
                        <Select
                            {id}
                            name="stand"
                            value={data.member.stand}
                            disabled={readOnly}
                            options={STAENDE.map((option) => ({ value: option, label: option }))}
                        />
                    {/snippet}
                </FormField>
                <FormField label="Status">
                    {#snippet children({ id })}
                        <Select
                            {id}
                            name="status"
                            value={data.member.status}
                            disabled={readOnly}
                            options={STATUS.map((option) => ({ value: option, label: option }))}
                        />
                    {/snippet}
                </FormField>
                <FormField label="Eintrittsdatum">
                    {#snippet children({ id })}
                        <TextInput {id} name="entryDate" type="date" value={data.member.entryDate} disabled={readOnly} />
                    {/snippet}
                </FormField>
            </div>
        </Card>

        <Card title="Beiträge" subtitle="Welche Beitragsanteile zahlt dieses Mitglied?">
            <div class="space-y-4">
                <label class="flex items-start gap-3 px-4 py-3 rounded-card border border-border">
                    <input type="checkbox" name="isSecondMember" bind:checked={isSecondMember} disabled={readOnly} class="mt-1 rounded-control border-border-strong" />
                    <span>
                        <span class="block text-sm font-semibold text-fg">Zweitmitglied</span>
                        <span class="block text-xs text-fg-subtle">Vermerk auf der Beitragsrechnung.</span>
                    </span>
                </label>

                <fieldset class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <legend class="text-sm font-semibold text-fg-muted mb-2">Beitragsanteile</legend>
                    {#each [["stamm", "Stamm"], ["gau", "Gau"], ["landesmark", "Landesmark"], ["bund", "Bund"]] as [key, label] (key)}
                        <label class="flex items-center gap-2 px-3 py-2 rounded-control border border-border">
                            <input
                                type="checkbox"
                                name={`contributionDues_${key}`}
                                bind:checked={dues[key as keyof typeof dues]}
                                disabled={readOnly}
                                class="rounded-control border-border-strong"
                            />
                            <span class="text-sm text-fg">{label}</span>
                        </label>
                    {/each}
                </fieldset>
                <p class="text-xs text-fg-subtle">Abgewählte Anteile werden nicht berechnet.</p>
            </div>
        </Card>

        <Card title="Kontakt">
            <div class="space-y-6">
                <fieldset class="space-y-2">
                    <legend class="text-sm font-semibold text-fg-muted mb-2">E-Mail-Adressen</legend>
                    {#each emails as entry, index (index)}
                        <div class="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2 items-end">
                            <label class="text-xs text-fg-subtle">
                                Bezeichnung
                                <input bind:value={entry.label} name={`email_label_${index}`} disabled={readOnly} class={`mt-1 ${inputClass}`} />
                            </label>
                            <label class="text-xs text-fg-subtle">
                                E-Mail
                                <input bind:value={entry.email} name={`email_email_${index}`} type="email" disabled={readOnly} class={`mt-1 ${inputClass}`} />
                            </label>
                            {#if !readOnly}
                                <Button variant="ghost" size="sm" icon="trash" ariaLabel="E-Mail entfernen" onclick={() => removeEmail(index)} />
                            {/if}
                        </div>
                    {/each}
                    {#if !readOnly}
                        <Button variant="secondary" size="sm" icon="plus-lg" onclick={addEmail}>E-Mail hinzufügen</Button>
                    {/if}
                </fieldset>

                <fieldset class="space-y-2">
                    <legend class="text-sm font-semibold text-fg-muted mb-2">Telefonnummern</legend>
                    {#each numbers as entry, index (index)}
                        <div class="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2 items-end">
                            <label class="text-xs text-fg-subtle">
                                Bezeichnung
                                <input bind:value={entry.label} name={`number_label_${index}`} disabled={readOnly} class={`mt-1 ${inputClass}`} />
                            </label>
                            <label class="text-xs text-fg-subtle">
                                Nummer
                                <input bind:value={entry.number} name={`number_number_${index}`} type="tel" disabled={readOnly} class={`mt-1 ${inputClass}`} />
                            </label>
                            {#if !readOnly}
                                <Button variant="ghost" size="sm" icon="trash" ariaLabel="Nummer entfernen" onclick={() => removeNumber(index)} />
                            {/if}
                        </div>
                    {/each}
                    {#if !readOnly}
                        <Button variant="secondary" size="sm" icon="plus-lg" onclick={addNumber}>Telefonnummer hinzufügen</Button>
                    {/if}
                </fieldset>
            </div>
        </Card>

        <Card title="Gruppen">
            <div class="space-y-2">
                {#if selectedGroups.length === 0}
                    <p class="text-sm text-fg-subtle">Dieses Mitglied ist keiner Gruppe zugeordnet.</p>
                {/if}
                {#each selectedGroups as groupId, index (index)}
                    <div class="flex gap-2 items-center">
                        <label class="sr-only" for={`group-${index}`}>Gruppe {index + 1}</label>
                        <div class="flex-1">
                            <Select
                                id={`group-${index}`}
                                bind:value={selectedGroups[index]}
                                disabled={readOnly}
                                options={(data.groups ?? []).map((group) => ({
                                    value: group.id,
                                    label: group.name
                                }))}
                            />
                        </div>
                        {#if !readOnly}
                            <Button variant="ghost" size="sm" icon="trash" ariaLabel="Gruppe entfernen" onclick={() => removeGroup(index)} />
                        {/if}
                    </div>
                {/each}
                {#if !readOnly}
                    <Button variant="secondary" size="sm" icon="plus-lg" onclick={addGroup}>Gruppe hinzufügen</Button>
                {/if}
            </div>
        </Card>

        <Card title="Einwilligungen und Unterlagen">
            <div class="space-y-4">
                <fieldset class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <legend class="text-sm font-semibold text-fg-muted mb-2">Veröffentlichung von Bildern</legend>
                    {#each [["consent_social", "Soziale Medien", data.member.mediaConsent?.socialMedia ?? false], ["consent_website", "Webseite", data.member.mediaConsent?.website ?? false], ["consent_print", "Druckerzeugnisse", data.member.mediaConsent?.print ?? false]] as [name, label, checked] (name)}
                        <label class="flex items-center gap-2 px-3 py-2 rounded-control border border-border">
                            <input type="checkbox" name={name as string} checked={checked as boolean} disabled={readOnly} class="rounded-control border-border-strong" />
                            <span class="text-sm text-fg">{label}</span>
                        </label>
                    {/each}
                </fieldset>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="space-y-2">
                        <p class="text-sm font-semibold text-fg-muted">Einwilligungserklärung</p>
                        {#if data.member.consentFile}
                            <div class="flex items-center justify-between gap-2 px-3 py-2 rounded-control border border-border">
                                <a href={`/intern/members/${data.member.id}/files/consent`} class="text-sm text-primary hover:underline truncate">
                                    {data.member.consentFile.filename}
                                </a>
                                {#if !readOnly}
                                    <label class="flex items-center gap-1 text-xs text-danger">
                                        <input type="checkbox" bind:checked={removeConsent} class="rounded-control border-border-strong" />
                                        entfernen
                                    </label>
                                {/if}
                            </div>
                            <input type="hidden" name="remove_consent" value={removeConsent ? "true" : ""} />
                        {:else}
                            <p class="text-sm text-fg-subtle">Keine Datei hinterlegt.</p>
                        {/if}
                        {#if !readOnly}
                            <input type="file" name="consent_file" accept=".pdf,image/png,image/jpeg" class="w-full text-sm text-fg-muted file:mr-3 file:px-4 file:py-2 file:rounded-control file:border-0 file:bg-primary-soft file:text-primary-soft-fg file:font-semibold" />
                        {/if}
                    </div>

                    <div class="space-y-2">
                        <p class="text-sm font-semibold text-fg-muted">Aufnahmeantrag</p>
                        {#if data.member.applicationFile}
                            <div class="flex items-center justify-between gap-2 px-3 py-2 rounded-control border border-border">
                                <a href={`/intern/members/${data.member.id}/files/application`} class="text-sm text-primary hover:underline truncate">
                                    {data.member.applicationFile.filename}
                                </a>
                                {#if !readOnly}
                                    <label class="flex items-center gap-1 text-xs text-danger">
                                        <input type="checkbox" bind:checked={removeApplication} class="rounded-control border-border-strong" />
                                        entfernen
                                    </label>
                                {/if}
                            </div>
                            <input type="hidden" name="remove_application" value={removeApplication ? "true" : ""} />
                        {:else}
                            <p class="text-sm text-fg-subtle">Keine Datei hinterlegt.</p>
                        {/if}
                        {#if !readOnly}
                            <input type="file" name="application_file" accept=".pdf,image/png,image/jpeg" class="w-full text-sm text-fg-muted file:mr-3 file:px-4 file:py-2 file:rounded-control file:border-0 file:bg-primary-soft file:text-primary-soft-fg file:font-semibold" />
                        {/if}
                    </div>
                </div>
            </div>
        </Card>

        {#if !readOnly}
            <div class="flex justify-end gap-3 flex-wrap">
                <Button href={`/intern/members/${data.member.id}`} variant="secondary">Abbrechen</Button>
                <Button type="submit" variant="primary" icon="check-lg" loading={savingMember}>
                    Speichern
                </Button>
            </div>
        {/if}
    </form>

    <Card title="Verknüpfte Zugänge" subtitle="Diese Benutzerkonten dürfen die Daten des Mitglieds sehen.">
        <form
            method="post"
            action="?/update-users"
            class="space-y-4"
            use:enhance={() => {
                savingUsers = true;
                return async ({ update }) => {
                    await update({ reset: false });
                    await invalidateAll();
                    savingUsers = false;
                };
            }}
        >
            <input type="hidden" name="memberId" value={data.member.id} />
            <input type="hidden" name="userIds" value={JSON.stringify(memberUserIds)} />

            {#if linkedUsers.length === 0}
                <p class="text-sm text-fg-subtle">Noch kein Zugang verknüpft.</p>
            {:else}
                <ul class="space-y-2">
                    {#each linkedUsers as user (user.id)}
                        <li class="flex items-center justify-between gap-3 px-4 py-3 rounded-card border border-border">
                            <span class="min-w-0">
                                <span class="block text-sm font-semibold text-fg truncate">{user.name}</span>
                                <span class="block text-xs text-fg-subtle truncate">{user.email}</span>
                            </span>
                            {#if canLinkUsers}
                                <Button variant="ghost" size="sm" icon="x-lg" ariaLabel={`${user.name} entfernen`} onclick={() => removeUser(user.id)} />
                            {/if}
                        </li>
                    {/each}
                </ul>
            {/if}

            {#if canLinkUsers}
                <div class="space-y-2">
                    <SearchInput bind:value={userSearch} placeholder="Zugang suchen..." label="Zugang suchen" class="sm:w-full" />
                    {#if userSearch.trim()}
                        <ul class="max-h-48 overflow-y-auto space-y-1 border border-border rounded-card p-2">
                            {#each availableUsers as user (user.id)}
                                <li>
                                    <button
                                        type="button"
                                        class="w-full text-left px-3 py-2 rounded-control hover:bg-surface-muted transition"
                                        onclick={() => addUser(user.id)}
                                    >
                                        <span class="block text-sm text-fg">{user.name}</span>
                                        <span class="block text-xs text-fg-subtle">{user.email}</span>
                                    </button>
                                </li>
                            {:else}
                                <li class="px-3 py-2 text-sm text-fg-subtle">Kein passender Zugang gefunden.</li>
                            {/each}
                        </ul>
                    {/if}

                    <div class="flex justify-end">
                        <Button type="submit" variant="primary" icon="check-lg" loading={savingUsers}>
                            Zuordnung speichern
                        </Button>
                    </div>
                </div>
            {/if}
        </form>
    </Card>

    {#if canDelete}
        <Card title="Mitglied löschen" tone="warning">
            <p class="text-sm text-fg-muted">
                Das Mitglied wird dauerhaft entfernt. Buchungen bleiben erhalten, verlieren
                aber ihre Zuordnung.
            </p>
            <div class="flex justify-end mt-4">
                <Button variant="danger" icon="trash" onclick={() => (deleteOpen = true)}>
                    Mitglied löschen
                </Button>
            </div>
        </Card>
    {/if}
</div>

<form method="post" action="?/delete" bind:this={deleteForm} class="hidden">
    <input type="hidden" name="id" value={data.member.id} />
</form>

<ConfirmDialog
    bind:open={deleteOpen}
    title="Mitglied löschen?"
    message={`${fullName} wird dauerhaft entfernt. Diese Aktion kann nicht rückgängig gemacht werden.`}
    confirmLabel="Endgültig löschen"
    onconfirm={() => deleteForm?.requestSubmit()}
/>
