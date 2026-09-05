<script lang="ts">
    import { Alert, Badge, Button, Card, DataTable, PageHeader, SearchInput, StatTile } from "$lib/components/ui";
    import type { Column } from "$lib/components/ui";
    import { formatEuro } from "$lib/money";
    import { formatDate } from "$lib/format";
    import {
        orderStatusLabel,
        orderStatusTone,
        paymentStatusLabel,
        paymentStatusTone,
        ORDER_STATUS_OPTIONS,
        PAYMENT_STATUS_OPTIONS
    } from "$lib/kaemmerer/orderStatus";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type Order = PageData["orders"][number];

    let search = $state("");

    const filtered = $derived(
        data.orders.filter((order) => {
            const needle = search.trim().toLowerCase();
            if (!needle) return true;
            const haystack = `${order.number} ${order.createdByName} ${order.members.map((m) => m.name).join(" ")}`;
            return haystack.toLowerCase().includes(needle);
        })
    );

    const stats = $derived({
        total: data.orders.reduce((sum, o) => sum + o.total, 0),
        open: data.orders.filter((o) => o.paymentStatus !== "paid" && !o.cancelled).length,
        delivered: data.orders.filter((o) => o.status === "delivered").length
    });
</script>

<svelte:head><title>Bestellverwaltung - Kämmerer</title></svelte:head>

{#snippet statusCell(order: Order)}
    <Badge tone={orderStatusTone(order.status)} size="xs" label={orderStatusLabel(order.status)} />
{/snippet}

{#snippet paymentCell(order: Order)}
    <Badge tone={paymentStatusTone(order.paymentStatus)} size="xs" label={paymentStatusLabel(order.paymentStatus)} />
{/snippet}

{#snippet membersCell(order: Order)}
    <span class="text-sm">{order.members.map((m) => m.name).join(", ") || "–"}</span>
{/snippet}

<div class="space-y-8">
    <PageHeader
        title="Bestellverwaltung"
        eyebrow="Kämmerer"
        subtitle="Alle Bestellungen des Stammes, Lieferung und Zahlung."
        back={{ href: "/intern/kaemmerer" }}
    >
        {#snippet actions()}
            <SearchInput bind:value={search} placeholder="Nummer oder Mitglied..." label="Bestellungen durchsuchen" />
            <Button href="/intern/kaemmerer/orders/create" variant="primary" icon="plus-circle">
                Bestellung anlegen
            </Button>
        {/snippet}
    </PageHeader>

    {#if form?.error}<Alert tone="danger" message={form.error} />{/if}
    {#if form?.success}<Alert tone="success" message={form.success} />{/if}

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile label="Bestellwert gesamt" value={formatEuro(stats.total)} tone="primary" icon="receipt" />
        <StatTile label="Offene Zahlungen" value={stats.open} tone="warning" icon="hourglass-split" />
        <StatTile label="Geliefert" value={stats.delivered} tone="success" icon="truck" />
    </div>

    <Card padding="none">
        {#snippet header()}
            <div class="flex flex-wrap gap-2">
                <a
                    href="/intern/kaemmerer/orders"
                    class={`px-3 py-1.5 text-xs font-semibold rounded-full border transition ${data.status === "" ? "bg-primary-soft border-primary-soft-border text-primary-soft-fg" : "bg-surface border-border text-fg-muted hover:bg-surface-muted"}`}
                >
                    Alle
                </a>
                {#each ORDER_STATUS_OPTIONS as option (option.value)}
                    <a
                        href={`/intern/kaemmerer/orders?status=${option.value}`}
                        class={`px-3 py-1.5 text-xs font-semibold rounded-full border transition ${data.status === option.value ? "bg-primary-soft border-primary-soft-border text-primary-soft-fg" : "bg-surface border-border text-fg-muted hover:bg-surface-muted"}`}
                    >
                        {option.label}
                    </a>
                {/each}
            </div>
        {/snippet}

        <DataTable
            columns={[
                { key: "number", label: "Nummer", value: (o) => o.number },
                { key: "members", label: "Mitglieder", cell: membersCell },
                { key: "createdBy", label: "Besteller", value: (o) => o.createdByName || "–" },
                { key: "date", label: "Datum", value: (o) => formatDate(o.createdAt) },
                { key: "status", label: "Status", cell: statusCell },
                { key: "payment", label: "Zahlung", cell: paymentCell },
                { key: "total", label: "Summe", align: "right", value: (o) => formatEuro(o.total) }
            ] satisfies Column<Order>[]}
            rows={filtered}
            getKey={(o) => o.id}
            cardTitle={(o) => o.number}
            cardSubtitle={(o) => o.members.map((m) => m.name).join(", ")}
            rowHref={(o) => `/intern/kaemmerer/orders/${o.id}`}
            rowClass={(o) => (o.cancelled ? "opacity-60" : "")}
            empty={search ? "Keine passende Bestellung gefunden." : "Noch keine Bestellungen vorhanden."}
        >
            {#snippet actions(order)}
                <Button
                    href={`/intern/kaemmerer/orders/${order.id}`}
                    variant="secondary"
                    size="sm"
                    icon="eye"
                >
                    Öffnen
                </Button>

                {#if data.canManage && !order.cancelled}
                    <form method="post" action="?/status" class="flex items-center gap-2">
                        <input type="hidden" name="orderId" value={order.id} />
                        <label class="sr-only" for={`status-${order.id}`}>Status ändern</label>
                        <select
                            id={`status-${order.id}`}
                            name="status"
                            class="px-2 py-1.5 text-xs rounded-lg bg-surface text-fg border border-border"
                        >
                            {#each ORDER_STATUS_OPTIONS as option (option.value)}
                                <option value={option.value} selected={order.status === option.value}>
                                    {option.label}
                                </option>
                            {/each}
                        </select>
                        <label class="sr-only" for={`payment-${order.id}`}>Zahlung ändern</label>
                        <select
                            id={`payment-${order.id}`}
                            name="paymentStatus"
                            class="px-2 py-1.5 text-xs rounded-lg bg-surface text-fg border border-border"
                        >
                            {#each PAYMENT_STATUS_OPTIONS as option (option.value)}
                                <option value={option.value} selected={order.paymentStatus === option.value}>
                                    {option.label}
                                </option>
                            {/each}
                        </select>
                        <Button type="submit" variant="secondary" size="sm" icon="check-lg" ariaLabel="Status speichern" />
                    </form>
                {/if}
            {/snippet}
        </DataTable>
    </Card>
</div>
