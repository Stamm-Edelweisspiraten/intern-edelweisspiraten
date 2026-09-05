<script lang="ts">
    import { Button, Card, EmptyState, PageHeader } from "$lib/components/ui";
</script>

<svelte:head><title>Downloads - Intern</title></svelte:head>

<div class="space-y-8">
    <PageHeader
        title="Downloads"
        eyebrow="Unterlagen"
        subtitle="Formulare, Vorlagen und Unterlagen des Stammes."
        back={{ href: "/intern/dashboard", label: "Zum Dashboard" }}
    />

    <Card>
        <EmptyState
            icon="cloud-download"
            title="Noch keine Dateien bereitgestellt"
            description="Hier stellen wir künftig Formulare, Vorlagen und Unterlagen zum Herunterladen bereit. Bis dahin bekommst du die Dokumente wie gewohnt über die Stammesführung."
        >
            {#snippet action()}
                <Button href="/intern/dashboard" variant="primary" icon="arrow-left">
                    Zurück zum Dashboard
                </Button>
            {/snippet}
        </EmptyState>
    </Card>
</div>
