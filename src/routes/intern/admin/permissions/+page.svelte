<script lang="ts">
    import { untrack } from "svelte";
    import { enhance } from "$app/forms";
    import { beforeNavigate } from "$app/navigation";
    import { page } from "$app/state";
    import {
        Alert,
        Badge,
        Button,
        Card,
        ConfirmDialog,
        EmptyState,
        FormField,
        Modal,
        PageHeader,
        SearchInput,
        TextInput
    } from "$lib/components/ui";
    import { matchesPermission } from "$lib/permissions/match";
    import type { ActionData, PageData } from "./$types";

    /**
     * Master-Detail statt gestapelter Karten: links die Rollen, rechts die
     * Rechte der gewaehlten Rolle. Die Auswahl steht in der URL, damit sie den
     * Redirect nach dem Speichern ueberlebt und auch ohne JavaScript
     * funktioniert -- deshalb Links statt Schaltflaechen in der Liste.
     */

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type Role = PageData["roles"][number];

    let search = $state("");
    let createOpen = $state(false);
    let deleteTarget = $state<Role | null>(null);
    let deleteOpen = $state(false);
    let deleteForm = $state<HTMLFormElement | null>(null);
    let saving = $state(false);

    const selectedRole = $derived(
        data.roles.find((role) => role.id === data.selectedRoleId) ?? null
    );

    const filteredRoles = $derived(
        data.roles.filter((role) => {
            const needle = search.trim().toLowerCase();
            if (!needle) return true;
            return `${role.name} ${role.key} ${role.description}`.toLowerCase().includes(needle);
        })
    );

    /*
     * Der bearbeitete Zustand liegt lokal, damit "ungespeicherte Aenderungen"
     * ueberhaupt erkennbar sind. Er muss bei jedem Rollenwechsel und nach jedem
     * Speichern neu aus den Serverdaten gesetzt werden.
     *
     * Der Merker dafuer ist bewusst KEIN $state: er wird im $effect gelesen und
     * geschrieben: als Zustand wuerde der Effect sich selbst erneut ausloesen.
     */
    function syncKey(role: Role | null): string {
        if (!role) return "";
        return `${role.id}|${role.requireMfa}|${[...role.permissions].sort().join(",")}`;
    }

    /*
     * Der Startwert wird bewusst einmalig gelesen (untrack): der $effect unten
     * haelt ihn ab da an nach. Ohne diesen Startwert stuenden im ersten Bild
     * alle Kaestchen leer und wuerden erst danach gefuellt.
     */
    const initialRole = untrack(
        () => data.roles.find((role) => role.id === data.selectedRoleId) ?? null
    );

    let chosen = $state<string[]>([...(initialRole?.permissions ?? [])]);
    let requireMfa = $state(initialRole?.requireMfa === true);
    let syncedRole = syncKey(initialRole);

    $effect(() => {
        const key = syncKey(selectedRole);
        if (key === syncedRole) return;

        syncedRole = key;
        chosen = [...(selectedRole?.permissions ?? [])];
        requireMfa = selectedRole?.requireMfa === true;
    });

    /** Wie viele Haken sich gegenueber dem gespeicherten Stand unterscheiden. */
    const changeCount = $derived.by(() => {
        if (!selectedRole) return 0;

        const before = new Set(selectedRole.permissions);
        const after = new Set(chosen);
        let count = 0;

        for (const key of after) if (!before.has(key)) count += 1;
        for (const key of before) if (!after.has(key)) count += 1;
        if (requireMfa !== selectedRole.requireMfa) count += 1;

        return count;
    });

    /*
     * Bereiche, in denen die Rolle gar kein Recht traegt. Damit fallen neu
     * hinzugekommene Module (zuletzt Umfragen und Galerie) nicht unter den
     * Tisch. Geprueft wird ueber matchesPermission, denn "*" und "modul.*"
     * decken die Einzelrechte mit ab.
     */
    const modulesWithoutRights = $derived(
        selectedRole
            ? data.modules.filter(
                  (module) =>
                      module.key !== "*" &&
                      !module.permissions.some((permission) =>
                          matchesPermission(chosen, permission.key)
                      )
              )
            : []
    );

    const saved = $derived(page.url.searchParams.get("gespeichert") === "1");
    const removed = $derived(page.url.searchParams.get("geloescht") === "1");

    function countLabel(count: number): string {
        return count === 1 ? "1 Zugang" : `${count} Zugänge`;
    }

    function joinNames(names: string[]): string {
        if (names.length <= 1) return names.join("");
        return `${names.slice(0, -1).join(", ")} und ${names[names.length - 1]}`;
    }

    function askDelete(role: Role) {
        deleteTarget = role;
        deleteOpen = true;
    }

    // Ungespeicherte Haken gehen beim Wechsel der Rolle sonst wortlos verloren.
    beforeNavigate((navigation) => {
        if (saving || changeCount === 0) return;

        if (navigation.willUnload) {
            // Beim Verlassen der Anwendung fragt der Browser selbst nach.
            navigation.cancel();
            return;
        }

        const message =
            changeCount === 1
                ? "Es gibt eine ungespeicherte Änderung. Soll die Seite trotzdem verlassen werden?"
                : `Es gibt ${changeCount} ungespeicherte Änderungen. Soll die Seite trotzdem verlassen werden?`;

        if (!confirm(message)) navigation.cancel();
    });
</script>

<svelte:head><title>Berechtigungen - Intern</title></svelte:head>

<div class="max-w-6xl mx-auto space-y-8">
    <PageHeader
        title="Berechtigungen"
        eyebrow="Adminbereich"
        subtitle="Lege fest, welche Rolle auf welche Bereiche zugreifen darf."
        back={{ href: "/intern/admin" }}
    >
        {#snippet actions()}
            <Button variant="primary" icon="plus-circle" onclick={() => (createOpen = true)}>
                Neue Rolle
            </Button>
        {/snippet}
    </PageHeader>

    {#if saved}
        <Alert tone="success" message="Die Änderungen wurden gespeichert." />
    {/if}
    {#if removed}
        <Alert tone="success" message="Die Rolle wurde gelöscht." />
    {/if}
    {#if form?.error}
        <Alert tone="danger" message={form.error} />
    {/if}

    <Alert
        tone="info"
        title="Rechte gelten stammesweit oder für eine Gruppe"
        message="Mit dem Gruppensymbol gekennzeichnete Rechte lassen sich beim Zuweisen der Rolle auf eine einzelne Gruppe beschränken – unter „Zugänge“ oder über ein Amt mit Gruppenbezug. Ohne Gruppe gilt die Rolle für den ganzen Stamm."
    />

    {#if data.roles.length === 0}
        <Card>
            <EmptyState
                icon="shield-lock"
                title="Noch keine Rolle angelegt"
                description="Rollen tragen die Rechte. Lege zuerst eine Rolle an und hake anschließend an, was sie darf."
            >
                {#snippet action()}
                    <Button
                        variant="primary"
                        icon="plus-circle"
                        onclick={() => (createOpen = true)}
                    >
                        Neue Rolle
                    </Button>
                {/snippet}
            </EmptyState>
        </Card>
    {:else}
        <div class="grid gap-6 lg:grid-cols-[18rem_1fr] items-start">
            <Card padding="none">
                <div class="p-4">
                    <SearchInput
                        bind:value={search}
                        placeholder="Rolle suchen..."
                        label="Rolle suchen"
                        count={search.trim() ? filteredRoles.length : null}
                        class="sm:w-full"
                    />
                </div>

                {#if filteredRoles.length === 0}
                    <EmptyState inline title="Keine passende Rolle gefunden." />
                {:else}
                    <ul class="border-t border-border divide-y divide-border">
                        {#each filteredRoles as role (role.id)}
                            {@const active = role.id === data.selectedRoleId}
                            <li>
                                <a
                                    href="?rolle={role.id}"
                                    aria-current={active ? "true" : undefined}
                                    class={`block px-4 py-3 border-l-2 transition ${
                                        active
                                            ? "bg-primary-soft text-primary-soft-fg border-primary"
                                            : "border-transparent text-fg hover:bg-surface-muted"
                                    }`}
                                >
                                    <span class="flex items-center gap-2 flex-wrap">
                                        <span class="text-sm font-semibold">{role.name}</span>
                                        <Badge tone="neutral" size="xs" label={role.key} />
                                    </span>
                                    <span
                                        class={`mt-1 flex items-center gap-2 flex-wrap text-xs ${
                                            active ? "text-primary-soft-fg" : "text-fg-muted"
                                        }`}
                                    >
                                        <span>{countLabel(role.userCount)}</span>
                                        {#if role.system}<span>· Systemrolle</span>{/if}
                                        {#if role.requireMfa}<span>· Zwei-Faktor</span>{/if}
                                    </span>
                                </a>
                            </li>
                        {/each}
                    </ul>
                {/if}
            </Card>

            {#if !selectedRole}
                <Card>
                    <EmptyState
                        icon="hand-index"
                        title="Keine Rolle gewählt"
                        description="Wähle links eine Rolle aus, um ihre Rechte zu sehen und zu ändern."
                    />
                </Card>
            {:else}
                <Card>
                    {#snippet header()}
                        <div class="flex items-center gap-3 flex-wrap">
                            <h2 class="text-lg font-semibold text-fg">{selectedRole.name}</h2>
                            <Badge tone="neutral" size="xs" label={selectedRole.key} />
                            {#if selectedRole.system}
                                <Badge tone="primary" size="xs" label="Systemrolle" />
                            {/if}
                            {#if selectedRole.requireMfa}
                                <Badge tone="warning" size="xs" label="Zwei-Faktor" />
                            {/if}
                        </div>
                        {#if selectedRole.description}
                            <p class="text-sm text-fg-muted mt-1">{selectedRole.description}</p>
                        {/if}
                    {/snippet}

                    {#snippet actions()}
                        <Badge tone="info" size="xs" label={countLabel(selectedRole.userCount)} />
                        {#if !selectedRole.system}
                            <Button
                                variant="ghost"
                                size="sm"
                                icon="trash"
                                ariaLabel={`Rolle ${selectedRole.name} löschen`}
                                onclick={() => askDelete(selectedRole)}
                            />
                        {/if}
                    {/snippet}

                    <form
                        method="post"
                        action="?/save"
                        class="space-y-6"
                        use:enhance={() => {
                            saving = true;
                            return async ({ update }) => {
                                await update({ reset: false });
                                saving = false;
                            };
                        }}
                    >
                        <input type="hidden" name="roleId" value={selectedRole.id} />

                        {#if modulesWithoutRights.length > 0}
                            <Alert
                                tone="info"
                                message={`Diese Rolle hat noch keine Rechte in den Bereichen ${joinNames(
                                    modulesWithoutRights.map((module) => module.name)
                                )}.`}
                            />
                        {/if}

                        {#each data.modules as module (module.key)}
                            <fieldset class="space-y-2">
                                <legend class="flex items-baseline gap-2 flex-wrap">
                                    <span class="text-sm font-semibold text-fg">
                                        <i
                                            class="bi bi-{module.icon} text-fg-subtle"
                                            aria-hidden="true"
                                        ></i>
                                        {module.name}
                                    </span>
                                    <span class="text-xs text-fg-subtle">{module.description}</span>
                                </legend>

                                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {#each module.permissions as permission (permission.key)}
                                        <label
                                            class="flex items-start gap-2 text-sm text-fg px-3 py-2 rounded-control border border-border hover:bg-surface-muted transition cursor-pointer"
                                            title={permission.hint || permission.key}
                                        >
                                            <input
                                                type="checkbox"
                                                name="permissions"
                                                value={permission.key}
                                                bind:group={chosen}
                                                class="mt-0.5 rounded border-border-strong"
                                            />
                                            <span class="min-w-0">
                                                <span class="flex items-center gap-1.5 flex-wrap">
                                                    <span>{permission.label}</span>
                                                    {#if permission.groupScopable}
                                                        <i
                                                            class="bi bi-diagram-3 text-xs text-fg-subtle"
                                                            aria-label="Kann auf eine Gruppe beschränkt werden"
                                                        ></i>
                                                    {/if}
                                                </span>
                                                <span
                                                    class="block font-mono text-[0.65rem] text-fg-subtle break-all"
                                                >
                                                    {permission.key}
                                                </span>
                                                {#if permission.hint}
                                                    <span class="block text-xs text-fg-muted mt-1">
                                                        {permission.hint}
                                                    </span>
                                                {/if}
                                            </span>
                                        </label>
                                    {/each}
                                </div>
                            </fieldset>
                        {/each}

                        <div
                            class="flex items-center justify-between gap-4 flex-wrap border-t border-border pt-4"
                        >
                            <label class="flex items-start gap-2 text-sm text-fg cursor-pointer">
                                <input
                                    type="checkbox"
                                    name="requireMfa"
                                    bind:checked={requireMfa}
                                    class="mt-0.5 rounded border-border-strong"
                                />
                                <span>
                                    Zwei-Faktor erforderlich
                                    <span class="block text-xs text-fg-muted">
                                        Wer diese Rolle hat, muss eine Bestätigungs-App einrichten,
                                        bevor der interne Bereich nutzbar ist.
                                    </span>
                                </span>
                            </label>

                            <div class="flex items-center gap-3 flex-wrap">
                                <span class="text-xs text-fg-muted" aria-live="polite">
                                    {#if changeCount === 1}
                                        1 ungespeicherte Änderung
                                    {:else if changeCount > 1}
                                        {changeCount} ungespeicherte Änderungen
                                    {:else}
                                        Alle Änderungen gespeichert
                                    {/if}
                                </span>
                                <Button
                                    type="submit"
                                    variant={changeCount > 0 ? "primary" : "secondary"}
                                    icon="check-lg"
                                    loading={saving}
                                >
                                    Speichern
                                </Button>
                            </div>
                        </div>
                    </form>
                </Card>
            {/if}
        </div>
    {/if}
</div>

<Modal bind:open={createOpen} title="Neue Rolle anlegen">
    <form method="post" action="?/create" class="space-y-4" id="rolle-anlegen">
        <FormField label="Name" required>
            {#snippet children({ id })}
                <TextInput {id} name="name" required placeholder="Kassenwart" />
            {/snippet}
        </FormField>
        <FormField label="Schlüssel" hint="Kleinbuchstaben, Ziffern und Bindestriche." required>
            {#snippet children({ id })}
                <TextInput {id} name="key" required placeholder="kassenwart" />
            {/snippet}
        </FormField>
        <FormField label="Beschreibung">
            {#snippet children({ id })}
                <TextInput {id} name="description" placeholder="Verwaltet die Kasse." />
            {/snippet}
        </FormField>
    </form>

    {#snippet footer()}
        <Button variant="secondary" onclick={() => (createOpen = false)}>Abbrechen</Button>
        <Button
            type="submit"
            variant="primary"
            icon="plus-circle"
            onclick={() => document.forms.namedItem("rolle-anlegen")?.requestSubmit()}
        >
            Anlegen
        </Button>
    {/snippet}
</Modal>

<ConfirmDialog
    bind:open={deleteOpen}
    title="Rolle löschen"
    message={deleteTarget
        ? `Soll die Rolle „${deleteTarget.name}“ wirklich gelöscht werden? Sie wird dabei von ${deleteTarget.userCount} Zugang bzw. Zugängen und von allen Ämtern entfernt.`
        : ""}
    confirmLabel="Löschen"
    tone="danger"
    onconfirm={() => deleteForm?.requestSubmit()}
/>

<form method="post" action="?/delete" bind:this={deleteForm} class="hidden">
    <input type="hidden" name="roleId" value={deleteTarget?.id ?? ""} />
</form>
