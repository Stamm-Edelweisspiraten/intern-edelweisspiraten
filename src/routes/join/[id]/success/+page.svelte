<script lang="ts">
    import AuthShell from "$lib/components/AuthShell.svelte";
    import { Button } from "$lib/components/ui";
    import type { PageData } from "./$types";

    let { data }: { data: PageData } = $props();
</script>

<svelte:head>
    <title>Registrierung erfolgreich - Stamm Edelweisspiraten</title>
</svelte:head>

<AuthShell
    title="Willkommen!"
    eyebrow="Erfolgreich verknüpft"
    icon="check2-circle"
    subtitle={`Dein Zugang wurde mit ${data.member.firstname} ${data.member.lastname} verbunden.`}
>
    <Button href="/intern/dashboard" variant="primary" full icon="arrow-right-circle">
        Weiter zum Dashboard
    </Button>

    <p class="text-sm text-fg-muted leading-relaxed">
        Mehrere Einladungen? Du kannst weitere Einladungslinks nutzen, um zusätzliche
        Mitglieder mit deinem Zugang zu verknüpfen.
    </p>
</AuthShell>
