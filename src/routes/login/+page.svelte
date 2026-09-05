<script lang="ts">
    import { enhance } from "$app/forms";
    import AuthShell from "$lib/components/AuthShell.svelte";
    import { Alert, Button, FormField, TextInput } from "$lib/components/ui";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let submitting = $state(false);
    let email = $state("");

    // Bei einem Fehlversuch bleibt die eingegebene Adresse stehen.
    $effect(() => {
        if (form?.email) email = form.email;
    });
</script>

<svelte:head>
    <title>Anmelden - Stamm Edelweisspiraten</title>
</svelte:head>

<AuthShell
    title="Willkommen zurück"
    subtitle="Melde dich mit deiner E-Mail-Adresse und deinem Passwort an."
>
    {#if data.needsSetup}
        <Alert tone="warning" title="Noch kein Zugang vorhanden">
            <p>
                Es existiert noch kein Benutzerkonto.
                <a href="/setup" class="font-semibold underline">Jetzt Ersteinrichtung starten</a>.
            </p>
        </Alert>
    {/if}

    {#if data.notice === "abgemeldet"}
        <Alert tone="success" message="Du wurdest abgemeldet." />
    {/if}
    {#if data.notice === "passwort-geaendert"}
        <Alert tone="success" message="Dein Passwort wurde geändert. Bitte melde dich neu an." />
    {/if}

    {#if form?.error}
        <Alert tone="danger" message={form.error} />
    {/if}

    <form
        method="post"
        class="space-y-4"
        use:enhance={() => {
            submitting = true;
            return async ({ update }) => {
                await update({ reset: false });
                submitting = false;
            };
        }}
    >
        <input type="hidden" name="redirectTo" value={data.redirectTo ?? ""} />

        <FormField label="E-Mail-Adresse" required>
            {#snippet children({ id, describedBy })}
                <TextInput
                    {id}
                    {describedBy}
                    name="email"
                    type="email"
                    bind:value={email}
                    autocomplete="username"
                    placeholder="name@example.org"
                    required
                />
            {/snippet}
        </FormField>

        <FormField label="Passwort" required>
            {#snippet children({ id, describedBy })}
                <TextInput
                    {id}
                    {describedBy}
                    name="password"
                    type="password"
                    autocomplete="current-password"
                    required
                />
            {/snippet}
        </FormField>

        <Button type="submit" variant="primary" full loading={submitting} icon="box-arrow-in-right">
            Anmelden
        </Button>
    </form>

    {#snippet footer()}
        <a href="/password/forgot" class="text-primary font-semibold hover:underline">
            Passwort vergessen?
        </a>
    {/snippet}
</AuthShell>
