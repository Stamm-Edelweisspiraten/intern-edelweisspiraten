<script lang="ts">
    import { Alert, Button, Card, DataTable, PageHeader, StatTile } from "$lib/components/ui";
    import type { Column } from "$lib/components/ui";
    import FinanceNav from "$lib/components/finance/FinanceNav.svelte";
    import PeriodFilter from "$lib/components/finance/PeriodFilter.svelte";
    import {
        AgingBarChart,
        MonthlyBarChart,
        SphereDonutChart,
        TopExpensesChart
    } from "$lib/components/finance/charts";
    import { SPHERE_LABELS } from "$lib/finance/labels";
    import { formatEuro } from "$lib/money";
    import { formatDate } from "$lib/format";
    import type { PageData } from "./$types";

    let { data }: { data: PageData } = $props();

    type Row = PageData["profit"]["income"][number];
    type Bucket = PageData["aging"]["buckets"][number];
    type TrialRow = PageData["trial"]["rows"][number];
    type MonthRow = PageData["monthly"]["months"][number];

    /** Für den Ring: die Bereiche mit ihren deutschen Beschriftungen. */
    const spheresForChart = $derived(
        data.profit.bySphere.map((entry) => ({
            sphere: entry.sphere,
            label: SPHERE_LABELS[entry.sphere] ?? entry.sphere,
            income: entry.income
        }))
    );

    const exportHref = $derived(
        `/intern/finance/reports/export.csv?from=${data.period.from}&to=${data.period.to}`
    );

    /**
     * Aktiva müssen Passiva plus Eigenkapital plus Ergebnis entsprechen.
     * Weicht das ab, stimmt etwas mit den Buchungen nicht — die Anzeige sagt
     * das lieber deutlich, als eine Zahl zu verstecken.
     */
    const balanceCheck = $derived(
        data.balance.assetsTotal -
            (data.balance.liabilitiesTotal + data.balance.equityTotal + data.balance.result)
    );
</script>

<svelte:head><title>Berichte – Kasse</title></svelte:head>

{#snippet amountCell(row: Row)}
    <span class="font-semibold tabular-figures">{formatEuro(row.amount)}</span>
{/snippet}

{#snippet trialCell(row: TrialRow)}
    <span class={`font-semibold tabular-figures ${row.closing < 0 ? "text-danger" : "text-fg"}`}>
        {formatEuro(row.closing)}
    </span>
{/snippet}

{#snippet bucketCell(bucket: Bucket)}
    <span
        class={`font-bold tabular-figures ${bucket.fromDays > 60 ? "text-danger" : bucket.fromDays > 0 ? "text-warning" : "text-fg"}`}
    >
        {formatEuro(bucket.amount)}
    </span>
{/snippet}

<div class="space-y-8">
    <PageHeader
        title="Berichte"
        eyebrow="Kasse"
        subtitle="Gewinn- und Verlustrechnung, Vermögensübersicht und Fälligkeitsstaffel."
        back={{ href: "/intern/finance" }}
    >
        {#snippet actions()}
            {#if data.canExport}
                <Button href={exportHref} variant="secondary" icon="download">Export (CSV)</Button>
            {/if}
        {/snippet}
    </PageHeader>

    <FinanceNav />

    <PeriodFilter from={data.period.from} to={data.period.to} />

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
            label="Erträge"
            value={formatEuro(data.profit.incomeTotal)}
            tone="success"
            icon="arrow-down-circle"
        />
        <StatTile
            label="Aufwendungen"
            value={formatEuro(data.profit.expenseTotal)}
            tone="danger"
            icon="arrow-up-circle"
        />
        <StatTile
            label="Ergebnis"
            value={formatEuro(data.profit.result)}
            tone={data.profit.result < 0 ? "danger" : "primary"}
            icon="graph-up"
        />
        <StatTile
            label="Offene Forderungen"
            value={formatEuro(data.aging.total)}
            tone="warning"
            icon="hourglass-split"
            hint={`${data.aging.count} Posten`}
            href="/intern/finance/outstanding"
        />
    </div>

    <!-- Gewinn- und Verlustrechnung -->
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card
            title="Erträge"
            meta={formatEuro(data.profit.incomeTotal)}
            subtitle={`${formatDate(data.profit.from)} – ${formatDate(data.profit.to)}`}
            padding="none"
        >
            <DataTable
                columns={[
                    { key: "number", label: "Konto", value: (r) => r.number },
                    { key: "name", label: "Bezeichnung", value: (r) => r.name },
                    { key: "amount", label: "Betrag", align: "right", cell: amountCell }
                ] satisfies Column<Row>[]}
                rows={data.profit.income}
                getKey={(r) => r.accountId}
                cardTitle={(r) => r.name}
                cardSubtitle={(r) => r.number}
                rowHref={(r) => `/intern/finance/accounts/${r.accountId}`}
                empty="Keine Erträge in diesem Zeitraum."
            />
        </Card>

        <Card
            title="Aufwendungen"
            meta={formatEuro(data.profit.expenseTotal)}
            subtitle={`${formatDate(data.profit.from)} – ${formatDate(data.profit.to)}`}
            padding="none"
        >
            <DataTable
                columns={[
                    { key: "number", label: "Konto", value: (r) => r.number },
                    { key: "name", label: "Bezeichnung", value: (r) => r.name },
                    { key: "amount", label: "Betrag", align: "right", cell: amountCell }
                ] satisfies Column<Row>[]}
                rows={data.profit.expense}
                getKey={(r) => r.accountId}
                cardTitle={(r) => r.name}
                cardSubtitle={(r) => r.number}
                rowHref={(r) => `/intern/finance/accounts/${r.accountId}`}
                empty="Keine Aufwendungen in diesem Zeitraum."
            />
        </Card>
    </div>

    <!-- Monatsübersicht: Tabelle und Diagramm nebeneinander -->
    <Card
        title={`Monatsübersicht ${data.monthly.year}`}
        subtitle="Erträge, Aufwendungen und Ergebnis je Monat."
        meta={formatEuro(data.monthly.result)}
    >
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
            <div class="min-w-0 overflow-x-auto">
                <table class="w-full text-sm">
                    <caption class="sr-only">
                        Erträge, Aufwendungen und Ergebnis je Monat des Jahres {data.monthly
                            .year}
                    </caption>
                    <thead>
                        <tr class="border-b border-border text-left">
                            <th scope="col" class="py-2 pr-3 font-semibold text-fg-muted">Monat</th>
                            <th scope="col" class="py-2 px-3 font-semibold text-fg-muted text-right">
                                Erträge
                            </th>
                            <th scope="col" class="py-2 px-3 font-semibold text-fg-muted text-right">
                                Aufwendungen
                            </th>
                            <th scope="col" class="py-2 pl-3 font-semibold text-fg-muted text-right">
                                Ergebnis
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each data.monthly.months as month (month.month)}
                            <tr class="border-b border-border last:border-b-0">
                                <th scope="row" class="py-1.5 pr-3 font-normal text-fg text-left">
                                    {month.label}
                                </th>
                                <td class="py-1.5 px-3 text-right tabular-figures text-fg">
                                    {month.income ? formatEuro(month.income) : "–"}
                                </td>
                                <td class="py-1.5 px-3 text-right tabular-figures text-fg">
                                    {month.expense ? formatEuro(month.expense) : "–"}
                                </td>
                                <td
                                    class={`py-1.5 pl-3 text-right tabular-figures font-semibold ${
                                        month.result < 0 ? "text-danger" : "text-fg"
                                    }`}
                                >
                                    {month.result ? formatEuro(month.result) : "–"}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                    <tfoot>
                        <tr class="border-t-2 border-border-strong font-semibold">
                            <th scope="row" class="py-2 pr-3 text-left text-fg">Jahressumme</th>
                            <td class="py-2 px-3 text-right tabular-figures">
                                {formatEuro(data.monthly.incomeTotal)}
                            </td>
                            <td class="py-2 px-3 text-right tabular-figures">
                                {formatEuro(data.monthly.expenseTotal)}
                            </td>
                            <td class="py-2 pl-3 text-right tabular-figures">
                                {formatEuro(data.monthly.result)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            <MonthlyBarChart months={data.monthly.months} title="" />
        </div>
    </Card>

    <!-- Größte Aufwandskonten -->
    {#if data.topExpenses.length > 0}
        <Card
            title="Größte Aufwandskonten"
            subtitle="Wo das Geld hingeht – die zehn größten Posten des Zeitraums."
        >
            <div class="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
                <div class="min-w-0">
                    <ul class="divide-y divide-border">
                        {#each data.topExpenses as row (row.accountId)}
                            <li class="py-2 flex justify-between gap-4 text-sm">
                                <a
                                    class="text-fg hover:underline min-w-0"
                                    href={`/intern/finance/accounts/${row.accountId}`}
                                >
                                    <span class="tabular-figures text-fg-subtle">{row.number}</span>
                                    {row.name}
                                </a>
                                <span class="font-semibold tabular-figures shrink-0">
                                    {formatEuro(row.amount)}
                                </span>
                            </li>
                        {/each}
                    </ul>
                </div>

                <TopExpensesChart rows={data.topExpenses} title="" />
            </div>
        </Card>
    {/if}

    {#if data.profit.bySphere.length > 0}
        <Card
            title="Ergebnis nach steuerlichen Bereichen"
            subtitle="Ideeller Bereich, Vermögensverwaltung, Zweckbetrieb und wirtschaftlicher Geschäftsbetrieb werden getrennt ausgewiesen."
        >
            <div class="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
                <div class="min-w-0">
                    <DataTable
                        columns={[
                            {
                                key: "sphere",
                                label: "Bereich",
                                value: (s) => SPHERE_LABELS[s.sphere]
                            },
                            {
                                key: "income",
                                label: "Erträge",
                                align: "right",
                                value: (s) => formatEuro(s.income)
                            },
                            {
                                key: "expense",
                                label: "Aufwendungen",
                                align: "right",
                                value: (s) => formatEuro(s.expense)
                            },
                            {
                                key: "result",
                                label: "Ergebnis",
                                align: "right",
                                value: (s) => formatEuro(s.result)
                            }
                        ] satisfies Column<PageData["profit"]["bySphere"][number]>[]}
                        rows={data.profit.bySphere}
                        getKey={(s) => s.sphere}
                        cardTitle={(s) => SPHERE_LABELS[s.sphere]}
                        empty="Keine Bewegungen."
                    />
                </div>

                <!--
                    Der Ring zeigt die Erträge, nicht das Ergebnis -- deshalb
                    behält er hier eine eigene Überschrift, obwohl die Karte
                    schon eine trägt.
                -->
                <SphereDonutChart spheres={spheresForChart} title="Erträge je Bereich" />
            </div>
        </Card>
    {/if}

    <!-- Vermögensübersicht -->
    <Card
        title="Vermögensübersicht"
        subtitle={`Stand ${formatDate(data.balance.at)}`}
        meta={balanceCheck === 0 ? "ausgeglichen" : `Differenz ${formatEuro(balanceCheck)}`}
        tone={balanceCheck === 0 ? "default" : "warning"}
    >
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
                <h3 class="text-sm font-semibold text-fg-muted uppercase tracking-wide mb-3">
                    Aktiva
                </h3>
                <ul class="divide-y divide-border">
                    {#each data.balance.assets as row (row.accountId)}
                        <li class="py-2 flex justify-between gap-4 text-sm">
                            <span class="text-fg">
                                <span class="tabular-figures text-fg-subtle">{row.number}</span>
                                {row.name}
                            </span>
                            <span class="font-semibold tabular-figures">
                                {formatEuro(row.amount)}
                            </span>
                        </li>
                    {:else}
                        <li class="py-2 text-sm text-fg-subtle">Keine Bestände.</li>
                    {/each}
                </ul>
                <p class="mt-3 pt-3 border-t-2 border-border-strong flex justify-between text-sm">
                    <span class="font-semibold text-fg">Summe Aktiva</span>
                    <span class="font-bold tabular-figures">
                        {formatEuro(data.balance.assetsTotal)}
                    </span>
                </p>
            </div>

            <div>
                <h3 class="text-sm font-semibold text-fg-muted uppercase tracking-wide mb-3">
                    Passiva und Eigenkapital
                </h3>
                <ul class="divide-y divide-border">
                    {#each [...data.balance.liabilities, ...data.balance.equity] as row (row.accountId)}
                        <li class="py-2 flex justify-between gap-4 text-sm">
                            <span class="text-fg">
                                <span class="tabular-figures text-fg-subtle">{row.number}</span>
                                {row.name}
                            </span>
                            <span class="font-semibold tabular-figures">
                                {formatEuro(row.amount)}
                            </span>
                        </li>
                    {:else}
                        <li class="py-2 text-sm text-fg-subtle">Keine Posten.</li>
                    {/each}
                    <li class="py-2 flex justify-between gap-4 text-sm">
                        <span class="text-fg">Ergebnis des Zeitraums</span>
                        <span class="font-semibold tabular-figures">
                            {formatEuro(data.balance.result)}
                        </span>
                    </li>
                </ul>
                <p class="mt-3 pt-3 border-t-2 border-border-strong flex justify-between text-sm">
                    <span class="font-semibold text-fg">Summe Passiva</span>
                    <span class="font-bold tabular-figures">
                        {formatEuro(
                            data.balance.liabilitiesTotal +
                                data.balance.equityTotal +
                                data.balance.result
                        )}
                    </span>
                </p>
            </div>
        </div>
    </Card>

    <!-- Summen- und Saldenliste -->
    <Card
        title="Summen- und Saldenliste"
        subtitle="Je Konto: Anfangsbestand, Bewegungen im Zeitraum und Schlusssaldo."
        meta={data.trial.balanced ? "Soll = Haben" : "Soll ≠ Haben"}
        tone={data.trial.balanced ? "default" : "warning"}
        padding="none"
    >
        {#if !data.trial.balanced}
            <div class="p-4">
                <Alert
                    tone="danger"
                    title="Soll und Haben stimmen nicht überein"
                    message={`Soll ${formatEuro(data.trial.debitTotal)}, Haben ${formatEuro(data.trial.creditTotal)}. Das darf nicht vorkommen – bitte die Buchungen des Zeitraums prüfen.`}
                />
            </div>
        {/if}

        <DataTable
            columns={[
                { key: "number", label: "Konto", value: (r) => r.number },
                { key: "name", label: "Bezeichnung", value: (r) => r.name },
                {
                    key: "opening",
                    label: "Anfangsbestand",
                    align: "right",
                    value: (r) => (r.opening ? formatEuro(r.opening) : "–")
                },
                {
                    key: "debit",
                    label: "Soll",
                    align: "right",
                    value: (r) => (r.debit ? formatEuro(r.debit) : "–")
                },
                {
                    key: "credit",
                    label: "Haben",
                    align: "right",
                    value: (r) => (r.credit ? formatEuro(r.credit) : "–")
                },
                { key: "closing", label: "Saldo", align: "right", cell: trialCell }
            ] satisfies Column<TrialRow>[]}
            rows={data.trial.rows}
            getKey={(r) => r.accountId}
            cardTitle={(r) => r.name}
            cardSubtitle={(r) => r.number}
            rowHref={(r) => `/intern/finance/accounts/${r.accountId}`}
            empty="Im Zeitraum wurde nichts gebucht."
        />

        <div class="px-4 py-3 border-t-2 border-border-strong flex justify-end gap-8 text-sm">
            <span class="text-fg-muted">
                Summe Soll
                <span class="font-bold tabular-figures text-fg ml-2">
                    {formatEuro(data.trial.debitTotal)}
                </span>
            </span>
            <span class="text-fg-muted">
                Summe Haben
                <span class="font-bold tabular-figures text-fg ml-2">
                    {formatEuro(data.trial.creditTotal)}
                </span>
            </span>
        </div>
    </Card>

    <!-- Fälligkeitsstaffel -->
    <Card
        title="Fälligkeitsstaffel"
        subtitle="Offene Forderungen nach Alter der Fälligkeit."
        meta={`Stand ${formatDate(data.aging.at)}`}
    >
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
            <div class="min-w-0">
                <DataTable
                    columns={[
                        { key: "label", label: "Zeitraum", value: (b) => b.label },
                        { key: "count", label: "Posten", align: "right", value: (b) => b.count },
                        { key: "amount", label: "Betrag", align: "right", cell: bucketCell }
                    ] satisfies Column<Bucket>[]}
                    rows={data.aging.buckets}
                    getKey={(b) => b.label}
                    cardTitle={(b) => b.label}
                    empty="Alle Forderungen sind ausgeglichen."
                />
            </div>

            <AgingBarChart buckets={data.aging.buckets} title="" />
        </div>
    </Card>
</div>
