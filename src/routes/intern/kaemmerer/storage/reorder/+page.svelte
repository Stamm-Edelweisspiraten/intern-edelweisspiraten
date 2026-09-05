<script lang="ts">
    import { Badge, Button, Card, DataTable, EmptyState, PageHeader, StatTile } from "$lib/components/ui";
    import type { Column } from "$lib/components/ui";
    import type { PageData } from "./$types";

    let { data }: { data: PageData } = $props();

    type Row = PageData["reorder"][number];

    const stats = $derived({
        positions: data.reorder.length,
        units: data.reorder.reduce((sum, row) => sum + row.missing, 0),
        articles: new Set(data.reorder.map((row) => row.articleId)).size
    });
</script>

<svelte:head><title>Nachbestellliste - Kämmerer</title></svelte:head>

{#snippet missingCell(row: Row)}
    <Badge tone="warning" size="xs" label={`${row.missing} fehlen`} />
{/snippet}

{#snippet linkCell(row: Row)}
    {#if row.orderUrl}
        <a
            href={row.orderUrl}
            target="_blank"
            rel="noreferrer"
            class="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
        >
            <span class="bi bi-box-arrow-up-right" aria-hidden="true"></span>
            Bestellen
        </a>
    {:else}
        <span class="text-fg-subtle">–</span>
    {/if}
{/snippet}

<div class="space-y-8">
    <PageHeader
        title="Nachbestellliste"
        eyebrow="Kämmerer"
        subtitle="Fehlmengen bis zum Mindestbestand, je Artikel und Größe."
        back={{ href: "/intern/kaemmerer/storage", label: "Zurück ins Lager" }}
    />

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile label="Positionen" value={stats.positions} tone="warning" icon="list-check" />
        <StatTile label="Betroffene Artikel" value={stats.articles} icon="box" />
        <StatTile label="Fehlende Einheiten" value={stats.units} tone="danger" icon="exclamation-diamond" />
    </div>

    <Card
        title="Fehlende Mengen"
        subtitle="Berechnet aus aktuellem Bestand gegen den jeweiligen Mindestbestand."
        meta={`${data.reorder.length} Positionen`}
        padding="none"
    >
        {#if data.reorder.length === 0}
            <EmptyState
                icon="check-circle"
                title="Nichts nachzubestellen"
                description="Alle aktiven Artikel liegen mindestens auf ihrem Mindestbestand."
            >
                {#snippet action()}
                    <Button href="/intern/kaemmerer/storage" variant="secondary" icon="arrow-left">
                        Zurück ins Lager
                    </Button>
                {/snippet}
            </EmptyState>
        {:else}
            <DataTable
                columns={[
                    { key: "name", label: "Artikel", value: (row) => row.name },
                    { key: "size", label: "Größe", value: (row) => row.size ?? "–" },
                    { key: "stock", label: "Bestand", align: "right", value: (row) => row.stock },
                    { key: "minStock", label: "Mindestbestand", align: "right", value: (row) => row.minStock },
                    { key: "missing", label: "Fehlmenge", align: "right", cell: missingCell },
                    { key: "orderUrl", label: "Bestell-Link", cell: linkCell }
                ] satisfies Column<Row>[]}
                rows={data.reorder}
                getKey={(row) => `${row.articleId}-${row.size ?? ""}`}
                cardTitle={(row) => row.name}
                cardSubtitle={(row) => (row.size ? `Größe ${row.size}` : undefined)}
                rowHref={(row) => `/intern/kaemmerer/articles/${row.articleId}`}
                empty="Keine Fehlmengen vorhanden."
            />
        {/if}
    </Card>
</div>
