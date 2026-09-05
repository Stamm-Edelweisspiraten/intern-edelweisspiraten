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
        Select,
        StatTile,
        TextInput
    } from "$lib/components/ui";
    import type { Column } from "$lib/components/ui";
    import FinanceNav from "$lib/components/finance/FinanceNav.svelte";
    import { formatEuro } from "$lib/money";
    import { formatDate, toDateInputValue } from "$lib/format";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type Bill = PageData["bills"][number];

    let addOpen = $state(false);
    let payTarget = $state<Bill | null>(null);
    let payOpen = $state(false);
    let payAmount = $state("");

    const yearOptions = $derived(
        data.years.map((year) => ({ value: year.id, label: String(year.year) }))
    );
    const categoryOptions = $derived(
        data.categories.map((category) => ({ value: category.id, label: category.name }))
    );
    const bankOptions = $derived(data.bankAccounts.map((b) => ({ value: b.id, label: b.name })));

    const readOnly = $derived(data.selectedYear?.status !== "active");

    const STATUS = {
        open: { tone: "warning", label: "Offen" },
        partial: { tone: "info", label: "Teilzahlung" },
        paid: { tone: "success", label: "Bezahlt" },
        cancelled: { tone: "neutral", label: "Storniert" }
    } as const;

    function askPay(bill: Bill) {
        payTarget = bill;
        payAmount = (bill.outstanding / 100).toFixed(2).replace(".", ",");
        payOpen = true;
    }
</script>

<svelte:head><title>Eingangsrechnungen – Kasse</title></svelte:head>

{#snippet statusCell(bill: Bill)}
    <Badge tone={STATUS[bill.status].tone} size="xs" label={STATUS[bill.status].label} />
    {#if bill.overdue}
        <Badge tone="danger" size="xs" label="Überfällig" />
    {/if}
{/snippet}

{#snippet outstandingCell(bill: Bill)}
    {#if bill.outstanding > 0}
        <span class="font-bold text-warning tabular-figures">{formatEuro(bill.outstanding)}</span>
    {:else}
        <span class="text-fg-subtle">–</span>
    {/if}
{/snippet}

<div class="space-y-8">
    <PageHeader
        title="Eingangsrechnungen"
        eyebrow="Kasse"
        subtitle="Verbindlichkeiten des Vereins. Der Aufwand entsteht mit der Rechnung, nicht erst mit der Zahlung."
        back={{ href: "/intern/finance" }}
    >
        {#snippet actions()}
            {#if data.canManage && !readOnly}
                <Button variant="primary" icon="plus-circle" onclick={() => (addOpen = true)}>
                    Rechnung
                </Button>
            {/if}
        {/snippet}
    </PageHeader>

    <FinanceNav />

    {#if form?.error}<Alert tone="danger" message={form.error} />{/if}
    {#if form?.success}<Alert tone="success" message={form.success} />{/if}

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile
            label="Offene Verbindlichkeiten"
            value={formatEuro(data.outstanding)}
            tone="warning"
            icon="hourglass-split"
        />
        <StatTile label="Rechnungen" value={data.bills.length} tone="neutral" icon="receipt-cutoff" />
        <StatTile
            label="Überfällig"
            value={data.bills.filter((b) => b.overdue).length}
            tone="danger"
            icon="exclamation-triangle"
        />
    </div>

    <Card title="Zeitraum">
        <form method="get" class="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
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
            <div>
                <Button type="submit" variant="secondary" icon="funnel">Anzeigen</Button>
            </div>
        </form>
    </Card>

    <Card title="Rechnungen" padding="none">
        <DataTable
            columns={[
                { key: "number", label: "Nummer", value: (b) => b.number },
                { key: "vendor", label: "Lieferant", value: (b) => b.vendor },
                { key: "kind", label: "Art", value: (b) => b.kind },
                { key: "date", label: "Datum", value: (b) => formatDate(b.date) },
                {
                    key: "due",
                    label: "Fällig",
                    value: (b) => (b.dueDate ? formatDate(b.dueDate) : "–")
                },
                { key: "status", label: "Status", cell: statusCell },
                {
                    key: "amount",
                    label: "Betrag",
                    align: "right",
                    value: (b) => formatEuro(b.amount)
                },
                { key: "outstanding", label: "Offen", align: "right", cell: outstandingCell }
            ] satisfies Column<Bill>[]}
            rows={data.bills}
            getKey={(b) => b.id}
            cardTitle={(b) => b.vendor}
            cardSubtitle={(b) => `${b.number} · ${b.kind}`}
            rowClass={(b) => (b.status === "cancelled" ? "opacity-70" : "")}
            empty="Noch keine Eingangsrechnungen erfasst."
        >
            {#snippet actions(bill)}
                {#if data.canManage && !readOnly && bill.outstanding > 0 && bill.status !== "cancelled"}
                    <Button variant="success" size="sm" icon="check-lg" onclick={() => askPay(bill)}>
                        Zahlung
                    </Button>
                    {#if bill.paidAmount === 0}
                        <form method="post" action="?/cancel" class="inline">
                            <input type="hidden" name="billId" value={bill.id} />
                            <Button
                                type="submit"
                                variant="ghost"
                                size="sm"
                                icon="x-circle"
                                ariaLabel="Rechnung stornieren"
                            />
                        </form>
                    {/if}
                {/if}
            {/snippet}
        </DataTable>
    </Card>
</div>

<Modal bind:open={addOpen} title="Eingangsrechnung erfassen">
    <form method="post" action="?/create" id="bill-add" class="space-y-4">
        <input type="hidden" name="fiscalYearId" value={data.selectedYear?.id ?? ""} />

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Lieferant" required>
                {#snippet children({ id })}
                    <TextInput {id} name="vendor" placeholder="z. B. Pfadfinder-Shop" required />
                {/snippet}
            </FormField>
            <FormField label="Betrag" required>
                {#snippet children({ id })}
                    <TextInput {id} name="amount" inputmode="decimal" placeholder="149,90" required />
                {/snippet}
            </FormField>
        </div>

        <FormField label="Buchungsart" required hint="Bestimmt das Aufwandskonto.">
            {#snippet children({ id })}
                <Select {id} name="categoryId" options={categoryOptions} required />
            {/snippet}
        </FormField>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Rechnungsdatum" required>
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
            <FormField label="Fällig am">
                {#snippet children({ id })}
                    <TextInput {id} name="dueDate" type="date" />
                {/snippet}
            </FormField>
        </div>

        <FormField label="Notiz">
            {#snippet children({ id })}
                <TextInput {id} name="note" placeholder="Rechnungsnummer des Lieferanten o. Ä." />
            {/snippet}
        </FormField>
    </form>

    {#snippet footer()}
        <Button variant="secondary" onclick={() => (addOpen = false)}>Abbrechen</Button>
        <Button
            variant="primary"
            icon="check-lg"
            onclick={() => document.forms.namedItem("bill-add")?.requestSubmit()}
        >
            Erfassen
        </Button>
    {/snippet}
</Modal>

<Modal
    bind:open={payOpen}
    title="Zahlung erfassen"
    description={payTarget ? `${payTarget.vendor} — ${payTarget.number}` : undefined}
    size="sm"
>
    {#if payTarget}
        <form method="post" action="?/pay" id="bill-pay" class="space-y-4">
            <input type="hidden" name="billId" value={payTarget.id} />

            <FormField label="Betrag" required hint="Ein kleinerer Betrag wird als Teilzahlung verbucht.">
                {#snippet children({ id })}
                    <TextInput {id} name="amount" inputmode="decimal" bind:value={payAmount} required />
                {/snippet}
            </FormField>

            {#if bankOptions.length > 0}
                <FormField label="Konto">
                    {#snippet children({ id })}
                        <Select {id} name="bankAccountId" options={bankOptions} />
                    {/snippet}
                </FormField>
            {/if}

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

            <FormField label="Notiz">
                {#snippet children({ id })}
                    <TextInput {id} name="note" />
                {/snippet}
            </FormField>
        </form>
    {/if}

    {#snippet footer()}
        <Button variant="secondary" onclick={() => (payOpen = false)}>Abbrechen</Button>
        <Button
            variant="success"
            icon="check-lg"
            onclick={() => document.forms.namedItem("bill-pay")?.requestSubmit()}
        >
            Zahlung buchen
        </Button>
    {/snippet}
</Modal>
