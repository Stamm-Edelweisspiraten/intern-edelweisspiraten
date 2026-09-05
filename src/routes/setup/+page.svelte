<script lang="ts">
    import { enhance } from "$app/forms";
    import AuthShell from "$lib/components/AuthShell.svelte";
    import { Alert, Button, FormField, TextInput } from "$lib/components/ui";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let submitting = $state(false);
    let password = $state("");
    let passwordRepeat = $state("");

    const mismatch = $derived(
        passwordRepeat.length > 0 && password !== passwordRepeat
    );
</script>

<svelte:head>
    <title>Ersteinrichtung - Stamm Edelweisspiraten</title>
</svelte:head>

<AuthShell
    title="Ersteinrichtung"
    eyebrow="Einrichtung"
    icon="person-gear"
    subtitle="Lege den ersten Zugang mit Administrationsrechten an. Diese Seite ist danach nicht mehr erreichbar."
>
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
        <FormField label="Name" required>
            {#snippet children({ id, describedBy })}
                <TextInput {id} {describedBy} name="name" value={form?.name ?? ""} required autocomplete="name" />
            {/snippet}
        </FormField>

        <FormField label="E-Mail-Adresse" required>
            {#snippet children({ id, describedBy })}
                <TextInput
                    {id}
                    {describedBy}
                    name="email"
                    type="email"
                    value={form?.email ?? ""}
                    required
                    autocomplete="username"
                />
            {/snippet}
        </FormField>

        <FormField
            label="Passwort"
            hint={`Mindestens ${data.minPasswordLength} Zeichen. Eine Passphrase aus mehreren Wörtern ist eine gute Wahl.`}
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

        <Button type="submit" variant="primary" full loading={submitting} disabled={mismatch} icon="check-lg">
            Zugang anlegen
        </Button>
    </form>
</AuthShell>
