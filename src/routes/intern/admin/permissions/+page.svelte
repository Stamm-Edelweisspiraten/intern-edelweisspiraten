<script lang="ts">
    import { page } from "$app/state";
    import {
        Alert,
        Badge,
        Button,
        Card,
        ConfirmDialog,
        FormField,
        Modal,
        PageHeader,
        SearchInput,
        TextInput
    } from "$lib/components/ui";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type Role = PageData["roles"][number];

    let search = $state("");
    let createOpen = $state(false);
    let deleteTarget = $state<Role | null>(null);
    let deleteOpen = $state(false);
    let deleteForm = $state<HTMLFormElement | null>(null);

    const filteredRoles = $derived(
        data.roles.filter((role) => {
            const needle = search.trim().toLowerCase();
            if (!needle) return true;
            return `${role.name} ${role.key} ${role.description}`.toLowerCase().includes(needle);
        })
    );

    const saved = $derived(page.url.searchParams.get("gespeichert") === "1");
    const removed = $derived(page.url.searchParams.get("geloescht") === "1");

    function askDelete(role: Role) {
        deleteTarget = role;
        deleteOpen = true;
    }
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
            <SearchInput bind:value={search} placeholder="Rolle suchen..." label="Rolle suchen" />
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

    {#if filteredRoles.length === 0}
        <Card>
            <p class="text-sm text-fg-subtle text-center py-6">Keine passende Rolle gefunden.</p>
        </Card>
    {/if}

    {#each filteredRoles as role (role.id)}
        <Card>
            {#snippet header()}
                <div class="flex items-center gap-3 flex-wrap">
                    <h2 class="text-lg font-semibold text-fg">{role.name}</h2>
                    <Badge tone="neutral" size="xs" label={role.key} />
                    {#if role.system}
                        <Badge tone="primary" size="xs" label="Systemrolle" />
                    {/if}
                    {#if role.requireMfa}
                        <Badge tone="warning" size="xs" label="Zwei-Faktor" />
                    {/if}
                </div>
                {#if role.description}
                    <p class="text-sm text-fg-muted mt-1">{role.description}</p>
                {/if}
            {/snippet}

            {#snippet actions()}
                <Badge tone="info" size="xs" label={`${role.userCount} Zugänge`} />
                {#if !role.system}
                    <Button
                        variant="ghost"
                        size="sm"
                        icon="trash"
                        ariaLabel={`Rolle ${role.name} löschen`}
                        onclick={() => askDelete(role)}
                    />
                {/if}
            {/snippet}

            <form method="post" action="?/save" class="space-y-6">
                <input type="hidden" name="roleId" value={role.id} />

                {#each data.modules as module (module.key)}
                    <fieldset class="space-y-2">
                        <legend class="flex items-baseline gap-2 flex-wrap">
                            <span class="text-sm font-semibold text-fg">
                                <i class="bi bi-{module.icon} text-fg-subtle" aria-hidden="true"></i>
                                {module.name}
                            </span>
                            <span class="text-xs text-fg-subtle">{module.description}</span>
                        </legend>

                        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {#each module.permissions as permission (permission.key)}
                                <label
                                    class="flex items-start gap-2 text-sm text-fg px-3 py-2 rounded-lg border border-border hover:bg-surface-muted transition cursor-pointer"
                                    title={permission.hint || permission.key}
                                >
                                    <input
                                        type="checkbox"
                                        name="permissions"
                                        value={permission.key}
                                        checked={role.permissions.includes(permission.key)}
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
                                        <span class="block font-mono text-[0.65rem] text-fg-subtle break-all">
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
                            checked={role.requireMfa}
                            class="mt-0.5 rounded border-border-strong"
                        />
                        <span>
                            Zwei-Faktor erforderlich
                            <span class="block text-xs text-fg-muted">
                                Wer diese Rolle hat, muss eine Bestätigungs-App einrichten, bevor
                                der interne Bereich nutzbar ist.
                            </span>
                        </span>
                    </label>

                    <Button type="submit" variant="primary" icon="check-lg">Speichern</Button>
                </div>
            </form>
        </Card>
    {/each}
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
        <Button type="submit" variant="primary" icon="plus-circle" onclick={() => document.forms.namedItem("rolle-anlegen")?.requestSubmit()}>
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
