<script lang="ts">
    import {
        Alert,
        Badge,
        Button,
        Card,
        DataTable,
        FormField,
        Modal,
        PageHeader,
        Pagination,
        Select,
        TextInput
    } from "$lib/components/ui";
    import type { Column } from "$lib/components/ui";
    import FinanceNav from "$lib/components/finance/FinanceNav.svelte";
    import { formatEuro } from "$lib/money";
    import { formatDate, toDateInputValue } from "$lib/format";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type Entry = PageData["entries"][number];

    let addOpen = $state(false);
    let direction = $state<"in" | "out">("in");
    let reverseTarget = $state<Entry | null>(null);
    let reverseOpen = $state(false);

    const readOnly = $derived(data.selectedYear?.status !== "active");

    const yearOptions = $derived(
        data.years.map((year) => ({
            value: year.id,
            label: `${year.year}${year.status === "active" ? "" : " (abgeschlossen)"}`
        }))
    );

    const categoryOptions = $derived(
        data.categories
            .filter((category) => category.direction === direction)
            .map((category) => ({
                value: category.id,
                label: `${category.name} · ${category.accountNumber}`
            }))
    );

    const bankOptions = $derived(data.bankAccounts.map((b) => ({ value: b.id, label: b.name })));
    const memberOptions = $derived(data.members.map((m) => ({ value: m.id, label: m.name })));

    const SOURCE_LABELS: Record<string, string> = {
        manual: "Erfasst",
        invoice: "Forderung",
        payment: "Zahlung",
        order: "Bestellung",
        recurring: "Wiederkehrend",
        import: "Kontoauszug",
        opening: "Eröffnung",
        closing: "Abschluss"
    };

    function askReverse(entry: Entry) {
        reverseTarget = entry;
        reverseOpen = true;
    }
</script>

<svelte:head><title>Journal – Kasse</title></svelte:head>

{#snippet entryCell(entry: Entry)}
    <div class="min-w-0">
        <a
            href={`/intern/finance/journal/${entry.id}`}
            class="font-semibold hover:text-primary transition">{entry.entryNo}</a
        >
        {#if entry.reversedById}
            <Badge tone="neutral" size="xs" label="storniert" />
        {:else if entry.reversesId}
            <Badge tone="warning" size="xs" label="Storno" />
        {/if}
    </div>
{/snippet}

{#snippet accountsCell(entry: Entry)}
    <ul class="text-xs text-fg-muted space-y-0.5">
        {#each entry.lines as line (line.id)}
            <li>
                <span class="tabular-figures">{line.accountNumber}</span>
                {line.accountName}
                <span class="text-fg-subtle">
                    {line.debit > 0 ? "Soll" : "Haben"}
                </span>
            </li>
        {/each}
    </ul>
{/snippet}

{#snippet totalCell(entry: Entry)}
    <span class="font-bold tabular-figures">{formatEuro(entry.total)}</span>
{/snippet}

<div class="space-y-8">
    <PageHeader
        title="Journal"
        eyebrow="Kasse"
        subtitle="Alle Buchungssätze eines Geschäftsjahres."
        back={{ href: "/intern/finance" }}
    >
        {#snippet actions()}
            {#if data.canManage && !readOnly && data.selectedYear}
                <Button
                    href={`/intern/finance/journal/create?year=${data.selectedYear.id}`}
                    variant="secondary"
                    icon="pencil-square">Freier Buchungssatz</Button
                >
                <Button variant="primary" icon="plus-circle" onclick={() => (addOpen = true)}>
                    Buchung
                </Button>
            {/if}
        {/snippet}
    </PageHeader>

    <FinanceNav />

    {#if form?.error}<Alert tone="danger" message={form.error} />{/if}
    {#if form?.success}<Alert tone="success" message={form.success} />{/if}

    {#if !data.selectedYear}
        <Alert
            tone="info"
            message="Es ist noch kein Geschäftsjahr angelegt. Ohne Geschäftsjahr kann nicht gebucht werden."
        />
    {:else if readOnly}
        <Alert
            tone="info"
            message="Dieses Geschäftsjahr ist abgeschlossen. Buchungen sind nicht mehr möglich."
        />
    {/if}

    <Card title="Filter">
        <form method="get" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <FormField label="Geschäftsjahr">
                {#snippet children({ id })}
                    <Select
                        {id}
                        name="year"
                        options={yearOptions}
                        value={data.selectedYear?.id ?? ""}
                    />
                {/snippet}
            </FormField>

            <FormField label="Herkunft">
                {#snippet children({ id })}
                    <Select
                        {id}
                        name="source"
                        placeholder="Alle"
                        value={data.filters.source}
                        options={Object.entries(SOURCE_LABELS).map(([value, label]) => ({
                            value,
                            label
                        }))}
                    />
                {/snippet}
            </FormField>

            <div class="sm:col-span-2 lg:col-span-2 flex gap-3">
                <Button type="submit" variant="secondary" icon="funnel">Filtern</Button>
                <Button href="/intern/finance/journal" variant="ghost" icon="x-lg">
                    Zurücksetzen
                </Button>
            </div>
        </form>
    </Card>

    <Card title="Buchungssätze" meta={`${data.total} gesamt`} padding="none">
        <DataTable
            columns={[
                { key: "date", label: "Datum", value: (e) => formatDate(e.date) },
                { key: "no", label: "Beleg", cell: entryCell },
                { key: "description", label: "Vorgang", value: (e) => e.description || "–" },
                { key: "accounts", label: "Konten", cell: accountsCell, hideOnCard: true },
                {
                    key: "source",
                    label: "Herkunft",
                    value: (e) => SOURCE_LABELS[e.source] ?? e.source
                },
                { key: "total", label: "Betrag", align: "right", cell: totalCell }
            ] satisfies Column<Entry>[]}
            rows={data.entries}
            getKey={(e) => e.id}
            cardTitle={(e) => e.entryNo}
            cardSubtitle={(e) => formatDate(e.date)}
            empty="Noch keine Buchungssätze in diesem Geschäftsjahr."
        >
            {#snippet actions(entry)}
                <Button
                    href={`/intern/finance/journal/${entry.id}`}
                    variant="secondary"
                    size="sm"
                    icon="eye"
                    ariaLabel="Beleg ansehen"
                />
                {#if data.canManage && !readOnly && !entry.reversedById && !entry.reversesId}
                    <Button
                        variant="ghost"
                        size="sm"
                        icon="arrow-counterclockwise"
                        ariaLabel="Buchung stornieren"
                        onclick={() => askReverse(entry)}
                    />
                {/if}
            {/snippet}
        </DataTable>

        <div class="p-4">
            <Pagination total={data.total} pageSize={data.pageSize} current={data.page} />
        </div>
    </Card>
</div>

<!-- Einfache Erfassung: Soll und Haben entstehen im Hintergrund. -->
<Modal
    bind:open={addOpen}
    title="Buchung erfassen"
    description="Soll und Haben werden aus Richtung und Buchungsart abgeleitet."
>
    <form method="post" action="?/add" id="tx-add" class="space-y-4">
        <input type="hidden" name="fiscalYearId" value={data.selectedYear?.id ?? ""} />

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Datum" required>
                {#snippet children({ id })}
                    <TextInput
                        {id}
                        name="date"
                        type="date"
                        value={toDateInputValue(new Date())}
                        required
                    />
                {/snippet}
            </FormField>
            <FormField label="Betrag" required>
                {#snippet children({ id })}
                    <TextInput {id} name="amount" inputmode="decimal" placeholder="12,50" required />
                {/snippet}
            </FormField>
        </div>

        <FormField label="Richtung">
            {#snippet children({ id })}
                <Select
                    {id}
                    bind:value={direction}
                    options={[
                        { value: "in", label: "Einnahme" },
                        { value: "out", label: "Ausgabe" }
                    ]}
                />
            {/snippet}
        </FormField>

        <FormField label="Buchungsart" required hint="Bestimmt das Gegenkonto.">
            {#snippet children({ id })}
                <Select {id} name="categoryId" options={categoryOptions} required />
            {/snippet}
        </FormField>

        <FormField label="Konto" required hint="Kassen- oder Bankkonto der Bewegung.">
            {#snippet children({ id })}
                <Select {id} name="bankAccountId" options={bankOptions} required />
            {/snippet}
        </FormField>

        <FormField label="Mitglied" hint="Optional, für mitgliedsbezogene Buchungen.">
            {#snippet children({ id })}
                <Select
                    {id}
                    name="memberId"
                    options={memberOptions}
                    placeholder="– kein Mitglied –"
                />
            {/snippet}
        </FormField>

        <FormField label="Notiz">
            {#snippet children({ id })}
                <TextInput {id} name="note" placeholder="Kurze Beschreibung" />
            {/snippet}
        </FormField>
    </form>

    {#snippet footer()}
        <Button variant="secondary" onclick={() => (addOpen = false)}>Abbrechen</Button>
        <Button
            variant="primary"
            icon="check-lg"
            onclick={() => document.forms.namedItem("tx-add")?.requestSubmit()}
        >
            Buchen
        </Button>
    {/snippet}
</Modal>

<Modal
    bind:open={reverseOpen}
    title="Buchung stornieren"
    description={reverseTarget ? `Beleg ${reverseTarget.entryNo}` : undefined}
    size="sm"
>
    <p class="text-sm text-fg-muted">
        Der ursprüngliche Beleg bleibt erhalten. Es entsteht ein Gegenbuchungssatz mit
        vertauschten Seiten, der ihn aufhebt.
    </p>
    <form method="post" action="?/reverse" id="tx-reverse" class="space-y-4">
        <input type="hidden" name="entryId" value={reverseTarget?.id ?? ""} />
        <FormField label="Grund" hint="Erscheint im Text des Stornobelegs.">
            {#snippet children({ id })}
                <TextInput {id} name="reason" placeholder="z. B. falsches Konto" />
            {/snippet}
        </FormField>
    </form>

    {#snippet footer()}
        <Button variant="secondary" onclick={() => (reverseOpen = false)}>Abbrechen</Button>
        <Button
            variant="warning"
            icon="arrow-counterclockwise"
            onclick={() => document.forms.namedItem("tx-reverse")?.requestSubmit()}
        >
            Stornieren
        </Button>
    {/snippet}
</Modal>
