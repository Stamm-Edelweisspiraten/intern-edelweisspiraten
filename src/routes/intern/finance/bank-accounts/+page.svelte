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
        TextInput
    } from "$lib/components/ui";
    import type { Column } from "$lib/components/ui";
    import FinanceNav from "$lib/components/finance/FinanceNav.svelte";
    import { formatEuro } from "$lib/money";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type Account = PageData["accounts"][number];

    let addOpen = $state(false);
    let editTarget = $state<Account | null>(null);
    let editOpen = $state(false);
    let deleteTarget = $state<Account | null>(null);
    let deleteOpen = $state(false);
    let deleteForm = $state<HTMLFormElement | null>(null);

    function euroValue(cents: number): string {
        return (cents / 100).toFixed(2).replace(".", ",");
    }

    function formatIban(iban: string): string {
        return iban.replace(/(.{4})/g, "$1 ").trim();
    }
</script>

<svelte:head><title>Konten – Kasse</title></svelte:head>

{#snippet nameCell(account: Account)}
    <div class="flex items-center gap-2 flex-wrap">
        <a
            href={`/intern/finance/bank-accounts/${account.id}`}
            class="font-semibold hover:text-primary transition">{account.name}</a
        >
        {#if account.isCash}
            <Badge tone="info" size="xs" label="Barkasse" />
        {/if}
        {#if !account.active}
            <Badge tone="neutral" size="xs" label="inaktiv" />
        {/if}
    </div>
{/snippet}

{#snippet balanceCell(account: Account)}
    <span class={`font-bold tabular-figures ${account.balance < 0 ? "text-danger" : "text-fg"}`}>
        {formatEuro(account.balance)}
    </span>
{/snippet}

<div class="space-y-8">
    <PageHeader
        title="Kassen- und Bankkonten"
        eyebrow="Kasse"
        subtitle="Kontostände ergeben sich aus den Buchungen, sie werden nicht separat geführt."
        back={{ href: "/intern/finance" }}
    >
        {#snippet actions()}
            {#if data.canManage}
                <Button variant="primary" icon="plus-circle" onclick={() => (addOpen = true)}>
                    Konto
                </Button>
            {/if}
        {/snippet}
    </PageHeader>

    <FinanceNav />

    {#if form?.error}<Alert tone="danger" message={form.error} />{/if}
    {#if form?.success}<Alert tone="success" message={form.success} />{/if}

    <Card title="Konten" padding="none">
        <DataTable
            columns={[
                { key: "name", label: "Konto", cell: nameCell },
                { key: "ledger", label: "Sachkonto", value: (a) => a.accountNumber },
                { key: "iban", label: "IBAN", value: (a) => (a.iban ? formatIban(a.iban) : "–") },
                {
                    key: "opening",
                    label: "Anfangsbestand",
                    align: "right",
                    value: (a) => formatEuro(a.openingBalance)
                },
                { key: "balance", label: "Kontostand", align: "right", cell: balanceCell }
            ] satisfies Column<Account>[]}
            rows={data.accounts}
            getKey={(a) => a.id}
            cardTitle={(a) => a.name}
            cardSubtitle={(a) => (a.iban ? formatIban(a.iban) : a.accountNumber)}
            rowClass={(a) => (a.active ? "" : "opacity-70")}
            empty="Noch kein Konto eingerichtet."
        >
            {#snippet actions(account)}
                <Button
                    href={`/intern/finance/bank-accounts/${account.id}`}
                    variant="secondary"
                    size="sm"
                    icon="list-ul"
                    ariaLabel="Bewegungen anzeigen"
                />
                {#if data.canManage}
                    <Button
                        variant="ghost"
                        size="sm"
                        icon="pencil"
                        ariaLabel="Konto bearbeiten"
                        onclick={() => {
                            editTarget = account;
                            editOpen = true;
                        }}
                    />
                    <form method="post" action="?/toggle" class="inline">
                        <input type="hidden" name="id" value={account.id} />
                        <input type="hidden" name="active" value={String(!account.active)} />
                        <Button
                            type="submit"
                            variant="ghost"
                            size="sm"
                            icon={account.active ? "toggle-on" : "toggle-off"}
                            ariaLabel={account.active ? "Konto deaktivieren" : "Konto aktivieren"}
                        />
                    </form>
                    <Button
                        variant="ghost"
                        size="sm"
                        icon="trash"
                        ariaLabel="Konto löschen"
                        onclick={() => {
                            deleteTarget = account;
                            deleteOpen = true;
                        }}
                    />
                {/if}
            {/snippet}
        </DataTable>
    </Card>
</div>

{#snippet accountFields(account: Account | null)}
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Name" required>
            {#snippet children({ id })}
                <TextInput {id} name="name" value={account?.name ?? ""} placeholder="Girokonto" required />
            {/snippet}
        </FormField>
        <FormField label="Kontoinhaber">
            {#snippet children({ id })}
                <TextInput {id} name="accountHolder" value={account?.accountHolder ?? ""} />
            {/snippet}
        </FormField>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="IBAN" hint="Wird auf Prüfziffer geprüft.">
            {#snippet children({ id })}
                <TextInput {id} name="iban" value={account?.iban ?? ""} placeholder="DE89 3704 …" />
            {/snippet}
        </FormField>
        <FormField label="BIC">
            {#snippet children({ id })}
                <TextInput {id} name="bic" value={account?.bic ?? ""} />
            {/snippet}
        </FormField>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Bank">
            {#snippet children({ id })}
                <TextInput {id} name="bankName" value={account?.bankName ?? ""} />
            {/snippet}
        </FormField>
        <FormField label="Anfangsbestand" hint="Stand vor der ersten Buchung.">
            {#snippet children({ id })}
                <TextInput
                    {id}
                    name="openingBalance"
                    inputmode="decimal"
                    value={euroValue(account?.openingBalance ?? 0)}
                />
            {/snippet}
        </FormField>
    </div>
{/snippet}

<Modal bind:open={addOpen} title="Konto anlegen">
    <form method="post" action="?/create" id="bank-add" class="space-y-4">
        {@render accountFields(null)}

        <label class="flex items-start gap-3 px-4 py-3 rounded-control border border-border cursor-pointer">
            <input type="checkbox" name="isCash" class="mt-1 border-border-strong" />
            <span class="text-sm text-fg">
                Barkasse
                <span class="block text-xs text-fg-subtle">Konto ohne Bankverbindung.</span>
            </span>
        </label>
    </form>

    {#snippet footer()}
        <Button variant="secondary" onclick={() => (addOpen = false)}>Abbrechen</Button>
        <Button
            variant="primary"
            icon="check-lg"
            onclick={() => document.forms.namedItem("bank-add")?.requestSubmit()}
        >
            Anlegen
        </Button>
    {/snippet}
</Modal>

<Modal bind:open={editOpen} title="Konto bearbeiten">
    {#if editTarget}
        <form method="post" action="?/update" id="bank-edit" class="space-y-4">
            <input type="hidden" name="id" value={editTarget.id} />
            {@render accountFields(editTarget)}
        </form>
    {/if}

    {#snippet footer()}
        <Button variant="secondary" onclick={() => (editOpen = false)}>Abbrechen</Button>
        <Button
            variant="primary"
            icon="check-lg"
            onclick={() => document.forms.namedItem("bank-edit")?.requestSubmit()}
        >
            Speichern
        </Button>
    {/snippet}
</Modal>

<form method="post" action="?/delete" bind:this={deleteForm} class="hidden">
    <input type="hidden" name="id" value={deleteTarget?.id ?? ""} />
</form>

<ConfirmDialog
    bind:open={deleteOpen}
    title="Konto löschen?"
    message={`Das Konto „${deleteTarget?.name ?? ""}“ wird entfernt. Bebuchte Konten können nur deaktiviert werden.`}
    confirmLabel="Löschen"
    tone="danger"
    onconfirm={() => deleteForm?.requestSubmit()}
    oncancel={() => (deleteTarget = null)}
/>
