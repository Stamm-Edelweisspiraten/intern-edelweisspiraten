<script lang="ts">
    import { enhance } from "$app/forms";
    import AuthShell from "$lib/components/AuthShell.svelte";
    import { Alert, Button, FormField, TextInput } from "$lib/components/ui";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let submitting = $state(false);
    let password = $state("");
    let passwordRepeat = $state("");

    const mismatch = $derived(passwordRepeat.length > 0 && password !== passwordRepeat);
</script>

<svelte:head>
    <title>Neues Passwort</title>
</svelte:head>

<AuthShell
    title="Neues Passwort festlegen"
    icon="shield-lock"
    subtitle={data.valid ? `Hallo ${data.name}, wähle bitte ein neues Passwort.` : undefined}
>
    {#if !data.valid}
        <Alert
            tone="danger"
            title="Link nicht mehr gültig"
            message="Der Link ist abgelaufen oder wurde bereits verwendet. Bitte fordere einen neuen an."
        />
        <Button href="/password/forgot" variant="primary" full icon="arrow-repeat">
            Neuen Link anfordern
        </Button>
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
            <FormField
                label="Neues Passwort"
                hint={`Mindestens ${data.minPasswordLength} Zeichen.`}
                required
            >
                {#snippet children({ id, describedBy })}
                    <TextInput
                        {id}
                        {describedBy}
                        name="password"
                        type="password"
                        bind:value={password}
                        minlength={data.minPasswordLength}
                        required
                        autocomplete="new-password"
                    />
                {/snippet}
            </FormField>

            <FormField
                label="Passwort wiederholen"
                required
                error={mismatch ? "Die beiden Passwörter stimmen nicht überein." : undefined}
            >
                {#snippet children({ id, describedBy, invalid })}
                    <TextInput
                        {id}
                        {describedBy}
                        {invalid}
                        name="passwordRepeat"
                        type="password"
                        bind:value={passwordRepeat}
                        required
                        autocomplete="new-password"
                    />
                {/snippet}
            </FormField>

            <Alert
                tone="info"
                message="Zur Sicherheit werden alle bestehenden Anmeldungen beendet."
            />

            <Button type="submit" variant="primary" full loading={submitting} disabled={mismatch} icon="check-lg">
                Passwort speichern
            </Button>
        </form>
    {/if}

    {#snippet footer()}
        <a href="/login" class="text-primary font-semibold hover:underline">Zurück zur Anmeldung</a>
    {/snippet}
</AuthShell>
