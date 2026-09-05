<script lang="ts">
    import {
        Alert,
        Badge,
        Button,
        Card,
        DataTable,
        EmptyState,
        FormField,
        Modal,
        PageHeader,
        StatTile
    } from "$lib/components/ui";
    import type { Column } from "$lib/components/ui";
    import FinanceNav from "$lib/components/finance/FinanceNav.svelte";
    import PeriodFilter from "$lib/components/finance/PeriodFilter.svelte";
    import { BalanceLineChart } from "$lib/components/finance/charts";
    import { formatEuro } from "$lib/money";
    import { formatDate } from "$lib/format";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type BookEntry = NonNullable<PageData["book"]>["entries"][number];
    type Line = PageData["lines"][number];

    let importOpen = $state(false);

    const openLines = $derived(data.lines.filter((line) => line.status === "open"));
    const doneLines = $derived(data.lines.filter((line) => line.status !== "open"));
</script>

<svelte:head><title>{data.account.name} – Kasse</title></svelte:head>

{#snippet incomeCell(entry: BookEntry)}
    <span class="tabular-figures text-success">
        {entry.income > 0 ? formatEuro(entry.income) : "–"}
    </span>
{/snippet}

{#snippet expenseCell(entry: BookEntry)}
    <span class="tabular-figures text-danger">
        {entry.expense > 0 ? formatEuro(entry.expense) : "–"}
    </span>
{/snippet}

{#snippet runningCell(entry: BookEntry)}
    <span class={`font-semibold tabular-figures ${entry.balance < 0 ? "text-danger" : "text-fg"}`}>
        {formatEuro(entry.balance)}
    </span>
{/snippet}

{#snippet lineAmountCell(line: Line)}
    <span class={`font-bold tabular-figures ${line.amount < 0 ? "text-danger" : "text-success"}`}>
        {formatEuro(line.amount)}
    </span>
{/snippet}

{#snippet lineStatusCell(line: Line)}
    {#if line.status === "matched"}
        <Badge tone="success" size="xs" label="zugeordnet" />
    {:else if line.status === "ignored"}
        <Badge tone="neutral" size="xs" label="ignoriert" />
    {:else}
        <Badge tone="warning" size="xs" label="offen" />
    {/if}
{/snippet}

<div class="space-y-8">
    <PageHeader
        title={data.account.name}
        eyebrow="Konto"
        subtitle={data.account.iban || `Sachkonto ${data.account.accountNumber}`}
        back={{ href: "/intern/finance/bank-accounts" }}
    >
        {#snippet actions()}
            {#if data.canManage}
                <Button variant="primary" icon="upload" onclick={() => (importOpen = true)}>
                    Kontoauszug einlesen
                </Button>
            {/if}
        {/snippet}
    </PageHeader>

    <FinanceNav />

    {#if form?.error}<Alert tone="danger" message={form.error} />{/if}
    {#if form?.success}<Alert tone="success" message={form.success} />{/if}

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
            label="Kontostand"
            value={formatEuro(data.account.balance)}
            tone={data.account.balance < 0 ? "danger" : "primary"}
            icon="bank"
        />
        <StatTile
            label="Eingänge (Zeitraum)"
            value={formatEuro(data.book?.incomeTotal ?? 0)}
            tone="success"
            icon="arrow-down-circle"
        />
        <StatTile
            label="Ausgänge (Zeitraum)"
            value={formatEuro(data.book?.expenseTotal ?? 0)}
            tone="danger"
            icon="arrow-up-circle"
        />
        <StatTile
            label="Offene Auszugszeilen"
            value={data.summary.open}
            tone={data.summary.open > 0 ? "warning" : "neutral"}
            icon="clipboard-check"
            hint={`${data.summary.matched} zugeordnet`}
        />
    </div>

    <PeriodFilter from={data.period.from} to={data.period.to} />

    <!--
        Der Verlauf steht ueber der Tabelle, nicht statt ihr: der
        Kassenbericht darunter traegt jede Bewegung mit ihrem Bestand.
    -->
    {#if data.balanceCourse.length > 1}
        <Card title="Verlauf" subtitle="Kontostand im gewählten Zeitraum.">
            <BalanceLineChart entries={data.balanceCourse} />
        </Card>
    {/if}

    <Card
        title="Kassenbericht"
        meta={data.book ? `${formatDate(data.book.from)} – ${formatDate(data.book.to)}` : undefined}
        padding="none"
    >
        {#if data.book}
            <div class="px-4 py-3 border-b border-border flex flex-wrap gap-6 text-sm">
                <div>
                    <span class="text-xs text-fg-subtle uppercase tracking-wide block">
                        Anfangsbestand
                    </span>
                    <span class="font-bold tabular-figures">
                        {formatEuro(data.book.openingBalance)}
                    </span>
                </div>
                <div>
                    <span class="text-xs text-fg-subtle uppercase tracking-wide block">
                        Endbestand
                    </span>
                    <span class="font-bold tabular-figures">
                        {formatEuro(data.book.closingBalance)}
                    </span>
                </div>
            </div>

            <DataTable
                columns={[
                    { key: "date", label: "Datum", value: (e) => formatDate(e.date) },
                    { key: "no", label: "Beleg", value: (e) => e.entryNo },
                    { key: "description", label: "Vorgang", value: (e) => e.description || "–" },
                    { key: "counter", label: "Gegenkonto", value: (e) => e.counterAccount || "–" },
                    { key: "income", label: "Eingang", align: "right", cell: incomeCell },
                    { key: "expense", label: "Ausgang", align: "right", cell: expenseCell },
                    { key: "balance", label: "Bestand", align: "right", cell: runningCell }
                ] satisfies Column<BookEntry>[]}
                rows={data.book.entries}
                getKey={(e) => `${e.entryNo}-${e.date}`}
                cardTitle={(e) => e.entryNo}
                cardSubtitle={(e) => formatDate(e.date)}
                empty="In diesem Zeitraum gab es keine Bewegungen."
            />
        {/if}
    </Card>

    <Card
        title="Kontoabgleich"
        subtitle="Eingelesene Auszugszeilen werden mit den Buchungen abgeglichen. Bestätigt wird immer von Hand."
        padding="none"
    >
        {#if data.lines.length === 0}
            <EmptyState
                icon="clipboard-check"
                title="Noch kein Kontoauszug eingelesen"
                description="Lade einen CSV-Auszug hoch, um ihn mit den Buchungen abzugleichen."
            >
                {#snippet action()}
                    {#if data.canManage}
                        <Button variant="primary" icon="upload" onclick={() => (importOpen = true)}>
                            Kontoauszug einlesen
                        </Button>
                    {/if}
                {/snippet}
            </EmptyState>
        {:else}
            <ul class="divide-y divide-border">
                {#each openLines as line (line.id)}
                    <li class="p-4 space-y-3">
                        <div class="flex items-start justify-between gap-4 flex-wrap">
                            <div class="min-w-0">
                                <p class="font-semibold text-fg">
                                    {formatDate(line.date)} · {line.counterparty || "Ohne Angabe"}
                                </p>
                                <p class="text-sm text-fg-muted mt-0.5 break-words">
                                    {line.reference || "Kein Verwendungszweck"}
                                </p>
                            </div>
                            <span
                                class={`font-bold tabular-figures ${line.amount < 0 ? "text-danger" : "text-success"}`}
                            >
                                {formatEuro(line.amount)}
                            </span>
                        </div>

                        {#if data.canManage}
                            <div class="flex flex-wrap items-center gap-2">
                                {#each line.suggestions.slice(0, 3) as suggestion (suggestion.entryId)}
                                    <form method="post" action="?/match" class="inline">
                                        <input type="hidden" name="lineId" value={line.id} />
                                        <input
                                            type="hidden"
                                            name="entryId"
                                            value={suggestion.entryId}
                                        />
                                        <Button type="submit" variant="success" size="sm" icon="link-45deg">
                                            {suggestion.entryNo} · {formatDate(suggestion.date)}
                                        </Button>
                                    </form>
                                {/each}

                                {#if line.suggestions.length === 0}
                                    <span class="text-xs text-fg-subtle">
                                        Keine passende Buchung gefunden — bitte zuerst buchen.
                                    </span>
                                {/if}

                                <form method="post" action="?/ignore" class="inline">
                                    <input type="hidden" name="lineId" value={line.id} />
                                    <Button type="submit" variant="ghost" size="sm" icon="eye-slash">
                                        Ignorieren
                                    </Button>
                                </form>
                            </div>
                        {/if}
                    </li>
                {/each}
            </ul>

            {#if doneLines.length > 0}
                <div class="border-t border-border">
                    <DataTable
                        columns={[
                            { key: "date", label: "Datum", value: (l) => formatDate(l.date) },
                            { key: "party", label: "Gegenseite", value: (l) => l.counterparty || "–" },
                            { key: "reference", label: "Zweck", value: (l) => l.reference || "–" },
                            { key: "status", label: "Status", cell: lineStatusCell },
                            { key: "amount", label: "Betrag", align: "right", cell: lineAmountCell }
                        ] satisfies Column<Line>[]}
                        rows={doneLines}
                        getKey={(l) => l.id}
                        cardTitle={(l) => l.counterparty || formatDate(l.date)}
                        cardSubtitle={(l) => l.reference}
                        empty="Keine erledigten Zeilen."
                    >
                        {#snippet actions(line)}
                            {#if data.canManage}
                                <form method="post" action="?/reset" class="inline">
                                    <input type="hidden" name="lineId" value={line.id} />
                                    <Button
                                        type="submit"
                                        variant="ghost"
                                        size="sm"
                                        icon="arrow-counterclockwise"
                                        ariaLabel="Zuordnung aufheben"
                                    />
                                </form>
                            {/if}
                        {/snippet}
                    </DataTable>
                </div>
            {/if}
        {/if}
    </Card>
</div>

<Modal bind:open={importOpen} title="Kontoauszug einlesen" size="sm">
    <p class="text-sm text-fg-muted">
        CSV-Datei der Bank. Erkannt werden die Spalten Buchungstag, Betrag, Begünstigter und
        Verwendungszweck; Semikolon als Trennzeichen und Komma als Dezimalzeichen sind die
        Voreinstellung deutscher Banken. Bereits eingelesene Zeilen werden übersprungen.
    </p>

    <form
        method="post"
        action="?/import"
        enctype="multipart/form-data"
        id="statement-import"
        class="space-y-4"
    >
        <FormField label="Datei" required>
            {#snippet children({ id })}
                <input
                    {id}
                    type="file"
                    name="file"
                    accept=".csv,text/csv"
                    required
                    class="w-full text-sm text-fg-muted file:mr-4 file:px-4 file:py-2 file:rounded-control file:border file:border-border file:bg-surface-muted file:text-fg file:text-sm file:font-semibold"
                />
            {/snippet}
        </FormField>
    </form>

    {#snippet footer()}
        <Button variant="secondary" onclick={() => (importOpen = false)}>Abbrechen</Button>
        <Button
            variant="primary"
            icon="upload"
            onclick={() => document.forms.namedItem("statement-import")?.requestSubmit()}
        >
            Einlesen
        </Button>
    {/snippet}
</Modal>
