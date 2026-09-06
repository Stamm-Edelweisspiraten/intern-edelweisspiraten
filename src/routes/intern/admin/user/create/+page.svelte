<script lang="ts">
    import { enhance } from "$app/forms";
    import { Alert, Button, Card, FormField, PageHeader, TextInput } from "$lib/components/ui";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let submitting = $state(false);
</script>

<svelte:head><title>Benutzer anlegen - Intern</title></svelte:head>

<div class="max-w-3xl mx-auto space-y-8">
    <PageHeader
        title="Benutzer anlegen"
        eyebrow="Adminbereich"
        subtitle="Der Zugang wird ohne Passwort angelegt. Die Person erhält einen Link zur Aktivierung."
        back={{ href: "/intern/admin/user" }}
    />

    {#if form?.error}
        <Alert tone="danger" message={form.error} />
    {/if}

    <Card>
        <form
            method="post"
            action="?/createUser"
            class="space-y-5"
            use:enhance={() => {
                submitting = true;
                return async ({ update }) => {
                    await update({ reset: false });
                    submitting = false;
                };
            }}
        >
            <FormField label="Name" required>
                {#snippet children({ id, describedBy })}
                    <TextInput
                        {id}
                        {describedBy}
                        name="name"
                        value={form?.name ?? ""}
                        placeholder="Max Mustermann"
                        required
                    />
                {/snippet}
            </FormField>

            <FormField label="E-Mail-Adresse" hint="Wird zugleich für die Anmeldung verwendet." required>
                {#snippet children({ id, describedBy })}
                    <TextInput
                        {id}
                        {describedBy}
                        name="email"
                        type="email"
                        value={form?.email ?? ""}
                        placeholder="name@example.org"
                        required
                    />
                {/snippet}
            </FormField>

            <fieldset class="space-y-2">
                <legend class="block text-sm font-semibold text-fg-muted mb-1">Kontoart</legend>
                <div class="flex gap-3 flex-wrap">
                    <label class="flex items-center gap-2 px-4 py-3 rounded-control border border-border cursor-pointer hover:bg-surface-muted transition">
                        <input type="radio" name="type" value="parent" checked />
                        <span class="text-sm text-fg">Erwachsen / Eltern</span>
                    </label>
                    <label class="flex items-center gap-2 px-4 py-3 rounded-control border border-border cursor-pointer hover:bg-surface-muted transition">
                        <input type="radio" name="type" value="child" />
                        <span class="text-sm text-fg">Kind</span>
                    </label>
                </div>
            </fieldset>

            <fieldset class="space-y-2">
                <legend class="block text-sm font-semibold text-fg-muted mb-1">Rollen</legend>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {#each data.roles as role (role.id)}
                        <label
                            class="flex items-start gap-3 px-4 py-3 rounded-control border border-border cursor-pointer hover:bg-surface-muted transition"
                        >
                            <input type="checkbox" name="roles" value={role.id} class="mt-1 rounded-control border-border-strong" />
                            <span class="min-w-0">
                                <span class="block text-sm font-semibold text-fg">{role.name}</span>
                                {#if role.description}
                                    <span class="block text-xs text-fg-subtle">{role.description}</span>
                                {/if}
                            </span>
                        </label>
                    {/each}
                </div>
            </fieldset>

            <div class="flex justify-end gap-3 pt-2 flex-wrap">
                <Button href="/intern/admin/user" variant="secondary">Abbrechen</Button>
                <Button type="submit" variant="primary" loading={submitting} icon="person-plus">
                    Anlegen und einladen
                </Button>
            </div>
        </form>
    </Card>
</div>
