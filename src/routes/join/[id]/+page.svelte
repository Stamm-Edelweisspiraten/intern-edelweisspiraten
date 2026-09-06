<script lang="ts">
    import AuthShell from "$lib/components/AuthShell.svelte";
    import { Alert, Button, FormField, TextInput } from "$lib/components/ui";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
    <title>Einladung bestätigen</title>
</svelte:head>

<AuthShell
    title={`Beitritt für ${data.member.firstname} ${data.member.lastname?.slice(0, 1) ?? ""}.`}
    eyebrow="Einladung"
    icon="shield-lock"
    subtitle="Gib den Einladungscode von deinem Einladungsschreiben ein."
>
    {#if form?.error}
        <Alert tone="danger" message={form.error} />
    {/if}

    <form method="post" class="space-y-4">
        <FormField label="Einladungscode" required>
            {#snippet children({ id, describedBy })}
                <TextInput
                    {id}
                    {describedBy}
                    name="code"
                    inputmode="numeric"
                    autocomplete="one-time-code"
                    maxlength={6}
                    placeholder="z.B. 927341"
                    required
                    class="text-center tracking-[0.4em] text-lg"
                />
            {/snippet}
        </FormField>

        <Button type="submit" variant="primary" full icon="arrow-right">Weiter</Button>
    </form>

    <p class="text-xs text-fg-subtle leading-relaxed border-t border-border pt-4">
        Wir speichern deine Daten ausschließlich für die Mitgliederverwaltung des Stammes.
        Es erfolgt keine Weitergabe an Dritte.
    </p>
</AuthShell>
