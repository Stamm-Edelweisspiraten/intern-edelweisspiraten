<script lang="ts">
    import { Badge, Card, DataTable, PageHeader, StatTile } from "$lib/components/ui";
    import type { Column } from "$lib/components/ui";
    import FinanceNav from "$lib/components/finance/FinanceNav.svelte";
    import PeriodFilter from "$lib/components/finance/PeriodFilter.svelte";
    import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPE_TONES, SPHERE_LABELS } from "$lib/finance/labels";
    import { formatEuro } from "$lib/money";
    import { formatDate } from "$lib/format";
    import type { PageData } from "./$types";

    let { data }: { data: PageData } = $props();

    type Entry = PageData["ledger"]["entries"][number];

    const account = $derived(data.ledger.account);
</script>

<svelte:head><title>Konto {account.number} – Kasse</title></svelte:head>

{#snippet debitCell(entry: Entry)}
    <span class="tabular-figures">{entry.debit > 0 ? formatEuro(entry.debit) : "–"}</span>
{/snippet}

{#snippet creditCell(entry: Entry)}
    <span class="tabular-figures">{entry.credit > 0 ? formatEuro(entry.credit) : "–"}</span>
{/snippet}

{#snippet balanceCell(entry: Entry)}
    <span class={`font-semibold tabular-figures ${entry.balance < 0 ? "text-danger" : "text-fg"}`}>
        {formatEuro(entry.balance)}
    </span>
{/snippet}

{#snippet entryCell(entry: Entry)}
    <a href={`/intern/finance/journal`} class="font-semibold tabular-figures hover:text-primary transition">
        {entry.entryNo}
    </a>
{/snippet}

<div class="space-y-8">
    <PageHeader
        title={`${account.number} ${account.name}`}
        eyebrow="Kontenblatt"
        subtitle={account.description || SPHERE_LABELS[account.sphere]}
        back={{ href: "/intern/finance/accounts" }}
    >
        {#snippet badge()}
            <Badge
                tone={ACCOUNT_TYPE_TONES[account.type]}
                label={ACCOUNT_TYPE_LABELS[account.type]}
            />
            {#if !account.active}
                <Badge tone="neutral" label="Inaktiv" />
            {/if}
        {/snippet}
    </PageHeader>

    <FinanceNav />

    <PeriodFilter from={data.period.from} to={data.period.to} />

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile
            label="Anfangsbestand"
            value={formatEuro(data.ledger.openingBalance)}
            tone="neutral"
            icon="hourglass-top"
        />
        <StatTile
            label="Bewegungen"
            value={data.ledger.entries.length}
            tone="primary"
            icon="list-ul"
        />
        <StatTile
            label="Endbestand"
            value={formatEuro(data.ledger.closingBalance)}
            tone={data.ledger.closingBalance < 0 ? "danger" : "success"}
            icon="hourglass-bottom"
        />
    </div>

    <Card title="Bewegungen" meta={`${formatDate(data.ledger.from)} – ${formatDate(data.ledger.to)}`} padding="none">
        <DataTable
            columns={[
                { key: "date", label: "Datum", value: (e) => formatDate(e.date) },
                { key: "entry", label: "Beleg", cell: entryCell },
                { key: "description", label: "Vorgang", value: (e) => e.description || "–" },
                { key: "counter", label: "Gegenkonto", value: (e) => e.counterAccount || "–" },
                { key: "debit", label: "Soll", align: "right", cell: debitCell },
                { key: "credit", label: "Haben", align: "right", cell: creditCell },
                { key: "balance", label: "Saldo", align: "right", cell: balanceCell }
            ] satisfies Column<Entry>[]}
            rows={data.ledger.entries}
            getKey={(e) => `${e.entryNo}-${e.date}`}
            cardTitle={(e) => e.entryNo}
            cardSubtitle={(e) => formatDate(e.date)}
            empty="In diesem Zeitraum wurde auf dieses Konto nicht gebucht."
        />
    </Card>
</div>
