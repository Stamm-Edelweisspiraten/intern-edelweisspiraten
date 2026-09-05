<script lang="ts">
    import {
        Alert, Badge, Button, Card, ConfirmDialog, DataTable, FormField,
        Modal, PageHeader, Pagination, SearchInput, StatTile, TextInput
    } from "$lib/components/ui";
    import type { Column } from "$lib/components/ui";
    import { formatEuro } from "$lib/money";
    import { formatDate, toDateInputValue } from "$lib/format";
    import { orderStatusLabel, orderStatusTone, paymentStatusLabel, paymentStatusTone } from "$lib/kaemmerer/orderStatus";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type Tx = PageData["transactions"][number];
    type Order = PageData["memberOrders"][number];

    let search = $state("");
    let addOpen = $state(false);
    let editTarget = $state<Tx | null>(null);
    let editOpen = $state(false);
    let deleteTarget = $state<Tx | null>(null);
    let deleteOpen = $state(false);
    let deleteForm = $state<HTMLFormElement | null>(null);
    let closeOpen = $state(false);

    const filtered = $derived(
        data.transactions.filter((tx) => {
            const needle = search.trim().toLowerCase();
            if (!needle) return true;
            return `${tx.kind} ${tx.member} ${tx.note} ${formatEuro(tx.amount)}`
                .toLowerCase()
                .includes(needle);
        })
    );

    const readOnly = $derived(data.year.status !== "active");

    function askEdit(tx: Tx) {
        editTarget = tx;
        editOpen = true;
    }

    function askDelete(tx: Tx) {
        deleteTarget = tx;
        deleteOpen = true;
    }
</script>

<svelte:head><title>Geschäftsjahr {data.year.year} - Kasse</title></svelte:head>

{#snippet amountCell(tx: Tx)}
    <span class={`font-bold ${tx.direction === "in" ? "text-success" : "text-danger"}`}>
        {tx.direction === "in" ? "+" : "−"}{formatEuro(tx.amount)}
    </span>
{/snippet}

{#snippet noteCell(tx: Tx)}
    <span class="text-sm">{tx.note || "–"}</span>
    {#if tx.invoiceId}
        <Badge tone="info" size="xs" label="Zahlung" />
    {/if}
{/snippet}

{#snippet orderStatusCell(order: Order)}
    <Badge tone={orderStatusTone(order.status)} size="xs" label={orderStatusLabel(order.status)} />
{/snippet}

{#snippet orderPaymentCell(order: Order)}
    <Badge tone={paymentStatusTone(order.paymentStatus)} size="xs" label={paymentStatusLabel(order.paymentStatus)} />
{/snippet}

<div class="space-y-8">
    <PageHeader
        title={`Geschäftsjahr ${data.year.year}`}
        eyebrow="Kasse"
        subtitle={`Beiträge, Buchungen und offene Posten für ${data.year.year}.`}
        back={{ href: "/intern/finance" }}
    >
        {#snippet badge()}
            {#if data.year.status !== "active"}
                <Badge tone="neutral" label={data.year.status === "closed" ? "Abgeschlossen" : "Archiviert"} />
            {/if}
        {/snippet}

        {#snippet actions()}
            <Button href={`/intern/finance/fiscal-years/${data.year.id}/export.csv`} variant="secondary" icon="download">
                Export (CSV)
            </Button>
            <Button href={`/intern/finance/fiscal-years/${data.year.id}/outstanding`} variant="secondary" icon="hourglass-split">
                Offene Posten
            </Button>
            {#if data.canManage && !readOnly}
                <Button variant="primary" icon="plus-circle" onclick={() => (addOpen = true)}>
                    Buchung
                </Button>
            {/if}
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
        <StatTile label="Einnahmen" value={formatEuro(data.income)} tone="success" icon="arrow-down-circle" />
        <StatTile label="Ausgaben" value={formatEuro(data.expense)} tone="danger" icon="arrow-up-circle" />
        <StatTile label="Saldo" value={formatEuro(data.balance)} tone={data.balance < 0 ? "danger" : "primary"} icon="wallet2" />
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
                        Für {data.seedPreview.newCount} Mitglieder fehlt der Jahresbeitrag
                        (zusammen {formatEuro(data.seedPreview.newTotal)}).
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
                    <FormField label={label}>
                        {#snippet children({ id })}
                            <TextInput
                                {id}
                                name={`dues_${key}`}
                                inputmode="decimal"
                                disabled={readOnly || !data.canManage}
                                value={(data.year.dues[key as keyof typeof data.year.dues] / 100).toFixed(2).replace(".", ",")}
                            />
                        {/snippet}
                    </FormField>
                {/each}
            </div>
            {#if data.canManage && !readOnly}
                <div class="flex justify-end">
                    <Button type="submit" variant="secondary" icon="check-lg">Beiträge speichern</Button>
                </div>
            {/if}
        </form>
    </Card>

    <Card title="Buchungen" meta={`${data.transactionCount} gesamt`} padding="none">
        {#snippet actions()}
            <SearchInput bind:value={search} placeholder="Buchung suchen..." label="Buchung suchen" />
        {/snippet}

        <DataTable
            columns={[
                { key: "date", label: "Datum", value: (t) => formatDate(t.date) },
                { key: "kind", label: "Art", value: (t) => t.kind },
                { key: "member", label: "Mitglied", value: (t) => t.member || "–" },
                { key: "note", label: "Notiz", cell: noteCell },
                { key: "amount", label: "Betrag", align: "right", cell: amountCell }
            ] satisfies Column<Tx>[]}
            rows={filtered}
            getKey={(t) => t.id}
            cardTitle={(t) => t.kind}
            cardSubtitle={(t) => formatDate(t.date)}
            empty={search ? "Keine passende Buchung gefunden." : "Noch keine Buchungen erfasst."}
        >
            {#snippet actions(tx)}
                {#if data.canManage && !readOnly && !tx.invoiceId}
                    <Button variant="secondary" size="sm" icon="pencil" ariaLabel="Buchung bearbeiten" onclick={() => askEdit(tx)} />
                    <Button variant="ghost" size="sm" icon="trash" ariaLabel="Buchung löschen" onclick={() => askDelete(tx)} />
                {/if}
            {/snippet}
        </DataTable>

        <div class="p-4">
            <Pagination total={data.transactionCount} pageSize={data.pageSize} current={data.page} />
        </div>
    </Card>

    <Card title="Bestellungen" subtitle="Kämmerer-Bestellungen, die in diesem Jahr abgerechnet werden." padding="none">
        <DataTable
            columns={[
                { key: "number", label: "Nummer", value: (o) => o.number },
                { key: "members", label: "Mitglieder", value: (o) => o.members },
                { key: "status", label: "Status", cell: orderStatusCell },
                { key: "payment", label: "Zahlung", cell: orderPaymentCell },
                { key: "total", label: "Summe", align: "right", value: (o) => formatEuro(o.total) }
            ] satisfies Column<Order>[]}
            rows={data.memberOrders}
            getKey={(o) => o.id}
            cardTitle={(o) => o.number}
            cardSubtitle={(o) => o.members}
            rowHref={(o) => `/intern/kaemmerer/orders/${o.id}`}
            empty="Keine Bestellungen in diesem Geschäftsjahr."
        />
    </Card>

    <Card title="Letzte Änderungen" padding="none">
        <DataTable
            columns={[
                { key: "at", label: "Zeitpunkt", value: (a) => a.at },
                { key: "entity", label: "Bereich", value: (a) => a.entity },
                { key: "action", label: "Aktion", value: (a) => a.action },
                { key: "user", label: "Benutzer", value: (a) => a.user }
            ] satisfies Column<PageData["activity"][number]>[]}
            rows={data.activity}
            getKey={(a) => a.id}
            cardTitle={(a) => a.action}
            cardSubtitle={(a) => a.at}
            empty="Noch keine Änderungen erfasst."
        />
    </Card>

    {#if data.canManage && !readOnly}
        <Card title="Geschäftsjahr abschließen" tone="warning">
            <p class="text-sm text-fg-muted">
                Nach dem Abschluss sind keine Buchungen mehr möglich. Offene Posten können
                dabei in das Folgejahr übertragen werden — dieses muss dafür bereits angelegt sein.
            </p>
            <div class="flex justify-end mt-4">
                <Button variant="warning" icon="lock" onclick={() => (closeOpen = true)}>
                    Jahr abschließen
                </Button>
            </div>
        </Card>
    {/if}
</div>

<!-- Buchung erfassen -->
<Modal bind:open={addOpen} title="Buchung erfassen">
    <form method="post" action="?/addTransaction" id="tx-add" class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Datum" required>
                {#snippet children({ id })}
                    <TextInput {id} name="date" type="date" value={toDateInputValue(new Date())} required />
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
                <select {id} name="direction" class="w-full px-4 py-3 rounded-xl text-sm bg-surface text-fg border border-border-strong shadow-sm">
                    <option value="in">Einnahme</option>
                    <option value="out">Ausgabe</option>
                </select>
            {/snippet}
        </FormField>

        <FormField label="Art" required>
            {#snippet children({ id })}
                <select {id} name="kind" required class="w-full px-4 py-3 rounded-xl text-sm bg-surface text-fg border border-border-strong shadow-sm">
                    {#each data.kinds as kind (kind)}
                        <option value={kind}>{kind}</option>
                    {/each}
                </select>
            {/snippet}
        </FormField>

        <FormField label="Mitglied" hint="Optional, für mitgliedsbezogene Buchungen.">
            {#snippet children({ id })}
                <select {id} name="memberId" class="w-full px-4 py-3 rounded-xl text-sm bg-surface text-fg border border-border-strong shadow-sm">
                    <option value="">– kein Mitglied –</option>
                    {#each data.members as member (member.id)}
                        <option value={member.id}>{member.name}</option>
                    {/each}
                </select>
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
        <Button variant="primary" icon="check-lg" onclick={() => document.forms.namedItem("tx-add")?.requestSubmit()}>
            Speichern
        </Button>
    {/snippet}
</Modal>

<!-- Buchung bearbeiten -->
<Modal bind:open={editOpen} title="Buchung bearbeiten">
    {#if editTarget}
        {@const tx = editTarget}
        <form method="post" action="?/updateTransaction" id="tx-edit" class="space-y-4">
            <input type="hidden" name="transactionId" value={tx.id} />

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Datum" required>
                    {#snippet children({ id })}
                        <TextInput {id} name="date" type="date" value={toDateInputValue(tx.date)} required />
                    {/snippet}
                </FormField>
                <FormField label="Betrag" required>
                    {#snippet children({ id })}
                        <TextInput
                            {id}
                            name="amount"
                            inputmode="decimal"
                            value={(tx.amount / 100).toFixed(2).replace(".", ",")}
                            required
                        />
                    {/snippet}
                </FormField>
            </div>

            <FormField label="Richtung">
                {#snippet children({ id })}
                    <select {id} name="direction" class="w-full px-4 py-3 rounded-xl text-sm bg-surface text-fg border border-border-strong shadow-sm">
                        <option value="in" selected={tx.direction === "in"}>Einnahme</option>
                        <option value="out" selected={tx.direction === "out"}>Ausgabe</option>
                    </select>
                {/snippet}
            </FormField>

            <FormField label="Art" required>
                {#snippet children({ id })}
                    <select {id} name="kind" required class="w-full px-4 py-3 rounded-xl text-sm bg-surface text-fg border border-border-strong shadow-sm">
                        {#each data.kinds as kind (kind)}
                            <option value={kind} selected={tx.kind === kind}>{kind}</option>
                        {/each}
                    </select>
                {/snippet}
            </FormField>

            <FormField label="Notiz">
                {#snippet children({ id })}
                    <TextInput {id} name="note" value={tx.note} />
                {/snippet}
            </FormField>
        </form>
    {/if}

    {#snippet footer()}
        <Button variant="secondary" onclick={() => (editOpen = false)}>Abbrechen</Button>
        <Button variant="primary" icon="check-lg" onclick={() => document.forms.namedItem("tx-edit")?.requestSubmit()}>
            Speichern
        </Button>
    {/snippet}
</Modal>

<form method="post" action="?/deleteTransaction" bind:this={deleteForm} class="hidden">
    <input type="hidden" name="transactionId" value={deleteTarget?.id ?? ""} />
</form>

<ConfirmDialog
    bind:open={deleteOpen}
    title="Buchung löschen?"
    message={`Die Buchung über ${deleteTarget ? formatEuro(deleteTarget.amount) : ""} wird dauerhaft entfernt.`}
    confirmLabel="Löschen"
    onconfirm={() => deleteForm?.requestSubmit()}
/>

<Modal bind:open={closeOpen} title="Geschäftsjahr abschließen" size="sm">
    <p class="text-sm text-fg-muted">
        Nach dem Abschluss können keine Buchungen mehr erfasst werden. Der Saldo wird als
        Anfangsbestand ins Folgejahr übernommen.
    </p>
    <form method="post" action="?/close" id="year-close" class="space-y-3">
        <label class="flex items-start gap-3 px-4 py-3 rounded-xl border border-border cursor-pointer">
            <input type="checkbox" name="carryOver" value="1" class="mt-1 rounded border-border-strong" />
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
        <Button variant="warning" icon="lock" onclick={() => document.forms.namedItem("year-close")?.requestSubmit()}>
            Abschließen
        </Button>
    {/snippet}
</Modal>
