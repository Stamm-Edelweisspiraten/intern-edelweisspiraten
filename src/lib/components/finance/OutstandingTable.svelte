<script lang="ts">
    import { Badge, Button, DataTable, FormField, Modal, TextInput } from "$lib/components/ui";
    import type { Column } from "$lib/components/ui";
    import { formatEuro } from "$lib/money";
    import { formatDate, toDateInputValue } from "$lib/format";

    /**
     * Gemeinsame Darstellung offener Posten für die jahresübergreifende und
     * die jahresbezogene Ansicht -- beide Seiten hatten dafür bisher eigene,
     * nahezu identische Tabellen samt Bezahl-Dialog.
     */

    interface Invoice {
        id: string;
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
    }

    let { invoices, canManage, showYear = false, empty = "Keine offenen Posten." }: Props = $props();

    let payTarget = $state<Invoice | null>(null);
    let payOpen = $state(false);
    let amount = $state("");

    function askPay(invoice: Invoice) {
        payTarget = invoice;
        amount = (invoice.outstanding / 100).toFixed(2).replace(".", ",");
        payOpen = true;
    }

    const columns = $derived<Column<Invoice>[]>(
        [
            ...(showYear ? [{ key: "year", label: "Jahr", value: (i: Invoice) => i.year ?? "–" }] : []),
            { key: "member", label: "Mitglied", value: (i: Invoice) => i.member },
            { key: "kind", label: "Art", value: (i: Invoice) => i.kind },
            { key: "due", label: "Fällig", cell: dueCell },
            { key: "amount", label: "Betrag", align: "right", value: (i: Invoice) => formatEuro(i.amount) },
            { key: "paid", label: "Bezahlt", align: "right", cell: paidCell },
            { key: "outstanding", label: "Offen", align: "right", cell: outstandingCell }
        ] as Column<Invoice>[]
    );
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
        <span class="text-success font-semibold">{formatEuro(invoice.paidAmount)}</span>
        <Badge tone="info" size="xs" label="Teilzahlung" />
    {:else}
        <span class="text-fg-subtle">–</span>
    {/if}
{/snippet}

{#snippet outstandingCell(invoice: Invoice)}
    <span class="font-bold text-warning">{formatEuro(invoice.outstanding)}</span>
{/snippet}

<DataTable
    {columns}
    rows={invoices}
    getKey={(i) => i.id}
    cardTitle={(i) => i.member}
    cardSubtitle={(i) => i.kind}
    {empty}
>
    {#snippet actions(invoice)}
        {#if canManage}
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
                    <dd class="font-semibold text-fg">{formatEuro(payTarget.amount)}</dd>
                </div>
                <div>
                    <dt class="text-xs text-fg-subtle uppercase tracking-wide">Bereits bezahlt</dt>
                    <dd class="font-semibold text-fg">{formatEuro(payTarget.paidAmount)}</dd>
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

            <FormField label="Datum" required>
                {#snippet children({ id })}
                    <TextInput {id} name="date" type="date" value={toDateInputValue(new Date())} required />
                {/snippet}
            </FormField>

            <FormField label="Notiz">
                {#snippet children({ id })}
                    <TextInput {id} name="note" placeholder="z.B. Überweisung vom 03.03." />
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
