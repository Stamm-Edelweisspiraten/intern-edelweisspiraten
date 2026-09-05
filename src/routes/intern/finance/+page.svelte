<script lang="ts">
    import {
        Alert,
        Badge,
        Button,
        Card,
        ConfirmDialog,
        DataTable,
        EmptyState,
        PageHeader,
        StatTile
    } from "$lib/components/ui";
    import type { Column } from "$lib/components/ui";
    import FinanceNav from "$lib/components/finance/FinanceNav.svelte";
    import { MonthlyBarChart } from "$lib/components/finance/charts";
    import { formatEuro } from "$lib/money";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type Year = PageData["fiscalYears"][number];

    const currentYear = new Date().getFullYear();

    const active = $derived(data.fiscalYears.filter((y) => y.status !== "archived"));
    const archived = $derived(data.fiscalYears.filter((y) => y.status === "archived"));

    const totals = $derived({
        income: active.reduce((sum, y) => sum + y.income, 0),
        expense: active.reduce((sum, y) => sum + y.expense, 0),
        balance: active.reduce((sum, y) => sum + y.balance, 0)
    });

    let archiveTarget = $state<Year | null>(null);
    let archiveOpen = $state(false);
    let archiveForm = $state<HTMLFormElement | null>(null);

    function askArchive(row: Year) {
        archiveTarget = row;
        archiveOpen = true;
    }

    const STATUS = {
        active: { tone: "success", label: "Aktiv" },
        closed: { tone: "info", label: "Abgeschlossen" },
        archived: { tone: "neutral", label: "Archiviert" }
    } as const;
</script>

<svelte:head><title>Kasse - Intern</title></svelte:head>

{#snippet yearCell(row: Year)}
    <div class="flex items-center gap-2 flex-wrap">
        <a href={`/intern/finance/fiscal-years/${row.id}`} class="font-semibold hover:text-primary transition">
            {row.year}
        </a>
        {#if row.year === currentYear}
            <Badge tone="primary" size="xs" label="Aktuelles Jahr" />
        {/if}
    </div>
{/snippet}

{#snippet statusCell(row: Year)}
    <Badge tone={STATUS[row.status].tone} size="xs" label={STATUS[row.status].label} />
{/snippet}

{#snippet outstandingCell(row: Year)}
    {#if row.outstanding > 0}
        <a
            href={`/intern/finance/fiscal-years/${row.id}/outstanding`}
            class="font-bold text-warning hover:underline"
        >
            {formatEuro(row.outstanding)}
        </a>
        <span class="block text-xs text-fg-subtle">{row.outstandingCount} Posten</span>
    {:else}
        <span class="text-fg-subtle">–</span>
    {/if}
{/snippet}

{#snippet balanceCell(row: Year)}
    <span class={`font-bold ${row.balance < 0 ? "text-danger" : "text-fg"}`}>
        {formatEuro(row.balance)}
    </span>
{/snippet}

<div class="space-y-8">
    <PageHeader
        title="Kasse"
        eyebrow="Finanzen"
        subtitle="Geschäftsjahre, Buchungen und offene Posten."
    >
        {#snippet actions()}
            <Button href="/intern/finance/journal" variant="secondary" icon="journal-text">
                Journal
            </Button>
            {#if data.canManage}
                <Button href="/intern/finance/fiscal-years/create" variant="primary" icon="plus-circle">
                    Neues Geschäftsjahr
                </Button>
            {/if}
        {/snippet}
    </PageHeader>

    <FinanceNav />

    {#if form?.error}
        <Alert tone="danger" message={form.error} />
    {/if}

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Einnahmen" value={formatEuro(totals.income)} tone="success" icon="arrow-down-circle" />
        <StatTile label="Ausgaben" value={formatEuro(totals.expense)} tone="danger" icon="arrow-up-circle" />
        <StatTile
            label="Saldo"
            value={formatEuro(totals.balance)}
            tone={totals.balance < 0 ? "danger" : "primary"}
            icon="wallet2"
        />
        <StatTile
            label="Offene Posten"
            value={formatEuro(data.outstandingTotal)}
            tone="warning"
            icon="hourglass-split"
            hint={data.overdueCount > 0 ? `${data.overdueCount} davon überfällig` : `${data.outstandingCount} Posten`}
            href="/intern/finance/outstanding"
        />
    </div>

    <!--
        Diagramm UND Zahlen: die Jahressummen stehen als Text darunter, damit
        die Karte ohne JavaScript und mit einem Screenreader vollständig
        lesbar bleibt.
    -->
    <Card
        title={`Verlauf ${data.monthly.year}`}
        subtitle="Erträge und Aufwendungen je Monat."
        meta={formatEuro(data.monthly.result)}
    >
        <MonthlyBarChart months={data.monthly.months} title="" />

        <dl class="grid grid-cols-3 gap-4 mt-4 text-sm">
            <div>
                <dt class="text-fg-subtle">Erträge</dt>
                <dd class="font-semibold tabular-figures text-success">
                    {formatEuro(data.monthly.incomeTotal)}
                </dd>
            </div>
            <div>
                <dt class="text-fg-subtle">Aufwendungen</dt>
                <dd class="font-semibold tabular-figures text-danger">
                    {formatEuro(data.monthly.expenseTotal)}
                </dd>
            </div>
            <div>
                <dt class="text-fg-subtle">Ergebnis</dt>
                <dd class="font-semibold tabular-figures text-fg">
                    {formatEuro(data.monthly.result)}
                </dd>
            </div>
        </dl>

        <p class="text-xs text-fg-subtle mt-3">
            Die Monatswerte im Einzelnen stehen unter
            <a class="underline" href="/intern/finance/reports">Berichte</a>.
        </p>
    </Card>

    {#if data.bankAccounts.length > 0}
        <Card title="Kassen- und Bankkonten" padding="none">
            <DataTable
                columns={[
                    { key: "name", label: "Konto", value: (b) => b.name },
                    {
                        key: "balance",
                        label: "Kontostand",
                        align: "right",
                        value: (b) => formatEuro(b.balance)
                    }
                ] satisfies Column<PageData["bankAccounts"][number]>[]}
                rows={data.bankAccounts}
                getKey={(b) => b.id}
                cardTitle={(b) => b.name}
                rowHref={(b) => `/intern/finance/bank-accounts/${b.id}`}
                empty="Noch kein Konto eingerichtet."
            />
        </Card>
    {/if}

    <Card title="Geschäftsjahre" meta={`${active.length} aktiv`} padding="none">
        {#if active.length === 0}
            <EmptyState
                icon="calendar-plus"
                title="Noch kein Geschäftsjahr angelegt"
                description="Lege ein Geschäftsjahr an, um Beiträge und Buchungen zu erfassen."
            >
                {#snippet action()}
                    <Button href="/intern/finance/fiscal-years/create" variant="primary" icon="plus-circle">
                        Neues Geschäftsjahr
                    </Button>
                {/snippet}
            </EmptyState>
        {:else}
            <DataTable
                columns={[
                    { key: "year", label: "Jahr", cell: yearCell },
                    { key: "status", label: "Status", cell: statusCell },
                    { key: "income", label: "Einnahmen", align: "right", value: (r) => formatEuro(r.income) },
                    { key: "expense", label: "Ausgaben", align: "right", value: (r) => formatEuro(r.expense) },
                    { key: "balance", label: "Saldo", align: "right", cell: balanceCell },
                    { key: "outstanding", label: "Offen", align: "right", cell: outstandingCell },
                    { key: "count", label: "Buchungen", align: "right", value: (r) => r.transactionCount }
                ] satisfies Column<Year>[]}
                rows={active}
                getKey={(r) => r.id}
                cardTitle={(r) => String(r.year)}
                cardSubtitle={(r) => STATUS[r.status].label}
                rowHref={(r) => `/intern/finance/fiscal-years/${r.id}`}
            >
                {#snippet actions(row)}
                    <Button
                        href={`/intern/finance/fiscal-years/${row.id}`}
                        variant="secondary"
                        size="sm"
                        icon="eye">Details</Button
                    >
                    {#if data.canManage}
                        <Button variant="ghost" size="sm" icon="archive" onclick={() => askArchive(row)}>
                            Archivieren
                        </Button>
                    {/if}
                {/snippet}
            </DataTable>
        {/if}
    </Card>

    {#if archived.length > 0}
        <Card title="Archiv" meta={`${archived.length} Einträge`} padding="none">
            <DataTable
                columns={[
                    { key: "year", label: "Jahr", value: (r) => r.year },
                    { key: "income", label: "Einnahmen", align: "right", value: (r) => formatEuro(r.income) },
                    { key: "expense", label: "Ausgaben", align: "right", value: (r) => formatEuro(r.expense) },
                    { key: "balance", label: "Saldo", align: "right", value: (r) => formatEuro(r.balance) }
                ] satisfies Column<Year>[]}
                rows={archived}
                getKey={(r) => r.id}
                cardTitle={(r) => String(r.year)}
                rowHref={(r) => `/intern/finance/fiscal-years/${r.id}`}
                rowClass={() => "opacity-70"}
            />
        </Card>
    {/if}
</div>

<form method="post" action="?/archive" bind:this={archiveForm} class="hidden">
    <input type="hidden" name="id" value={archiveTarget?.id ?? ""} />
</form>

<ConfirmDialog
    bind:open={archiveOpen}
    title="Geschäftsjahr archivieren?"
    message={`Das Geschäftsjahr ${archiveTarget?.year ?? ""} wird archiviert. Es sind danach keine Buchungen mehr möglich.`}
    confirmLabel="Archivieren"
    tone="danger"
    onconfirm={() => archiveForm?.requestSubmit()}
    oncancel={() => (archiveTarget = null)}
/>
