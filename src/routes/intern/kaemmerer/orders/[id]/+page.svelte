<script lang="ts">
    import { Alert, Badge, Button, Card, ConfirmDialog, DataTable, PageHeader, StatTile } from "$lib/components/ui";
    import type { Column } from "$lib/components/ui";
    import { formatEuro } from "$lib/money";
    import { formatDate } from "$lib/format";
    import {
        orderStatusLabel,
        orderStatusTone,
        paymentStatusLabel,
        paymentStatusTone
    } from "$lib/kaemmerer/orderStatus";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type Item = PageData["order"]["items"][number];
    type Row = { index: number; item: Item };

    const order = $derived(data.order);

    /** Der Index wird mitgefuehrt, weil ?/toggle ihn als itemIndex erwartet. */
    const rows = $derived((order.items ?? []).map((item, index) => ({ index, item })));

    const receivedCount = $derived(rows.filter((row) => row.item.received).length);

    /** Bestand des Artikels bzw. der Größe; null, wenn nicht ermittelbar. */
    function stockFor(item: Item): number | null {
        if (!item.articleId) return null;
        const article = data.articles.find((entry) => entry.id === item.articleId);
        if (!article) return null;

        if (item.size) {
            const size = article.sizes.find((entry) => entry.name === item.size);
            return size ? (size.stock ?? 0) : null;
        }
        return article.stock;
    }

    let cancelOpen = $state(false);
    let cancelForm = $state<HTMLFormElement | null>(null);
</script>

<svelte:head><title>Bestellung {data.order.number} - Kämmerer</title></svelte:head>

{#snippet articleCell(row: Row)}
    <div class="space-y-1">
        <p class="font-semibold text-fg">{row.item.name}</p>
        {#if stockFor(row.item) !== null}
            {@const stock = stockFor(row.item) ?? 0}
            <p class={`text-xs flex items-center gap-1 ${stock >= row.item.quantity ? "text-success" : "text-warning"}`}>
                <span
                    class={`bi bi-${stock >= row.item.quantity ? "box-seam" : "exclamation-diamond"}`}
                    aria-hidden="true"
                ></span>
                Lager: {stock}
            </p>
        {/if}
    </div>
{/snippet}

{#snippet deliveryCell(row: Row)}
    {#if row.item.received}
        <Badge tone="success" size="xs" icon="check-lg" label="Zugestellt" />
    {:else if row.item.backorder}
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
        back={{ href: "/intern/kaemmerer/orders", label: "Zurück zur Verwaltung" }}
    >
        {#snippet badge()}
            {#if order.cancelled}
                <Badge tone="danger" icon="x-octagon" label="Storniert" />
            {/if}
        {/snippet}

        {#snippet actions()}
            {#if data.canCancel && !order.cancelled}
                <Button variant="danger" icon="x-octagon" onclick={() => (cancelOpen = true)}>
                    Bestellung stornieren
                </Button>
            {/if}
        {/snippet}
    </PageHeader>

    {#if form?.error}<Alert tone="danger" message={form.error} />{/if}
    {#if form?.success}<Alert tone="success" message={form.success} />{/if}

    {#if order.cancelled}
        <Alert
            tone="warning"
            title="Diese Bestellung ist storniert"
            message="Der Lagerbestand wurde zurückgebucht und die zugehörigen Rechnungen wurden storniert."
        />
    {/if}

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
        <StatTile
            label="Zugestellt"
            value={`${receivedCount}/${rows.length}`}
            icon="check2-square"
            tone={receivedCount === rows.length && rows.length > 0 ? "success" : "neutral"}
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

    <Card title="Positionen" meta={`${rows.length} Artikel`} padding="none">
        <DataTable
            columns={[
                { key: "name", label: "Artikel", cell: articleCell },
                { key: "size", label: "Größe", value: (row) => row.item.size ?? "–" },
                { key: "quantity", label: "Menge", align: "right", value: (row) => row.item.quantity },
                { key: "price", label: "Einzelpreis", align: "right", value: (row) => formatEuro(row.item.price) },
                { key: "delivery", label: "Lieferung", cell: deliveryCell },
                { key: "total", label: "Gesamt", align: "right", value: (row) => formatEuro(row.item.total) }
            ] satisfies Column<Row>[]}
            {rows}
            getKey={(row) => String(row.index)}
            cardTitle={(row) => row.item.name}
            cardSubtitle={(row) => (row.item.size ? `Größe ${row.item.size}` : undefined)}
            empty="Keine Positionen vorhanden."
        >
            {#snippet actions(row)}
                {#if data.canManage && !order.cancelled}
                    <form method="post" action="?/toggle">
                        <input type="hidden" name="itemIndex" value={row.index} />
                        <input type="hidden" name="received" value={row.item.received ? "false" : "true"} />
                        <Button
                            type="submit"
                            variant={row.item.received ? "secondary" : "success"}
                            size="sm"
                            icon={row.item.received ? "arrow-counterclockwise" : "check-lg"}
                        >
                            {row.item.received ? "Als offen markieren" : "Als zugestellt markieren"}
                        </Button>
                    </form>
                {/if}
            {/snippet}
        </DataTable>

        {#snippet footer()}
            <div class="flex items-center gap-3">
                <span class="text-sm font-semibold text-fg-muted">Summe</span>
                <span class="text-lg font-bold text-fg">{formatEuro(order.total)}</span>
            </div>
        {/snippet}
    </Card>

    <div class="flex justify-end">
        <Button href="/intern/kaemmerer/orders" variant="secondary" icon="arrow-left">
            Zurück zur Verwaltung
        </Button>
    </div>
</div>

<form method="post" action="?/cancel" bind:this={cancelForm} class="hidden"></form>

<ConfirmDialog
    bind:open={cancelOpen}
    title="Bestellung stornieren?"
    message={`Die Bestellung ${order.number} wird storniert. Noch nicht ausgegebene Positionen werden ins Lager zurückgebucht und die zugehörigen Rechnungen storniert.`}
    confirmLabel="Stornieren"
    tone="danger"
    onconfirm={() => cancelForm?.requestSubmit()}
/>
