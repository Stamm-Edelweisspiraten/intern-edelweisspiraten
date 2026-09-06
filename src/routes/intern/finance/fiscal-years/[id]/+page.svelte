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
        StatTile,
        TextInput
    } from "$lib/components/ui";
    import type { Column } from "$lib/components/ui";
    import { formatEuro } from "$lib/money";
    import { formatDate } from "$lib/format";
    import {
        orderStatusLabel,
        orderStatusTone,
        paymentStatusLabel,
        paymentStatusTone
    } from "$lib/kaemmerer/orderStatus";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type Tx = PageData["transactions"][number];
    type Order = PageData["memberOrders"][number];

    let closeOpen = $state(false);

    const readOnly = $derived(data.year.status !== "active");
    const journalHref = $derived(`/intern/finance/journal?year=${data.year.id}`);
</script>

<svelte:head><title>Geschäftsjahr {data.year.year} – Kasse</title></svelte:head>

{#snippet amountCell(tx: Tx)}
    <span class={`font-bold tabular-figures ${tx.direction === "in" ? "text-success" : "text-danger"}`}>
        {tx.direction === "in" ? "+" : "−"}{formatEuro(tx.amount)}
    </span>
{/snippet}

{#snippet sourceCell(tx: Tx)}
    <span class="text-sm">{tx.note || "–"}</span>
    {#if tx.reversed}
        <Badge tone="neutral" size="xs" label="storniert" />
    {:else if tx.source !== "manual"}
        <Badge tone="info" size="xs" label={tx.source === "payment" ? "Zahlung" : tx.source} />
    {/if}
{/snippet}

{#snippet orderStatusCell(order: Order)}
    <Badge tone={orderStatusTone(order.status)} size="xs" label={orderStatusLabel(order.status)} />
{/snippet}

{#snippet orderPaymentCell(order: Order)}
    <Badge
        tone={paymentStatusTone(order.paymentStatus)}
        size="xs"
        label={paymentStatusLabel(order.paymentStatus)}
    />
{/snippet}

<div class="space-y-8">
    <PageHeader
        title={`Geschäftsjahr ${data.year.year}`}
        eyebrow="Kasse"
        subtitle={`Kennzahlen, Beitragssätze und Abschluss für ${data.year.year}.`}
        back={{ href: "/intern/finance" }}
    >
        {#snippet badge()}
            {#if data.year.status !== "active"}
                <Badge
                    tone="neutral"
                    label={data.year.status === "closed" ? "Abgeschlossen" : "Archiviert"}
                />
            {/if}
        {/snippet}

        {#snippet actions()}
            {#if data.canExport}
                <Button
                    href={`/intern/finance/fiscal-years/${data.year.id}/export.csv`}
                    variant="secondary"
                    icon="download">Export (CSV)</Button
                >
            {/if}
            <Button
                href={`/intern/finance/fiscal-years/${data.year.id}/outstanding`}
                variant="secondary"
                icon="hourglass-split">Offene Posten</Button
            >
            <Button href={journalHref} variant="primary" icon="journal-text">Journal</Button>
        {/snippet}
    </PageHeader>

    {#if form?.error}<Alert tone="danger" message={form.error} />{/if}
    {#if form?.success}<Alert tone="success" message={form.success} />{/if}

    {#if readOnly}
        <Alert
            tone="info"
            message="Dieses Geschäftsjahr ist abgeschlossen. Buchungen sind nicht mehr möglich."
        />
    {/if}

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
            label="Einnahmen"
            value={formatEuro(data.income)}
            tone="success"
            icon="arrow-down-circle"
        />
        <StatTile
            label="Ausgaben"
            value={formatEuro(data.expense)}
            tone="danger"
            icon="arrow-up-circle"
        />
        <StatTile
            label="Ergebnis"
            value={formatEuro(data.balance)}
            tone={data.balance < 0 ? "danger" : "primary"}
            icon="wallet2"
        />
        <StatTile
            label="Offene Posten"
            value={formatEuro(data.outstandingTotal)}
            tone="warning"
            icon="hourglass-split"
            hint={`${data.outstandingCount} Posten`}
            href={`/intern/finance/fiscal-years/${data.year.id}/outstanding`}
        />
    </div>

    {#if data.canManage && !readOnly && data.seedPreview && data.seedPreview.newCount > 0}
        <Card tone="warning">
            <div class="flex items-center justify-between gap-4 flex-wrap">
                <div class="min-w-0">
                    <p class="font-semibold text-fg">Jahresbeiträge noch nicht vollständig angelegt</p>
                    <p class="text-sm text-fg-muted mt-1">
                        Für {data.seedPreview.newCount} Mitglieder fehlt der Jahresbeitrag (zusammen
                        {formatEuro(data.seedPreview.newTotal)}).
                    </p>
                </div>
                <form method="post" action="?/seedDues">
                    <Button type="submit" variant="primary" icon="receipt">Beiträge anlegen</Button>
                </form>
            </div>
        </Card>
    {/if}

    <Card title="Beitragssätze">
        <form method="post" action="?/updateDues" class="space-y-4">
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {#each [["stamm", "Stamm"], ["gau", "Gau"], ["landesmark", "Landesmark"], ["bund", "Bund"]] as [key, label] (key)}
                    <FormField {label}>
                        {#snippet children({ id })}
                            <TextInput
                                {id}
                                name={`dues_${key}`}
                                inputmode="decimal"
                                disabled={readOnly || !data.canManage}
                                value={(data.year.dues[key as keyof typeof data.year.dues] / 100)
                                    .toFixed(2)
                                    .replace(".", ",")}
                            />
                        {/snippet}
                    </FormField>
                {/each}
            </div>
            {#if data.canManage && !readOnly}
                <div class="flex justify-end">
                    <Button type="submit" variant="secondary" icon="check-lg">
                        Beiträge speichern
                    </Button>
                </div>
            {/if}
        </form>
    </Card>

    <Card
        title="Letzte Buchungen"
        subtitle="Vollständige Liste, Filter und Erfassung im Journal."
        padding="none"
    >
        {#snippet actions()}
            <Button href={journalHref} variant="secondary" size="sm" icon="journal-text">
                Zum Journal
            </Button>
        {/snippet}

        <DataTable
            columns={[
                { key: "date", label: "Datum", value: (t) => formatDate(t.date) },
                { key: "no", label: "Beleg", value: (t) => t.entryNo },
                { key: "kind", label: "Art", value: (t) => t.kind },
                { key: "member", label: "Mitglied", value: (t) => t.member || "–" },
                { key: "account", label: "Konto", value: (t) => t.bankAccountName },
                { key: "note", label: "Notiz", cell: sourceCell },
                { key: "amount", label: "Betrag", align: "right", cell: amountCell }
            ] satisfies Column<Tx>[]}
            rows={data.transactions}
            getKey={(t) => t.id}
            cardTitle={(t) => t.kind}
            cardSubtitle={(t) => `${formatDate(t.date)} · ${t.entryNo}`}
            rowHref={(t) => `/intern/finance/journal/${t.id}`}
            empty="Noch keine Buchungen erfasst."
        />
    </Card>

    <Card
        title="Bestellungen"
        subtitle="Kämmerer-Bestellungen, die in diesem Jahr abgerechnet werden."
        padding="none"
    >
        <DataTable
            columns={[
                { key: "number", label: "Nummer", value: (o) => o.number },
                { key: "status", label: "Lieferung", cell: orderStatusCell },
                { key: "payment", label: "Zahlung", cell: orderPaymentCell },
                { key: "date", label: "Angelegt", value: (o) => formatDate(o.createdAt) },
                { key: "total", label: "Summe", align: "right", value: (o) => formatEuro(o.total) }
            ] satisfies Column<Order>[]}
            rows={data.memberOrders}
            getKey={(o) => o.id}
            cardTitle={(o) => o.number}
            cardSubtitle={(o) => formatDate(o.createdAt)}
            rowHref={(o) => `/intern/kaemmerer/orders/${o.id}`}
            empty="Keine Bestellungen in diesem Geschäftsjahr."
        />
    </Card>

    <Card title="Letzte Änderungen" padding="none">
        <DataTable
            columns={[
                { key: "at", label: "Zeitpunkt", value: (a) => a.at },
                { key: "entity", label: "Bereich", value: (a) => a.entity },
                { key: "action", label: "Vorgang", value: (a) => a.action },
                { key: "user", label: "Benutzer", value: (a) => a.user }
            ] satisfies Column<PageData["activity"][number]>[]}
            rows={data.activity}
            getKey={(a) => a.id}
            cardTitle={(a) => a.action}
            cardSubtitle={(a) => a.at}
            empty="Noch keine Änderungen erfasst."
        />
    </Card>

    {#if data.canClose && !readOnly}
        <Card title="Geschäftsjahr abschließen" tone="warning">
            <p class="text-sm text-fg-muted">
                Nach dem Abschluss sind keine Buchungen mehr möglich. Offene Posten können dabei in
                das Folgejahr übertragen werden — dieses muss dafür bereits angelegt sein.
            </p>
            <div class="flex justify-end mt-4">
                <Button variant="warning" icon="lock" onclick={() => (closeOpen = true)}>
                    Jahr abschließen
                </Button>
            </div>
        </Card>
    {/if}
</div>

<Modal bind:open={closeOpen} title="Geschäftsjahr abschließen" size="sm">
    <p class="text-sm text-fg-muted">
        Nach dem Abschluss können keine Buchungen mehr erfasst werden. Der Saldo wird als
        Anfangsbestand ins Folgejahr übernommen.
    </p>
    <form method="post" action="?/close" id="year-close" class="space-y-3">
        <label class="flex items-start gap-3 px-4 py-3 rounded-control border border-border cursor-pointer">
            <input type="checkbox" name="carryOver" value="1" class="mt-1 border-border-strong" />
            <span class="text-sm text-fg">
                Offene Posten ins Folgejahr übertragen
                <span class="block text-xs text-fg-subtle">
                    Das Folgejahr muss dafür bereits angelegt sein.
                </span>
            </span>
        </label>
    </form>

    {#snippet footer()}
        <Button variant="secondary" onclick={() => (closeOpen = false)}>Abbrechen</Button>
        <Button
            variant="warning"
            icon="lock"
            onclick={() => document.forms.namedItem("year-close")?.requestSubmit()}
        >
            Abschließen
        </Button>
    {/snippet}
</Modal>
