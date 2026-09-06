<script lang="ts">
    import { page } from "$app/state";
    import AuthShell from "$lib/components/AuthShell.svelte";
    import { Alert } from "$lib/components/ui";
    import type { PageData } from "./$types";

    /** Bestaetigung nach dem Absenden -- wie `/join/[id]/success`. */

    let { data }: { data: PageData } = $props();

    const organization = $derived(page.data.organization);
</script>

<svelte:head>
    <title>Danke</title>
    <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<AuthShell
    title="Danke!"
    eyebrow={organization?.name ?? "Umfrage"}
    icon="check2-circle"
    subtitle={data.title
        ? `Deine Antwort zu „${data.title}“ ist eingegangen.`
        : "Deine Antwort ist eingegangen."}
>
    <Alert
        tone="success"
        message="Du kannst das Fenster jetzt schließen. Eine Bestätigung per E-Mail gibt es nicht."
    />

    <p class="text-sm text-fg-muted">
        Wenn du dich vertan hast, melde dich bitte direkt bei
        {organization?.name ?? "uns"} – über den Link lässt sich eine bereits abgegebene Antwort
        nicht mehr ändern.
    </p>
</AuthShell>
