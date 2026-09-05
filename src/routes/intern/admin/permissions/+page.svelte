<script lang="ts">
    import { page } from "$app/state";
    import { Alert, Badge, Button, Card, FormField, Modal, PageHeader, SearchInput, TextInput } from "$lib/components/ui";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let search = $state("");
    let createOpen = $state(false);

    /** Berechtigungen nach Modul gruppieren, damit die Matrix lesbar bleibt. */
    const grouped = $derived.by(() => {
        const groups = new Map<string, string[]>();
        for (const permission of data.allPermissions) {
            const module = permission === "*" ? "Global" : permission.split(".")[0];
            const list = groups.get(module) ?? [];
            list.push(permission);
            groups.set(module, list);
        }
        return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "de"));
    });

    const filteredRoles = $derived(
        data.roles.filter((role) => {
            const needle = search.trim().toLowerCase();
            if (!needle) return true;
            return `${role.name} ${role.key} ${role.description}`.toLowerCase().includes(needle);
        })
    );

    const saved = $derived(page.url.searchParams.get("gespeichert") === "1");
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
    {#if form?.error}
        <Alert tone="danger" message={form.error} />
    {/if}

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
                </div>
                {#if role.description}
                    <p class="text-sm text-fg-muted mt-1">{role.description}</p>
                {/if}
            {/snippet}

            {#snippet actions()}
                <Badge tone="info" size="xs" label={`${role.userCount} Benutzer`} />
            {/snippet}

            <form method="post" action="?/save" class="space-y-5">
                <input type="hidden" name="roleId" value={role.id} />

                {#each grouped as [module, permissions] (module)}
                    <fieldset class="space-y-2">
                        <legend class="text-xs font-semibold text-fg-subtle uppercase tracking-wide">
                            {module}
                        </legend>
                        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {#each permissions as permission (permission)}
                                <label
                                    class="flex items-center gap-2 text-sm text-fg px-3 py-2 rounded-lg border border-border hover:bg-surface-muted transition cursor-pointer"
                                >
                                    <input
                                        type="checkbox"
                                        name="permissions"
                                        value={permission}
                                        checked={role.permissions.includes(permission)}
                                        class="rounded border-border-strong"
                                    />
                                    <span class="font-mono text-xs break-all">{permission}</span>
                                </label>
                            {/each}
                        </div>
                    </fieldset>
                {/each}

                <div class="flex justify-end pt-2">
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
