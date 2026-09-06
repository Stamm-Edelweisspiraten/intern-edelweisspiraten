<script lang="ts">
    import {
        Badge,
        Button,
        DataTable,
        FormField,
        Modal,
        Select,
        TextInput
    } from "$lib/components/ui";
    import type { Column } from "$lib/components/ui";
    import { formatEuro } from "$lib/money";
    import { formatDate, toDateInputValue } from "$lib/format";

    /**
     * Gemeinsame Darstellung offener Posten für die jahresübergreifende und
     * die jahresbezogene Ansicht -- beide Seiten hatten dafür bisher eigene,
     * nahezu identische Tabellen samt Bezahl-Dialog.
     *
     * Neu ist der Storno: die Aktion existierte serverseitig bereits, war aber
     * an keine Schaltfläche angeschlossen. Eine falsch verbuchte Zahlung war
     * damit nicht korrigierbar.
     */

    interface Payment {
        id: string;
        amount: number;
        date: string;
        bankAccountName: string;
        note: string;
        reversed: boolean;
    }

    interface Invoice {
        id: string;
        number: string;
        member: string;
        kind: string;
        amount: number;
        paidAmount: number;
        outstanding: number;
        date: string;
        dueDate: string | null;
        overdue: boolean;
        status: string;
        year?: number;
    }

    interface Props {
        invoices: Invoice[];
        canManage: boolean;
        showYear?: boolean;
        empty?: string;
        bankAccounts?: { id: string; name: string }[];
        /** Zahlungen je Rechnungskennung, für den Storno. */
        payments?: Record<string, Payment[]>;
    }

    let {
        invoices,
        canManage,
        showYear = false,
        empty = "Keine offenen Posten.",
        bankAccounts = [],
        payments = {}
    }: Props = $props();

    let payTarget = $state<Invoice | null>(null);
    let payOpen = $state(false);
    let amount = $state("");

    let historyTarget = $state<Invoice | null>(null);
    let historyOpen = $state(false);

    function askPay(invoice: Invoice) {
        payTarget = invoice;
        amount = (invoice.outstanding / 100).toFixed(2).replace(".", ",");
        payOpen = true;
    }

    function showHistory(invoice: Invoice) {
        historyTarget = invoice;
        historyOpen = true;
    }

    function paymentsFor(invoice: Invoice | null): Payment[] {
        return invoice ? (payments[invoice.id] ?? []) : [];
    }

    const bankOptions = $derived(
        bankAccounts.map((bank) => ({ value: bank.id, label: bank.name }))
    );

    const columns = $derived<Column<Invoice>[]>([
        ...(showYear
            ? [{ key: "year", label: "Jahr", value: (i: Invoice) => i.year ?? "–" }]
            : []),
        { key: "number", label: "Nummer", value: (i: Invoice) => i.number },
        { key: "member", label: "Mitglied", value: (i: Invoice) => i.member },
        { key: "kind", label: "Art", value: (i: Invoice) => i.kind },
        { key: "due", label: "Fällig", cell: dueCell },
        {
            key: "amount",
            label: "Betrag",
            align: "right",
            value: (i: Invoice) => formatEuro(i.amount)
        },
        { key: "paid", label: "Bezahlt", align: "right", cell: paidCell },
        { key: "outstanding", label: "Offen", align: "right", cell: outstandingCell }
    ] as Column<Invoice>[]);
</script>

{#snippet dueCell(invoice: Invoice)}
    {#if invoice.dueDate}
        <span class={invoice.overdue ? "text-danger font-semibold" : ""}>
            {formatDate(invoice.dueDate)}
        </span>
        {#if invoice.overdue}
            <Badge tone="danger" size="xs" label="Überfällig" />
        {/if}
    {:else}
        <span class="text-fg-subtle">–</span>
    {/if}
{/snippet}

{#snippet paidCell(invoice: Invoice)}
    {#if invoice.paidAmount > 0}
        <span class="text-success font-semibold tabular-figures">
            {formatEuro(invoice.paidAmount)}
        </span>
        <Badge tone="info" size="xs" label="Teilzahlung" />
    {:else}
        <span class="text-fg-subtle">–</span>
    {/if}
{/snippet}

{#snippet outstandingCell(invoice: Invoice)}
    <span class="font-bold text-warning tabular-figures">{formatEuro(invoice.outstanding)}</span>
{/snippet}

<DataTable
    {columns}
    rows={invoices}
    getKey={(i) => i.id}
    cardTitle={(i) => i.member}
    cardSubtitle={(i) => `${i.number} · ${i.kind}`}
    {empty}
>
    {#snippet actions(invoice)}
        {#if canManage}
            {#if (payments[invoice.id] ?? []).length > 0}
                <Button
                    variant="ghost"
                    size="sm"
                    icon="clock-history"
                    ariaLabel="Zahlungen anzeigen"
                    onclick={() => showHistory(invoice)}
                />
            {/if}
            <Button variant="success" size="sm" icon="check-lg" onclick={() => askPay(invoice)}>
                Zahlung erfassen
            </Button>
        {/if}
    {/snippet}
</DataTable>

<Modal
    bind:open={payOpen}
    title="Zahlung erfassen"
    description={payTarget ? `${payTarget.member} — ${payTarget.kind}` : undefined}
    size="sm"
>
    {#if payTarget}
        <form method="post" action="?/pay" id="pay-form" class="space-y-4">
            <input type="hidden" name="invoiceId" value={payTarget.id} />

            <dl class="grid grid-cols-2 gap-2 text-sm">
                <div>
                    <dt class="text-xs text-fg-subtle uppercase tracking-wide">Rechnungsbetrag</dt>
                    <dd class="font-semibold text-fg tabular-figures">
                        {formatEuro(payTarget.amount)}
                    </dd>
                </div>
                <div>
                    <dt class="text-xs text-fg-subtle uppercase tracking-wide">Bereits bezahlt</dt>
                    <dd class="font-semibold text-fg tabular-figures">
                        {formatEuro(payTarget.paidAmount)}
                    </dd>
                </div>
            </dl>

            <FormField
                label="Betrag"
                hint="Ein kleinerer Betrag wird als Teilzahlung verbucht."
                required
            >
                {#snippet children({ id })}
                    <TextInput {id} name="amount" inputmode="decimal" bind:value={amount} required />
                {/snippet}
            </FormField>

            {#if bankOptions.length > 0}
                <FormField label="Konto" hint="Auf welchem Konto ist das Geld eingegangen?">
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
                    <TextInput {id} name="note" placeholder="z. B. Überweisung vom 03.03." />
                {/snippet}
            </FormField>
        </form>
    {/if}

    {#snippet footer()}
        <Button variant="secondary" onclick={() => (payOpen = false)}>Abbrechen</Button>
        <Button
            variant="success"
            icon="check-lg"
            onclick={() => document.forms.namedItem("pay-form")?.requestSubmit()}
        >
            Zahlung buchen
        </Button>
    {/snippet}
</Modal>

<Modal
    bind:open={historyOpen}
    title="Zahlungen"
    description={historyTarget ? `${historyTarget.member} — ${historyTarget.number}` : undefined}
    size="md"
>
    <ul class="divide-y divide-border">
        {#each paymentsFor(historyTarget) as payment (payment.id)}
            <li class="py-3 flex items-center justify-between gap-4 flex-wrap">
                <div class="min-w-0">
                    <p class="font-semibold text-fg tabular-figures">
                        {formatEuro(payment.amount)}
                        {#if payment.reversed}
                            <Badge tone="neutral" size="xs" label="storniert" />
                        {/if}
                    </p>
                    <p class="text-xs text-fg-subtle mt-0.5">
                        {formatDate(payment.date)} · {payment.bankAccountName}
                        {#if payment.note}· {payment.note}{/if}
                    </p>
                </div>
                {#if !payment.reversed}
                    <form method="post" action="?/reverse">
                        <input type="hidden" name="paymentId" value={payment.id} />
                        <Button type="submit" variant="ghost" size="sm" icon="arrow-counterclockwise">
                            Stornieren
                        </Button>
                    </form>
                {/if}
            </li>
        {/each}
    </ul>

    {#snippet footer()}
        <Button variant="secondary" onclick={() => (historyOpen = false)}>Schließen</Button>
    {/snippet}
</Modal>
