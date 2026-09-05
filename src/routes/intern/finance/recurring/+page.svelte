<script lang="ts">
    import {
        Alert,
        Badge,
        Button,
        Card,
        ConfirmDialog,
        DataTable,
        FormField,
        Modal,
        PageHeader,
        Select,
        TextInput
    } from "$lib/components/ui";
    import type { Column } from "$lib/components/ui";
    import FinanceNav from "$lib/components/finance/FinanceNav.svelte";
    import { formatEuro } from "$lib/money";
    import { formatDate, toDateInputValue } from "$lib/format";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type Schedule = PageData["schedules"][number];

    let addOpen = $state(false);
    let direction = $state<"in" | "out">("out");
    let deleteTarget = $state<Schedule | null>(null);
    let deleteOpen = $state(false);
    let deleteForm = $state<HTMLFormElement | null>(null);

    const categoryOptions = $derived(
        data.categories
            .filter((category) => category.direction === direction)
            .map((category) => ({ value: category.id, label: category.name }))
    );
    const bankOptions = $derived(data.bankAccounts.map((b) => ({ value: b.id, label: b.name })));
    const memberOptions = $derived(data.members.map((m) => ({ value: m.id, label: m.name })));

    const INTERVALS = [
        { value: "monthly", label: "monatlich" },
        { value: "quarterly", label: "vierteljährlich" },
        { value: "semiannual", label: "halbjährlich" },
        { value: "annual", label: "jährlich" }
    ];

    const today = new Date();
</script>

<svelte:head><title>Wiederkehrende Buchungen – Kasse</title></svelte:head>

{#snippet nameCell(schedule: Schedule)}
    <div class="flex items-center gap-2 flex-wrap">
        <span class="font-semibold">{schedule.name}</span>
        {#if !schedule.active}
            <Badge tone="neutral" size="xs" label="pausiert" />
        {/if}
    </div>
{/snippet}

{#snippet amountCell(schedule: Schedule)}
    <span
        class={`font-bold tabular-figures ${schedule.direction === "in" ? "text-success" : "text-danger"}`}
    >
        {schedule.direction === "in" ? "+" : "−"}{formatEuro(schedule.amount)}
    </span>
{/snippet}

{#snippet nextCell(schedule: Schedule)}
    {@const due = new Date(schedule.nextRunAt) <= today}
    <span class={due && schedule.active ? "text-warning font-semibold" : ""}>
        {formatDate(schedule.nextRunAt)}
    </span>
    {#if due && schedule.active}
        <Badge tone="warning" size="xs" label="fällig" />
    {/if}
{/snippet}

<div class="space-y-8">
    <PageHeader
        title="Wiederkehrende Buchungen"
        eyebrow="Kasse"
        subtitle="Vorlagen, die in festem Takt automatisch gebucht werden."
        back={{ href: "/intern/finance" }}
    >
        {#snippet actions()}
            <form method="post" action="?/run" class="inline">
                <Button type="submit" variant="secondary" icon="play-circle">
                    Fällige ausführen
                </Button>
            </form>
            <Button variant="primary" icon="plus-circle" onclick={() => (addOpen = true)}>
                Vorlage
            </Button>
        {/snippet}
    </PageHeader>

    <FinanceNav />

    {#if form?.error}<Alert tone="danger" message={form.error} />{/if}
    {#if form?.success}<Alert tone="success" message={form.success} />{/if}

    <Alert
        tone="info"
        message="Fällige Vorlagen laufen beim Start der Anwendung und danach stündlich. Verpasste Termine werden nachgeholt, solange sie ins aktive Geschäftsjahr fallen."
    />

    <Card title="Vorlagen" meta={`${data.schedules.length} gesamt`} padding="none">
        <DataTable
            columns={[
                { key: "name", label: "Bezeichnung", cell: nameCell },
                { key: "interval", label: "Takt", value: (s) => s.intervalLabel },
                { key: "category", label: "Buchungsart", value: (s) => s.categoryName },
                { key: "account", label: "Konto", value: (s) => s.bankAccountName },
                { key: "next", label: "Nächste Fälligkeit", cell: nextCell },
                { key: "runs", label: "Läufe", align: "right", value: (s) => s.runCount },
                { key: "amount", label: "Betrag", align: "right", cell: amountCell }
            ] satisfies Column<Schedule>[]}
            rows={data.schedules}
            getKey={(s) => s.id}
            cardTitle={(s) => s.name}
            cardSubtitle={(s) => `${s.intervalLabel} · ${s.bankAccountName}`}
            rowClass={(s) => (s.active ? "" : "opacity-70")}
            empty="Noch keine wiederkehrenden Buchungen angelegt."
        >
            {#snippet actions(schedule)}
                <form method="post" action="?/toggle" class="inline">
                    <input type="hidden" name="id" value={schedule.id} />
                    <input type="hidden" name="active" value={String(!schedule.active)} />
                    <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        icon={schedule.active ? "pause-circle" : "play-circle"}
                        ariaLabel={schedule.active ? "Vorlage pausieren" : "Vorlage fortsetzen"}
                    />
                </form>
                <Button
                    variant="ghost"
                    size="sm"
                    icon="trash"
                    ariaLabel="Vorlage löschen"
                    onclick={() => {
                        deleteTarget = schedule;
                        deleteOpen = true;
                    }}
                />
            {/snippet}
        </DataTable>
    </Card>
</div>

<Modal bind:open={addOpen} title="Wiederkehrende Buchung anlegen">
    <form method="post" action="?/create" id="recurring-add" class="space-y-4">
        <FormField label="Bezeichnung" required>
            {#snippet children({ id })}
                <TextInput {id} name="name" placeholder="z. B. Miete Gruppenraum" required />
            {/snippet}
        </FormField>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Betrag" required>
                {#snippet children({ id })}
                    <TextInput {id} name="amount" inputmode="decimal" placeholder="120,00" required />
                {/snippet}
            </FormField>
            <FormField label="Takt" required>
                {#snippet children({ id })}
                    <Select {id} name="interval" options={INTERVALS} value="monthly" required />
                {/snippet}
            </FormField>
        </div>

        <FormField label="Richtung">
            {#snippet children({ id })}
                <Select
                    {id}
                    bind:value={direction}
                    options={[
                        { value: "out", label: "Ausgabe" },
                        { value: "in", label: "Einnahme" }
                    ]}
                />
            {/snippet}
        </FormField>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Buchungsart" required>
                {#snippet children({ id })}
                    <Select {id} name="categoryId" options={categoryOptions} required />
                {/snippet}
            </FormField>
            <FormField label="Konto" required>
                {#snippet children({ id })}
                    <Select {id} name="bankAccountId" options={bankOptions} required />
                {/snippet}
            </FormField>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Erste Fälligkeit" required>
                {#snippet children({ id })}
                    <TextInput
                        {id}
                        name="startDate"
                        type="date"
                        value={toDateInputValue(new Date())}
                        required
                    />
                {/snippet}
            </FormField>
            <FormField label="Ende" hint="Leer lassen für unbefristet.">
                {#snippet children({ id })}
                    <TextInput {id} name="endDate" type="date" />
                {/snippet}
            </FormField>
        </div>

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
                <TextInput {id} name="note" placeholder="Erscheint als Buchungstext" />
            {/snippet}
        </FormField>
    </form>

    {#snippet footer()}
        <Button variant="secondary" onclick={() => (addOpen = false)}>Abbrechen</Button>
        <Button
            variant="primary"
            icon="check-lg"
            onclick={() => document.forms.namedItem("recurring-add")?.requestSubmit()}
        >
            Anlegen
        </Button>
    {/snippet}
</Modal>

<form method="post" action="?/delete" bind:this={deleteForm} class="hidden">
    <input type="hidden" name="id" value={deleteTarget?.id ?? ""} />
</form>

<ConfirmDialog
    bind:open={deleteOpen}
    title="Vorlage löschen?"
    message={`„${deleteTarget?.name ?? ""}“ wird entfernt. Bereits erzeugte Buchungen bleiben bestehen.`}
    confirmLabel="Löschen"
    tone="danger"
    onconfirm={() => deleteForm?.requestSubmit()}
    oncancel={() => (deleteTarget = null)}
/>
