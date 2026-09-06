<script lang="ts">
    import { page } from "$app/state";
    import { Alert, Badge, Button, Card, DataTable, EmptyState, PageHeader, StatTile } from "$lib/components/ui";
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

    type Order = PageData["orders"][number];

    /** Hinweis nach dem Anlegen einer Bestellung mit Fehlbestand. */
    const backorderHint = $derived(page.url.searchParams.get("hinweis") === "nachbestellung");

    const stats = $derived({
        total: data.orders.reduce((sum, order) => sum + order.total, 0),
        open: data.orders.filter((order) => order.paymentStatus !== "paid" && !order.cancelled).length,
        delivered: data.orders.filter((order) => order.status === "delivered").length
    });
</script>

<svelte:head><title>Meine Bestellungen - Kämmerer</title></svelte:head>

{#snippet membersCell(order: Order)}
    <div class="flex flex-wrap gap-1.5">
        {#each order.members as member (member.id)}
            <Badge tone="neutral" size="xs" label={member.name} />
        {:else}
            <span class="text-fg-subtle">–</span>
        {/each}
    </div>
{/snippet}

{#snippet statusCell(order: Order)}
    <Badge tone={orderStatusTone(order.status)} size="xs" label={orderStatusLabel(order.status)} />
{/snippet}

{#snippet paymentCell(order: Order)}
    <Badge tone={paymentStatusTone(order.paymentStatus)} size="xs" label={paymentStatusLabel(order.paymentStatus)} />
{/snippet}

<div class="space-y-8">
    <PageHeader
        title="Meine Bestellungen"
        eyebrow="Kämmerer"
        subtitle="Bestellungen der mit deinem Konto verknüpften Mitglieder."
        back={{ href: "/intern/kaemmerer" }}
    >
        {#snippet actions()}
            {#if data.hasMembers}
                <Button href="/intern/kaemmerer/order/create" variant="primary" icon="plus-circle">
                    Neue Bestellung
                </Button>
            {/if}
        {/snippet}
    </PageHeader>

    {#if backorderHint}
        <Alert
            tone="warning"
            title="Nachbestellung nötig"
            message="Für einzelne Positionen reichte der Lagerbestand nicht. Sie werden nachbestellt und später ausgegeben."
        />
    {/if}

    {#if !data.hasMembers}
        <Card>
            <EmptyState
                icon="person-x"
                title="Kein Mitglied verknüpft"
                description="Mit deinem Konto ist bisher kein Mitglied verknüpft. Ohne verknüpftes Mitglied können keine Bestellungen angezeigt oder angelegt werden. Bitte wende dich an die Stammesführung."
            />
        </Card>
    {:else}
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatTile label="Bestellwert gesamt" value={formatEuro(stats.total)} tone="primary" icon="receipt" />
            <StatTile label="Offene Zahlungen" value={stats.open} tone="warning" icon="hourglass-split" />
            <StatTile label="Geliefert" value={stats.delivered} tone="success" icon="truck" />
        </div>

        <Card title="Bestellungen" meta={`${data.orders.length} Einträge`} padding="none">
            <DataTable
                columns={[
                    { key: "number", label: "Nummer", value: (o) => o.number },
                    { key: "members", label: "Mitglieder", cell: membersCell },
                    { key: "date", label: "Datum", value: (o) => formatDate(o.createdAt) },
                    { key: "status", label: "Status", cell: statusCell },
                    { key: "payment", label: "Zahlung", cell: paymentCell },
                    { key: "total", label: "Gesamt", align: "right", value: (o) => formatEuro(o.total) }
                ] satisfies Column<Order>[]}
                rows={data.orders}
                getKey={(o) => o.id}
                cardTitle={(o) => o.number}
                cardSubtitle={(o) => o.members.map((member) => member.name).join(", ")}
                rowHref={(o) => `/intern/kaemmerer/order/${o.id}`}
                rowClass={(o) => (o.cancelled ? "opacity-60" : "")}
                empty="Noch keine Bestellungen vorhanden."
            >
                {#snippet actions(order)}
                    <Button href={`/intern/kaemmerer/order/${order.id}`} variant="secondary" size="sm" icon="eye">
                        Öffnen
                    </Button>
                {/snippet}
            </DataTable>
        </Card>
    {/if}
</div>
