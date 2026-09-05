<script lang="ts">
    import { Alert, Card, PageHeader, SearchInput, StatTile } from "$lib/components/ui";
    import OutstandingTable from "$lib/components/finance/OutstandingTable.svelte";
    import { formatEuro } from "$lib/money";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let search = $state("");

    const filtered = $derived(
        data.invoices.filter((invoice) => {
            const needle = search.trim().toLowerCase();
            if (!needle) return true;
            return `${invoice.member} ${invoice.kind} ${invoice.year}`.toLowerCase().includes(needle);
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

    <Card meta={`${filtered.length} von ${data.invoices.length}`} padding="none">
        <OutstandingTable
            invoices={filtered}
            canManage={data.canManage}
            showYear
            empty={search ? "Keine passenden offenen Posten." : "Alle Forderungen sind ausgeglichen."}
        />
    </Card>
</div>
