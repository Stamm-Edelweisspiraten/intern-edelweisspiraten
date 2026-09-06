<script lang="ts">
    import { enhance } from "$app/forms";
    import AuthShell from "$lib/components/AuthShell.svelte";
    import { Alert, Button, FormField, TextInput } from "$lib/components/ui";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let submitting = $state(false);
</script>

<svelte:head>
    <title>Bestätigung</title>
</svelte:head>

<AuthShell
    title="Zwei-Faktor-Bestätigung"
    subtitle={`Gib den sechsstelligen Code aus deiner Authenticator-App ein, um die Anmeldung als ${data.email} abzuschließen.`}
    icon="shield-lock"
>
    {#if form?.error}
        <Alert tone="danger" message={form.error} />
    {/if}

    <form
        method="post"
        action="?/verify"
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

        <FormField label="Code" hint="Alternativ kannst du einen Wiederherstellungscode eingeben." required>
            {#snippet children({ id, describedBy })}
                <TextInput
                    {id}
                    {describedBy}
                    name="code"
                    inputmode="numeric"
                    autocomplete="one-time-code"
                    placeholder="123456"
                    required
                    class="text-center tracking-[0.4em] text-lg"
                />
            {/snippet}
        </FormField>

        <Button type="submit" variant="primary" full loading={submitting} icon="check-lg">
            Bestätigen
        </Button>
    </form>

    <form method="post" action="?/abbrechen">
        <Button type="submit" variant="ghost" full icon="x-lg">Abbrechen</Button>
    </form>
</AuthShell>
