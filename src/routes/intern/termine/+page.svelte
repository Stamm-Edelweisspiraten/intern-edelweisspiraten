<script lang="ts">
    import { Button, Card, EmptyState, PageHeader } from "$lib/components/ui";
</script>

<svelte:head><title>Termine - Intern</title></svelte:head>

<div class="space-y-8">
    <PageHeader
        title="Termine"
        eyebrow="Stammesleben"
        subtitle="Stammes- und Gruppentermine an einem Ort."
        back={{ href: "/intern/dashboard", label: "Zum Dashboard" }}
    />

    <Card>
        <EmptyState
            icon="calendar-event"
            title="Noch keine Termine hinterlegt"
            description="Der Terminkalender ist in Vorbereitung. Sobald Termine eingepflegt sind, erscheinen sie hier – bis dahin gelten die Absprachen aus den Gruppenstunden."
        >
            {#snippet action()}
                <Button href="/intern/groups" variant="secondary" icon="diagram-3">
                    Zu den Gruppen
                </Button>
                <Button href="/intern/dashboard" variant="primary" icon="arrow-left">
                    Zurück zum Dashboard
                </Button>
            {/snippet}
        </EmptyState>
    </Card>
</div>
