<script lang="ts">
    import { Alert, Card, PageHeader, SearchInput, StatTile } from "$lib/components/ui";
    import OutstandingTable from "$lib/components/finance/OutstandingTable.svelte";
    import { AgingBarChart } from "$lib/components/finance/charts";
    import { formatEuro } from "$lib/money";
    import { formatDate } from "$lib/format";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let search = $state("");

    const filtered = $derived(
        data.invoices.filter((invoice) => {
            const needle = search.trim().toLowerCase();
            if (!needle) return true;
            return `${invoice.member} ${invoice.kind} ${invoice.number} ${invoice.year}`
                .toLowerCase()
                .includes(needle);
        })
    );
</script>

<svelte:head><title>Offene Posten - Kasse</title></svelte:head>

<div class="space-y-8">
    <PageHeader
        title="Offene Posten"
        eyebrow="Kasse"
        subtitle="Offene Forderungen aus allen aktiven Geschäftsjahren."
        back={{ href: "/intern/finance" }}
    >
        {#snippet actions()}
            <SearchInput bind:value={search} placeholder="Mitglied oder Art..." label="Offene Posten durchsuchen" />
        {/snippet}
    </PageHeader>

    {#if form?.error}<Alert tone="danger" message={form.error} />{/if}
    {#if form?.success}<Alert tone="success" message={form.success} />{/if}

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile label="Offen gesamt" value={formatEuro(data.total)} tone="warning" icon="hourglass-split" />
        <StatTile label="Davon überfällig" value={formatEuro(data.overdueTotal)} tone="danger" icon="exclamation-triangle" />
        <StatTile label="Anzahl Posten" value={data.invoices.length} tone="neutral" icon="list-ul" />
    </div>

    <!--
        Die Staffel als Tabelle UND als Diagramm: die Tabelle traegt die
        genauen Betraege, das Diagramm zeigt auf einen Blick, wie alt die
        Rueckstaende sind.
    -->
    {#if data.invoices.length > 0}
        <Card
            title="Fälligkeitsstaffel"
            subtitle="Offene Forderungen nach Alter der Fälligkeit."
            meta={`Stand ${formatDate(data.aging.at)}`}
        >
            <div class="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
                <div class="min-w-0 overflow-x-auto">
                    <table class="w-full text-sm">
                        <caption class="sr-only">Offene Forderungen nach Alter der Fälligkeit</caption>
                        <thead>
                            <tr class="border-b border-border text-left">
                                <th scope="col" class="py-2 pr-3 font-semibold text-fg-muted">
                                    Zeitraum
                                </th>
                                <th scope="col" class="py-2 px-3 font-semibold text-fg-muted text-right">
                                    Posten
                                </th>
                                <th scope="col" class="py-2 pl-3 font-semibold text-fg-muted text-right">
                                    Betrag
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each data.aging.buckets as bucket (bucket.label)}
                                <tr class="border-b border-border last:border-b-0">
                                    <th scope="row" class="py-1.5 pr-3 font-normal text-fg text-left">
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

                <AgingBarChart buckets={data.aging.buckets} title="" />
            </div>
        </Card>
    {/if}

    <Card meta={`${filtered.length} von ${data.invoices.length}`} padding="none">
        <OutstandingTable
            invoices={filtered}
            canManage={data.canManage}
            bankAccounts={data.bankAccounts}
            payments={data.payments}
            showYear
            empty={search ? "Keine passenden offenen Posten." : "Alle Forderungen sind ausgeglichen."}
        />
    </Card>
</div>
