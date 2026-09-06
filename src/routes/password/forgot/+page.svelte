<script lang="ts">
    import { enhance } from "$app/forms";
    import AuthShell from "$lib/components/AuthShell.svelte";
    import { Alert, Button, FormField, TextInput } from "$lib/components/ui";
    import type { ActionData } from "./$types";

    let { form }: { form: ActionData } = $props();

    let submitting = $state(false);
</script>

<svelte:head>
    <title>Passwort vergessen</title>
</svelte:head>

<AuthShell
    title="Passwort vergessen"
    icon="key"
    subtitle="Gib deine E-Mail-Adresse ein. Wir senden dir einen Link, mit dem du ein neues Passwort festlegen kannst."
>
    {#if form?.success}
        <Alert tone="success" message={form.message} />
    {:else}
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
            <FormField label="E-Mail-Adresse" required>
                {#snippet children({ id, describedBy })}
                    <TextInput {id} {describedBy} name="email" type="email" required autocomplete="username" />
                {/snippet}
            </FormField>

            <Button type="submit" variant="primary" full loading={submitting} icon="envelope">
                Link anfordern
            </Button>
        </form>
    {/if}

    {#snippet footer()}
        <a href="/login" class="text-primary font-semibold hover:underline">Zurück zur Anmeldung</a>
    {/snippet}
</AuthShell>
