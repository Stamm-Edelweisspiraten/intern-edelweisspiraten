<script lang="ts">
    import { Badge, Button, Card, DataTable, EmptyState, PageHeader, StatTile } from "$lib/components/ui";
    import type { Column } from "$lib/components/ui";
    import { AgingBarChart } from "$lib/components/finance/charts";
    import { formatDate } from "$lib/format";
    import { eventColorVars } from "$lib/events/colors";
    import { formatEuro } from "$lib/money";
    import {
        orderStatusLabel,
        orderStatusTone,
        paymentStatusLabel,
        paymentStatusTone
    } from "$lib/kaemmerer/orderStatus";
    import type { PageData } from "./$types";

    let { data }: { data: PageData } = $props();

    type Invoice = PageData["invoices"][number];
    type Order = PageData["orders"][number];

    /**
     * Statt der frueheren "Coming Soon"-Flaeche zeigt das Dashboard jetzt die
     * Daten, die den angemeldeten Benutzer wirklich betreffen: eigene offene
     * Posten, eigene offene Bestellungen und die naechsten Geburtstage.
     */
    const invoiceColumns: Column<Invoice>[] = [
        { key: "member", label: "Mitglied", value: (i) => i.member },
        { key: "kind", label: "Art", value: (i) => i.kind },
        { key: "dueDate", label: "Fällig", cell: dueCell },
        { key: "outstanding", label: "Offen", align: "right", value: (i) => formatEuro(i.outstanding) }
    ];

    const orderColumns: Column<Order>[] = [
        { key: "number", label: "Nummer", value: (o) => o.number },
        { key: "createdAt", label: "Bestellt am", value: (o) => formatDate(o.createdAt) },
        { key: "status", label: "Status", cell: orderStatusCell },
        { key: "total", label: "Summe", align: "right", value: (o) => formatEuro(o.total) }
    ];
</script>

{#snippet dueCell(invoice: Invoice)}
    {#if invoice.dueDate}
        <span class={invoice.overdue ? "font-semibold text-danger" : "text-fg"}>
            {formatDate(invoice.dueDate)}
        </span>
        {#if invoice.overdue}
            <span class="block text-xs text-danger">überfällig</span>
        {/if}
    {:else}
        <span class="text-fg-subtle">–</span>
    {/if}
{/snippet}

{#snippet orderStatusCell(order: Order)}
    <div class="flex flex-wrap gap-1.5">
        <Badge tone={orderStatusTone(order.status)} size="xs" label={orderStatusLabel(order.status)} />
        <Badge
            tone={paymentStatusTone(order.paymentStatus)}
            size="xs"
            label={paymentStatusLabel(order.paymentStatus)}
        />
    </div>
{/snippet}

<svelte:head><title>Dashboard - Intern</title></svelte:head>

<div class="space-y-8">
    <PageHeader
        title={`Willkommen, ${data.userName}!`}
        eyebrow="Übersicht"
        subtitle="Deine offenen Posten, Bestellungen und die nächsten Geburtstage."
    />

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
            label="Offene Posten"
            value={formatEuro(data.outstandingTotal)}
            tone={data.outstandingTotal > 0 ? "warning" : "success"}
            icon="hourglass-split"
            hint={`${data.outstandingCount} Rechnung${data.outstandingCount === 1 ? "" : "en"}`}
        />
        <StatTile
            label="Überfällig"
            value={data.overdueCount}
            tone={data.overdueCount > 0 ? "danger" : "neutral"}
            icon="exclamation-circle"
            hint={data.overdueCount > 0 ? "Bitte zeitnah begleichen" : "Alles im Zeitplan"}
        />
        <StatTile
            label="Offene Bestellungen"
            value={data.openOrderCount}
            tone={data.openOrderCount > 0 ? "primary" : "neutral"}
            icon="bag"
            href="/intern/kaemmerer/order"
        />
        <StatTile
            label="Nächster Geburtstag"
            value={data.birthdays[0] ? `in ${data.birthdays[0].inDays} Tagen` : "–"}
            tone="primary"
            icon="gift"
            hint={data.birthdays[0]?.firstname ?? "Kein Eintrag"}
        />
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div class="lg:col-span-2 space-y-6">
            <Card title="Meine offenen Posten" meta={`${data.outstandingCount} offen`} padding="none">
                {#if !data.hasLinkedMembers}
                    <EmptyState
                        icon="person-badge"
                        title="Kein Mitglied verknüpft"
                        description="Deinem Zugang ist noch kein Mitglied zugeordnet. Wende dich an einen Administrator, damit hier deine Beiträge erscheinen."
                    />
                {:else}
                    <DataTable
                        columns={invoiceColumns}
                        rows={data.invoices}
                        getKey={(i) => i.id}
                        cardTitle={(i) => i.member}
                        cardSubtitle={(i) => i.kind}
                        empty="Aktuell sind keine Posten offen."
                        caption="Offene Rechnungen der verknüpften Mitglieder"
                    />
                    {#if data.outstandingCount > data.invoices.length}
                        <p class="px-6 py-3 text-xs text-fg-subtle border-t border-border">
                            {data.outstandingCount - data.invoices.length} weitere offene Posten.
                        </p>
                    {/if}
                {/if}
            </Card>

            <!--
                Nur fuer die Kasse: `data.aging` kommt vom Server ausschliesslich
                mit dem Recht `finance.view`. Die Staffel zeigt die Forderungen
                des ganzen Stammes, nicht die eigenen -- deshalb steht sie in
                einer eigenen Karte und nicht in der Tabelle darueber.

                Diagramm neben seiner Tabelle: die Betraege stehen links
                vollstaendig, das Diagramm ist die Zugabe.
            -->
            {#if data.aging && data.aging.count > 0}
                <Card
                    title="Fälligkeitsstaffel des Stammes"
                    subtitle="Alle offenen Forderungen der Kasse nach Alter der Fälligkeit."
                    meta={`Stand ${formatDate(data.aging.at)}`}
                >
                    {#snippet actions()}
                        <Button
                            href="/intern/finance/outstanding"
                            variant="ghost"
                            size="sm"
                            iconRight="arrow-right"
                        >
                            Offene Posten
                        </Button>
                    {/snippet}

                    <div class="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
                        <div class="min-w-0 overflow-x-auto">
                            <table class="w-full text-sm">
                                <caption class="sr-only">
                                    Offene Forderungen des Stammes nach Alter der Fälligkeit
                                </caption>
                                <thead>
                                    <tr class="border-b border-border text-left">
                                        <th scope="col" class="py-2 pr-3 font-semibold text-fg-muted">
                                            Zeitraum
                                        </th>
                                        <th
                                            scope="col"
                                            class="py-2 px-3 font-semibold text-fg-muted text-right"
                                        >
                                            Posten
                                        </th>
                                        <th
                                            scope="col"
                                            class="py-2 pl-3 font-semibold text-fg-muted text-right"
                                        >
                                            Betrag
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {#each data.aging.buckets as bucket (bucket.label)}
                                        <tr class="border-b border-border last:border-b-0">
                                            <th
                                                scope="row"
                                                class="py-1.5 pr-3 font-normal text-fg text-left"
                                            >
                                                {bucket.label}
                                            </th>
                                            <td class="py-1.5 px-3 text-right tabular-figures text-fg-muted">
                                                {bucket.count}
                                            </td>
                                            <td
                                                class={`py-1.5 pl-3 text-right tabular-figures font-semibold ${
                                                    bucket.fromDays > 60
                                                        ? "text-danger"
                                                        : bucket.fromDays > 0
                                                          ? "text-warning"
                                                          : "text-fg"
                                                }`}
                                            >
                                                {formatEuro(bucket.amount)}
                                            </td>
                                        </tr>
                                    {/each}
                                </tbody>
                                <tfoot>
                                    <tr class="border-t-2 border-border-strong font-semibold">
                                        <th scope="row" class="py-2 pr-3 text-left text-fg">Gesamt</th>
                                        <td class="py-2 px-3 text-right tabular-figures">
                                            {data.aging.count}
                                        </td>
                                        <td class="py-2 pl-3 text-right tabular-figures">
                                            {formatEuro(data.aging.total)}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        <AgingBarChart buckets={data.aging.buckets} title="" size="sm" />
                    </div>
                </Card>
            {/if}

            <Card title="Meine offenen Bestellungen" meta={`${data.openOrderCount} offen`} padding="none">
                {#snippet actions()}
                    <Button href="/intern/kaemmerer/order" variant="secondary" size="sm" icon="bag">
                        Alle Bestellungen
                    </Button>
                {/snippet}

                <DataTable
                    columns={orderColumns}
                    rows={data.orders}
                    getKey={(o) => o.id}
                    cardTitle={(o) => o.number}
                    cardSubtitle={(o) => `${o.itemCount} Position${o.itemCount === 1 ? "" : "en"}`}
                    rowHref={(o) => `/intern/kaemmerer/order/${o.id}`}
                    empty="Keine offenen Bestellungen."
                    caption="Offene Bestellungen der verknüpften Mitglieder"
                >
                    {#snippet actions(order)}
                        <Button
                            href={`/intern/kaemmerer/order/${order.id}`}
                            variant="secondary"
                            size="sm"
                            icon="eye"
                        >
                            Details
                        </Button>
                    {/snippet}
                </DataTable>
            </Card>
        </div>

        <div class="space-y-6">
            {#if data.surveys.length > 0}
                <!--
                    Nur laufende Umfragen. Die Kachel verschwindet, wenn keine
                    offen ist -- eine dauerhaft leere Karte auf der Startseite
                    ist schlechter als gar keine.
                -->
                <Card title="Offene Umfragen" subtitle="Warten auf deine Antwort.">
                    {#snippet actions()}
                        <Button
                            href="/intern/umfragen"
                            variant="ghost"
                            size="sm"
                            iconRight="arrow-right"
                        >
                            Alle
                        </Button>
                    {/snippet}

                    <ul class="space-y-2">
                        {#each data.surveys as survey (survey.id)}
                            <li>
                                <a
                                    href={`/intern/umfragen/${survey.id}`}
                                    class="block rounded-card border border-border p-3
                                           hover:bg-surface-muted transition"
                                >
                                    <span class="block text-sm font-semibold text-fg">
                                        {survey.title}
                                    </span>
                                    <span class="block text-xs text-fg-subtle mt-1">
                                        {#if survey.closesAt}
                                            Noch bis {formatDate(survey.closesAt)}
                                        {:else}
                                            Ohne Frist
                                        {/if}
                                        ·
                                        {survey.responseCount === 1
                                            ? "1 Antwort"
                                            : `${survey.responseCount} Antworten`}
                                    </span>
                                </a>
                            </li>
                        {/each}
                    </ul>
                </Card>
            {/if}

            <Card title="Nächste Termine" subtitle="Was ansteht – und wo noch eine Rückmeldung fehlt.">
                {#snippet actions()}
                    <Button href="/intern/termine" variant="ghost" size="sm" iconRight="arrow-right">
                        Alle
                    </Button>
                {/snippet}

                {#if data.events.length === 0}
                    <EmptyState inline title="Keine kommenden Termine." />
                {:else}
                    <ul class="space-y-2">
                        {#each data.events as item (item.id)}
                            <li>
                                <a
                                    href={`/intern/termine/${item.id}`}
                                    class="block rounded-card border border-border border-l-4 p-3
                                           hover:bg-surface-muted transition"
                                    style={`${eventColorVars(item.color)} border-left-color: var(--ev)`}
                                >
                                    <div class="flex items-start justify-between gap-2 flex-wrap">
                                        <span
                                            class={`text-sm font-semibold ${item.cancelled ? "text-fg-muted line-through" : "text-fg"}`}
                                        >
                                            {item.title}
                                        </span>
                                        {#if item.openResponses > 0 && !item.cancelled}
                                            <Badge
                                                tone="warning"
                                                size="xs"
                                                icon="question-circle"
                                                label={item.openResponses === 1
                                                    ? "Rückmeldung offen"
                                                    : `${item.openResponses} Rückmeldungen offen`}
                                            />
                                        {/if}
                                    </div>
                                    <p class="text-xs text-fg-subtle mt-1">
                                        {new Date(item.startsAt).toLocaleString("de-DE", {
                                            weekday: "short",
                                            day: "2-digit",
                                            month: "2-digit",
                                            ...(item.allDay
                                                ? {}
                                                : { hour: "2-digit", minute: "2-digit" })
                                        })}{item.allDay ? ", ganztägig" : " Uhr"}
                                        {#if item.location}
                                            · {item.location}
                                        {/if}
                                    </p>
                                </a>
                            </li>
                        {/each}
                    </ul>
                {/if}
            </Card>

            <Card title="Nächste Geburtstage" subtitle="Die drei nächsten Termine.">
            {#if data.birthdays.length === 0}
                <EmptyState inline title="Keine Geburtstage gefunden." />
            {:else}
                <ul class="space-y-3">
                    {#each data.birthdays as birthday (birthday.id)}
                        <li class="rounded-xl border border-border bg-surface-muted p-4">
                            <div class="flex items-center justify-between gap-2 flex-wrap">
                                <Badge
                                    tone={birthday.inDays === 0 ? "success" : "neutral"}
                                    size="xs"
                                    icon="gift"
                                    label={birthday.inDays === 0
                                        ? "Heute"
                                        : `in ${birthday.inDays} Tag${birthday.inDays === 1 ? "" : "en"}`}
                                />
                                <span class="text-xs font-semibold text-fg-muted">{birthday.dateLabel}</span>
                            </div>
                            <p class="mt-2 text-lg font-semibold text-fg">{birthday.firstname || "–"}</p>
                            <p class="text-sm text-fg-muted">{birthday.group}</p>
                            <p class="text-sm text-fg-subtle">wird {birthday.age} Jahre alt.</p>
                        </li>
                    {/each}
                </ul>
            {/if}
            </Card>
        </div>
    </div>
</div>
