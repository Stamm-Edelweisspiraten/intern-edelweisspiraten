<script lang="ts">
    import {
        Alert,
        Badge,
        Button,
        Card,
        FormField,
        Modal,
        PageHeader,
        TextInput
    } from "$lib/components/ui";
    import { formatEuro } from "$lib/money";
    import { formatDate, formatDateTime } from "$lib/format";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let reverseOpen = $state(false);

    const readOnly = $derived(data.year?.status !== "active");
    const canReverse = $derived(
        data.canManage && !readOnly && !data.entry.reversedById && !data.entry.reversesId
    );

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
</script>

<svelte:head><title>Beleg {data.entry.entryNo} – Kasse</title></svelte:head>

<div class="space-y-8">
    <PageHeader
        title={`Beleg ${data.entry.entryNo}`}
        eyebrow="Kasse"
        subtitle={data.entry.description || "Buchungssatz"}
        back={{ href: "/intern/finance/journal" }}
    >
        {#snippet badge()}
            {#if data.entry.reversedById}
                <Badge tone="neutral" label="Storniert" />
            {:else if data.entry.reversesId}
                <Badge tone="warning" label="Stornobeleg" />
            {/if}
        {/snippet}

        {#snippet actions()}
            {#if canReverse}
                <Button
                    variant="warning"
                    icon="arrow-counterclockwise"
                    onclick={() => (reverseOpen = true)}>Stornieren</Button
                >
            {/if}
        {/snippet}
    </PageHeader>

    {#if form?.error}<Alert tone="danger" message={form.error} />{/if}
    {#if form?.success}<Alert tone="success" message={form.success} />{/if}

    {#if data.reversal}
        <Alert tone="info">
            Dieser Beleg wurde storniert durch
            <a href={`/intern/finance/journal/${data.reversal.id}`} class="font-semibold underline">
                {data.reversal.entryNo}
            </a>.
        </Alert>
    {/if}
    {#if data.original}
        <Alert tone="info">
            Dieser Beleg storniert
            <a href={`/intern/finance/journal/${data.original.id}`} class="font-semibold underline">
                {data.original.entryNo}
            </a>.
        </Alert>
    {/if}

    <Card title="Angaben">
        <dl class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div>
                <dt class="text-xs text-fg-subtle uppercase tracking-wide">Datum</dt>
                <dd class="font-semibold text-fg mt-0.5">{formatDate(data.entry.date)}</dd>
            </div>
            <div>
                <dt class="text-xs text-fg-subtle uppercase tracking-wide">Geschäftsjahr</dt>
                <dd class="font-semibold text-fg mt-0.5">{data.year?.year ?? "–"}</dd>
            </div>
            <div>
                <dt class="text-xs text-fg-subtle uppercase tracking-wide">Herkunft</dt>
                <dd class="font-semibold text-fg mt-0.5">
                    {SOURCE_LABELS[data.entry.source] ?? data.entry.source}
                </dd>
            </div>
            <div>
                <dt class="text-xs text-fg-subtle uppercase tracking-wide">Erfasst von</dt>
                <dd class="font-semibold text-fg mt-0.5">
                    {data.entry.createdBy}
                    <span class="block text-xs font-normal text-fg-subtle">
                        {formatDateTime(data.entry.createdAt)}
                    </span>
                </dd>
            </div>
        </dl>
    </Card>

    <Card title="Buchungssatz" padding="none">
        <!-- Eigener Scrollbereich: die Seite selbst darf nicht waagerecht scrollen. -->
        <div class="overflow-x-auto">
            <table class="w-full min-w-[36rem]">
                <caption class="sr-only">Zeilen des Buchungssatzes</caption>
                <thead class="bg-surface-sunken border-b border-border">
                    <tr>
                        <th
                            scope="col"
                            class="px-4 py-2.5 text-left text-xs font-semibold text-fg-muted uppercase tracking-wide"
                            >Konto</th
                        >
                        <th
                            scope="col"
                            class="px-4 py-2.5 text-left text-xs font-semibold text-fg-muted uppercase tracking-wide"
                            >Zuordnung</th
                        >
                        <th
                            scope="col"
                            class="px-4 py-2.5 text-right text-xs font-semibold text-fg-muted uppercase tracking-wide"
                            >Soll</th
                        >
                        <th
                            scope="col"
                            class="px-4 py-2.5 text-right text-xs font-semibold text-fg-muted uppercase tracking-wide"
                            >Haben</th
                        >
                    </tr>
                </thead>
                <tbody class="divide-y divide-border">
                    {#each data.entry.lines as line (line.id)}
                        <tr>
                            <td class="px-4 py-2.5 text-sm text-fg">
                                <a
                                    href={`/intern/finance/accounts/${line.accountId}`}
                                    class="hover:text-primary transition"
                                >
                                    <span class="font-semibold">{line.accountNumber}</span>
                                    {line.accountName}
                                </a>
                            </td>
                            <td class="px-4 py-2.5 text-sm text-fg-muted">
                                {line.memberName || line.note || "–"}
                            </td>
                            <td class="px-4 py-2.5 text-sm text-right font-semibold">
                                {line.debit > 0 ? formatEuro(line.debit) : ""}
                            </td>
                            <td class="px-4 py-2.5 text-sm text-right font-semibold">
                                {line.credit > 0 ? formatEuro(line.credit) : ""}
                            </td>
                        </tr>
                    {/each}
                </tbody>
                <tfoot class="border-t-2 border-border-strong">
                    <tr>
                        <td class="px-4 py-2.5 text-sm font-semibold text-fg" colspan="2">Summe</td>
                        <td class="px-4 py-2.5 text-sm text-right font-bold text-fg">
                            {formatEuro(data.entry.total)}
                        </td>
                        <td class="px-4 py-2.5 text-sm text-right font-bold text-fg">
                            {formatEuro(data.entry.total)}
                        </td>
                    </tr>
                </tfoot>
            </table>
        </div>
    </Card>
</div>

<Modal bind:open={reverseOpen} title="Buchung stornieren" size="sm">
    <p class="text-sm text-fg-muted">
        Der Beleg bleibt erhalten. Es entsteht ein Gegenbuchungssatz mit vertauschten Seiten.
    </p>
    <form method="post" action="?/reverse" id="entry-reverse" class="space-y-4">
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
            onclick={() => document.forms.namedItem("entry-reverse")?.requestSubmit()}
        >
            Stornieren
        </Button>
    {/snippet}
</Modal>
