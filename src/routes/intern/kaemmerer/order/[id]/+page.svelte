<script lang="ts">
    import { Badge, Button, Card, DataTable, PageHeader, StatTile } from "$lib/components/ui";
    import type { Column } from "$lib/components/ui";
    import { formatEuro } from "$lib/money";
    import { formatDate } from "$lib/format";
    import {
        orderStatusLabel,
        orderStatusTone,
        paymentStatusLabel,
        paymentStatusTone
    } from "$lib/kaemmerer/orderStatus";
    import type { PageData } from "./$types";

    let { data }: { data: PageData } = $props();

    type Item = PageData["order"]["items"][number];

    const order = $derived(data.order);
    const items = $derived(order.items ?? []);
</script>

<svelte:head><title>Bestellung {data.order.number} - Kämmerer</title></svelte:head>

{#snippet receivedCell(item: Item)}
    {#if item.received}
        <Badge tone="success" size="xs" icon="check-lg" label="Zugestellt" />
    {:else if item.backorder}
        <Badge tone="warning" size="xs" icon="exclamation-diamond" label="Nachbestellt" />
    {:else}
        <Badge tone="neutral" size="xs" label="Offen" />
    {/if}
{/snippet}

<div class="space-y-8">
    <PageHeader
        title={`Bestellung ${order.number}`}
        eyebrow="Kämmerer"
        subtitle={`Angelegt am ${formatDate(order.createdAt)}${order.createdByName ? ` von ${order.createdByName}` : ""}`}
        back={{ href: "/intern/kaemmerer/order", label: "Zurück zur Übersicht" }}
    >
        {#snippet badge()}
            {#if order.cancelled}
                <Badge tone="danger" icon="x-octagon" label="Storniert" />
            {/if}
        {/snippet}
    </PageHeader>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile
            label="Status"
            value={orderStatusLabel(order.status)}
            icon="truck"
            tone={order.status === "delivered" ? "success" : order.status === "cancelled" ? "danger" : "warning"}
        />
        <StatTile
            label="Zahlung"
            value={paymentStatusLabel(order.paymentStatus)}
            icon="cash-coin"
            tone={order.paymentStatus === "paid" ? "success" : "warning"}
        />
        <StatTile label="Gesamtbetrag" value={formatEuro(order.total)} icon="receipt" tone="primary" />
    </div>

    <Card title="Mitglieder" subtitle="Auf diese Mitglieder wurde die Bestellung gebucht.">
        <div class="flex flex-wrap gap-2">
            {#each order.members as member (member.id)}
                <Badge tone="neutral" label={member.name} />
            {:else}
                <p class="text-sm text-fg-subtle">Es ist kein Mitglied verknüpft.</p>
            {/each}
        </div>
    </Card>

    <Card title="Positionen" meta={`${items.length} Artikel`} padding="none">
        <DataTable
            columns={[
                { key: "name", label: "Artikel", value: (item) => item.name },
                { key: "size", label: "Größe", value: (item) => item.size ?? "–" },
                { key: "quantity", label: "Menge", align: "right", value: (item) => item.quantity },
                { key: "price", label: "Einzelpreis", align: "right", value: (item) => formatEuro(item.price) },
                { key: "received", label: "Lieferung", cell: receivedCell },
                { key: "total", label: "Gesamt", align: "right", value: (item) => formatEuro(item.total) }
            ] satisfies Column<Item>[]}
            rows={items}
            getKey={(item) => `${item.articleId ?? item.name}-${item.size ?? ""}-${item.quantity}`}
            cardTitle={(item) => item.name}
            cardSubtitle={(item) => (item.size ? `Größe ${item.size}` : undefined)}
            empty="Keine Positionen vorhanden."
        />

        {#snippet footer()}
            <div class="flex items-center gap-3">
                <span class="text-sm font-semibold text-fg-muted">Summe</span>
                <span class="text-lg font-bold text-fg">{formatEuro(order.total)}</span>
            </div>
        {/snippet}
    </Card>

    <div class="flex justify-end">
        <Button href="/intern/kaemmerer/order" variant="secondary" icon="arrow-left">
            Zurück zur Übersicht
        </Button>
    </div>
</div>
