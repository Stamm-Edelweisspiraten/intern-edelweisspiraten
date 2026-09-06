<script lang="ts">
    import { page } from "$app/state";
    import {
        Alert, Badge, Button, Card, ConfirmDialog, DataTable,
        FormField, PageHeader, Select, TextInput
    } from "$lib/components/ui";
    import type { Column } from "$lib/components/ui";
    import { readHint } from "$lib/hints";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    /**
     * Rueckmeldung aus `?hinweis=`.
     *
     * Das Anlegen endet mit einer Weiterleitung hierher, wenn der Versand
     * scheitert oder gar kein Postausgang eingerichtet ist. Ein 303 setzt
     * `form` auf null -- ohne diesen Hinweis stand die Seite kommentarlos da.
     */
    const hint = $derived(readHint(page.url.searchParams.get("hinweis")));


    /** Ein eingeladener Zugang hat noch kein Passwort. */
    const pendingInvite = $derived(data.user.status === "invited");

    let confirmDelete = $state(false);
    let deleteForm = $state<HTMLFormElement | null>(null);

    type Session = PageData["sessions"][number];

    /**
     * Die Zuweisungen kommen als flache Liste (Rolle + optionale Gruppe).
     * Fuer die Anzeige wird daraus je Rolle "stammesweit ja/nein" und die
     * Menge der Gruppen.
     */
    const orgWide = $derived(
        new Set(
            data.user.roleAssignments
                .filter((entry) => entry.groupId === null)
                .map((entry) => entry.roleId)
        )
    );

    function groupsOf(roleId: string): Set<string> {
        return new Set(
            data.user.roleAssignments
                .filter((entry) => entry.roleId === roleId && entry.groupId !== null)
                .map((entry) => entry.groupId as string)
        );
    }

    const sessionColumns: Column<Session>[] = [
        { key: "device", label: "Gerät", value: (s) => s.device },
        { key: "ip", label: "IP-Adresse", value: (s) => s.ip },
        { key: "lastSeenAt", label: "Zuletzt aktiv", value: (s) => s.lastSeenAt },
        { key: "createdAt", label: "Angemeldet seit", value: (s) => s.createdAt }
    ];

    const STATUS_TONES = {
        active: "success",
        invited: "warning",
        disabled: "danger"
    } as const;

    const STATUS_LABELS = {
        active: "Aktiv",
        invited: "Eingeladen",
        disabled: "Deaktiviert"
    } as const;

    const TYPE_OPTIONS = [
        { value: "parent", label: "Erwachsen / Eltern" },
        { value: "child", label: "Kind" }
    ];

    const STATUS_OPTIONS = [
        { value: "active", label: "Aktiv" },
        { value: "invited", label: "Eingeladen" },
        { value: "disabled", label: "Deaktiviert" }
    ];
</script>

<svelte:head><title>{data.user.name} - Benutzer</title></svelte:head>

<div class="max-w-5xl mx-auto space-y-8">
    <PageHeader
        title={data.user.name}
        eyebrow="Adminbereich"
        subtitle={data.user.email}
        back={{ href: "/intern/admin/user" }}
    >
        {#snippet badge()}
            <Badge tone={STATUS_TONES[data.user.status]} label={STATUS_LABELS[data.user.status]} />
            {#if data.user.mfaEnabled}
                <Badge tone="primary" icon="shield-lock" label="2FA aktiv" />
            {/if}
        {/snippet}

        {#snippet actions()}
            {#if data.canImpersonate && !data.isSelf}
                <form method="post" action="/intern/admin/impersonate">
                    <input type="hidden" name="userId" value={data.user.id} />
                    <Button type="submit" variant="secondary" icon="person-badge">
                        Als dieser Benutzer ansehen
                    </Button>
                </form>
            {/if}
        {/snippet}
    </PageHeader>

    {#if hint}
        <Alert tone={hint.tone} message={hint.message} />
    {/if}
    {#if form?.error}
        <Alert tone="danger" message={form.error} />
    {/if}
    {#if form?.success}
        <Alert tone="success" message={form.success} />
    {/if}

    {#if pendingInvite}
        <Card tone="warning" title="Einladung ausstehend">
            <p class="text-sm text-fg-muted">
                Dieser Zugang wurde angelegt, aber noch nicht aktiviert – es ist kein Passwort
                gesetzt. Solange die Einladung nicht angenommen wurde, ist keine Anmeldung
                möglich. Der Link ist 14 Tage gültig.
            </p>
            <form method="post" action="?/resetPassword" class="flex justify-end mt-4">
                <Button type="submit" variant="primary" icon="envelope" disabled={!data.canEdit}>
                    Einladung erneut senden
                </Button>
            </form>
        </Card>
    {/if}

    {#if data.user.lockedUntil}
        <Alert tone="warning" title="Konto gesperrt">
            <p>
                Nach {data.user.failedLoginAttempts} Fehlversuchen gesperrt bis {data.user.lockedUntil}.
            </p>
            <form method="post" action="?/unlock" class="mt-3">
                <Button type="submit" variant="warning" size="sm" icon="unlock">Sperre aufheben</Button>
            </form>
        </Alert>
    {/if}

    <Card title="Stammdaten">
        <form method="post" action="?/update" class="space-y-5">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Name" required>
                    {#snippet children({ id })}
                        <TextInput {id} name="name" value={data.user.name} required disabled={!data.canEdit} />
                    {/snippet}
                </FormField>

                <FormField label="E-Mail-Adresse" required>
                    {#snippet children({ id })}
                        <TextInput {id} name="email" type="email" value={data.user.email} required disabled={!data.canEdit} />
                    {/snippet}
                </FormField>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Kontoart">
                    {#snippet children({ id, describedBy })}
                        <Select
                            {id}
                            {describedBy}
                            name="type"
                            value={data.user.type}
                            disabled={!data.canEdit}
                            options={TYPE_OPTIONS}
                        />
                    {/snippet}
                </FormField>

                <FormField label="Status" hint="Ein deaktivierter Zugang wird sofort abgemeldet.">
                    {#snippet children({ id, describedBy })}
                        <Select
                            {id}
                            {describedBy}
                            name="status"
                            value={data.user.status}
                            disabled={!data.canEdit}
                            options={STATUS_OPTIONS}
                        />
                    {/snippet}
                </FormField>
            </div>

            <dl class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <div>
                    <dt class="text-xs text-fg-subtle uppercase tracking-wide">Angelegt</dt>
                    <dd class="text-fg mt-0.5">{data.user.createdAt}</dd>
                </div>
                <div>
                    <dt class="text-xs text-fg-subtle uppercase tracking-wide">Letzte Anmeldung</dt>
                    <dd class="text-fg mt-0.5">{data.user.lastLoginAt ?? "–"}</dd>
                </div>
            </dl>

            {#if data.canEdit}
                <div class="flex justify-end">
                    <Button type="submit" variant="primary" icon="check-lg">Speichern</Button>
                </div>
            {/if}
        </form>
    </Card>

    <Card
        title="Rollen"
        subtitle="Rollen bestimmen, welche Bereiche zugänglich sind – stammesweit oder für einzelne Gruppen."
    >
        <form method="post" action="?/roles" class="space-y-3">
            <div class="space-y-2">
                {#each data.roles as role (role.id)}
                    {@const scoped = groupsOf(role.id)}
                    <div class="px-4 py-3 rounded-card border border-border space-y-3">
                        <label class="flex items-start gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                name="roles"
                                value={role.id}
                                checked={orgWide.has(role.id)}
                                disabled={!data.canEdit}
                                class="mt-1 rounded-control border-border-strong"
                            />
                            <span class="min-w-0">
                                <span class="block text-sm font-semibold text-fg">{role.name}</span>
                                <span class="block text-xs text-fg-subtle">
                                    Für den ganzen Stamm{role.description ? ` – ${role.description}` : ""}
                                </span>
                            </span>
                        </label>

                        {#if role.groupScopable && data.groups.length > 0}
                            <fieldset class="pl-7 space-y-2">
                                <legend class="text-xs font-medium text-fg-muted">
                                    Zusätzlich nur für diese Gruppen
                                </legend>
                                <div class="flex flex-wrap gap-2">
                                    {#each data.groups as group (group.id)}
                                        <label
                                            class="flex items-center gap-2 text-xs text-fg px-2.5 py-1.5 rounded-control border border-border cursor-pointer hover:bg-surface-muted transition"
                                        >
                                            <input
                                                type="checkbox"
                                                name={`groups_${role.id}`}
                                                value={group.id}
                                                checked={scoped.has(group.id)}
                                                disabled={!data.canEdit}
                                                class="rounded-control border-border-strong"
                                            />
                                            {group.name}
                                        </label>
                                    {/each}
                                </div>
                            </fieldset>
                        {/if}
                    </div>
                {/each}
            </div>

            <p class="text-xs text-fg-subtle">
                Rollen können auch über ein Amt entstehen: trägt ein Amt eine Rolle und hat es
                einen Gruppenbezug, gilt sie für dessen Inhaber nur in dieser Gruppe.
            </p>

            {#if data.canEdit}
                <div class="flex justify-end">
                    <Button type="submit" variant="primary" icon="check-lg">Rollen speichern</Button>
                </div>
            {/if}
        </form>
    </Card>

    <Card title="Verknüpfte Mitglieder" subtitle="Bestimmt, auf welche Mitgliederdaten der Zugang Zugriff hat.">
        <form method="post" action="?/members" class="space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-72 overflow-y-auto">
                {#each data.members as member (member.id)}
                    <label class="flex items-center gap-2 px-3 py-2 rounded-control border border-border cursor-pointer hover:bg-surface-muted transition">
                        <input
                            type="checkbox"
                            name="members"
                            value={member.id}
                            checked={data.user.memberIds.includes(member.id)}
                            disabled={!data.canEdit}
                            class="rounded-control border-border-strong"
                        />
                        <span class="text-sm text-fg truncate">{member.name}</span>
                    </label>
                {/each}
            </div>

            {#if data.canEdit}
                <div class="flex justify-end">
                    <Button type="submit" variant="primary" icon="check-lg">Zuordnung speichern</Button>
                </div>
            {/if}
        </form>
    </Card>

    <Card title="Anmeldung und Sicherheit">
        <div class="flex flex-wrap gap-3">
            <form method="post" action="?/resetPassword">
                <Button
                    type="submit"
                    variant={pendingInvite ? "primary" : "secondary"}
                    icon={pendingInvite ? "envelope" : "key"}
                    disabled={!data.canEdit}
                >
                    {pendingInvite ? "Einladung erneut senden" : "Link zum Zurücksetzen senden"}
                </Button>
            </form>
            <form method="post" action="?/resetMfa">
                <Button type="submit" variant="secondary" icon="shield-slash" disabled={!data.canEdit || !data.user.mfaEnabled}>
                    Zwei-Faktor zurücksetzen
                </Button>
            </form>
            <form method="post" action="?/revokeAllSessions">
                <Button type="submit" variant="secondary" icon="box-arrow-right" disabled={!data.canEdit}>
                    Überall abmelden
                </Button>
            </form>
        </div>
    </Card>

    <Card title="Aktive Sitzungen" meta={`${data.sessions.length} aktiv`} padding="none">
        <DataTable
            columns={sessionColumns}
            rows={data.sessions}
            getKey={(s) => s.id}
            cardTitle={(s) => s.device}
            cardSubtitle={(s) => s.ip}
            empty="Zurzeit keine aktiven Sitzungen."
        >
            {#snippet actions(session)}
                {#if session.isCurrent}
                    <Badge tone="primary" size="xs" label="Diese Sitzung" />
                {:else}
                    <form method="post" action="?/revokeSession">
                        <input type="hidden" name="sessionId" value={session.id} />
                        <Button type="submit" variant="secondary" size="sm" icon="x-lg" disabled={!data.canEdit}>
                            Beenden
                        </Button>
                    </form>
                {/if}
            {/snippet}
        </DataTable>
    </Card>

    {#if data.canDelete && !data.isSelf}
        <Card title="Zugang löschen" tone="warning">
            <p class="text-sm text-fg-muted">
                Der Zugang wird dauerhaft entfernt. Mitgliederdaten bleiben erhalten.
            </p>
            <form method="post" action="?/delete" bind:this={deleteForm} class="flex justify-end mt-4">
                <Button variant="danger" icon="trash" onclick={() => (confirmDelete = true)}>
                    Zugang löschen
                </Button>
            </form>
        </Card>
    {/if}
</div>

<ConfirmDialog
    bind:open={confirmDelete}
    title="Zugang wirklich löschen?"
    message={`Der Zugang von ${data.user.name} wird dauerhaft entfernt. Diese Aktion kann nicht rückgängig gemacht werden.`}
    confirmLabel="Endgültig löschen"
    onconfirm={() => deleteForm?.submit()}
/>
