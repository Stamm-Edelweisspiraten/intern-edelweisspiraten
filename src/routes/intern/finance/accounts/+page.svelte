<script lang="ts">
    import {
        Alert,
        Badge,
        Button,
        Card,
        ConfirmDialog,
        DataTable,
        EmptyState,
        FormField,
        Modal,
        PageHeader,
        SearchInput,
        Select,
        TextInput
    } from "$lib/components/ui";
    import type { Column } from "$lib/components/ui";
    import FinanceNav from "$lib/components/finance/FinanceNav.svelte";
    import {
        ACCOUNT_TYPES,
        ACCOUNT_TYPE_LABELS,
        ACCOUNT_TYPE_TONES,
        SPHERES,
        SPHERE_LABELS
    } from "$lib/finance/labels";
    import { formatEuro } from "$lib/money";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type Account = PageData["accounts"][number];

    let search = $state("");
    let addOpen = $state(false);
    let editTarget = $state<Account | null>(null);
    let editOpen = $state(false);
    let deleteTarget = $state<Account | null>(null);
    let deleteOpen = $state(false);
    let deleteForm = $state<HTMLFormElement | null>(null);

    const typeOptions = ACCOUNT_TYPES.map((type) => ({
        value: type,
        label: ACCOUNT_TYPE_LABELS[type]
    }));
    const sphereOptions = SPHERES.map((sphere) => ({
        value: sphere,
        label: SPHERE_LABELS[sphere]
    }));

    const filtered = $derived(
        data.accounts.filter((account) => {
            const needle = search.trim().toLowerCase();
            if (!needle) return true;
            return `${account.number} ${account.name} ${ACCOUNT_TYPE_LABELS[account.type]}`
                .toLowerCase()
                .includes(needle);
        })
    );

    function askEdit(account: Account) {
        editTarget = account;
        editOpen = true;
    }

    function askDelete(account: Account) {
        deleteTarget = account;
        deleteOpen = true;
    }
</script>

<svelte:head><title>Kontenplan – Kasse</title></svelte:head>

{#snippet numberCell(account: Account)}
    <div class="flex items-center gap-2 flex-wrap">
        <a
            href={`/intern/finance/accounts/${account.id}`}
            class="font-semibold tabular-figures hover:text-primary transition">{account.number}</a
        >
        {#if !account.active}
            <Badge tone="neutral" size="xs" label="inaktiv" />
        {/if}
        {#if account.isBank}
            <Badge tone="info" size="xs" label="Bank" />
        {/if}
    </div>
{/snippet}

{#snippet typeCell(account: Account)}
    <Badge
        tone={ACCOUNT_TYPE_TONES[account.type]}
        size="xs"
        label={ACCOUNT_TYPE_LABELS[account.type]}
    />
{/snippet}

{#snippet balanceCell(account: Account)}
    <span class={`font-semibold tabular-figures ${account.balance < 0 ? "text-danger" : "text-fg"}`}>
        {formatEuro(account.balance)}
    </span>
{/snippet}

<div class="space-y-8">
    <PageHeader
        title="Kontenplan"
        eyebrow="Kasse"
        subtitle="Sachkonten und Buchungsarten des Vereins."
        back={{ href: "/intern/finance" }}
    >
        {#snippet actions()}
            <SearchInput bind:value={search} placeholder="Konto suchen..." label="Konto suchen" />
            {#if data.canManage && data.seeded}
                <Button variant="primary" icon="plus-circle" onclick={() => (addOpen = true)}>
                    Konto
                </Button>
            {/if}
        {/snippet}
    </PageHeader>

    <FinanceNav />

    {#if form?.error}<Alert tone="danger" message={form.error} />{/if}
    {#if form?.success}<Alert tone="success" message={form.success} />{/if}

    {#if !data.seeded}
        <Card>
            <EmptyState
                icon="list-columns"
                title="Noch kein Kontenrahmen angelegt"
                description="Der mitgelieferte Vereins-Kontenrahmen orientiert sich an SKR49 und deckt ideellen Bereich, Vermögensverwaltung, Zweckbetrieb und wirtschaftlichen Geschäftsbetrieb ab. Er ist frei erweiterbar."
            >
                {#snippet action()}
                    {#if data.canManage}
                        <form method="post" action="?/seed">
                            <Button type="submit" variant="primary" icon="magic">
                                Kontenrahmen anlegen
                            </Button>
                        </form>
                    {/if}
                {/snippet}
            </EmptyState>
        </Card>
    {:else}
        <Card title="Konten" meta={`${filtered.length} von ${data.accounts.length}`} padding="none">
            <DataTable
                columns={[
                    { key: "number", label: "Nummer", cell: numberCell },
                    { key: "name", label: "Bezeichnung", value: (a) => a.name },
                    { key: "type", label: "Art", cell: typeCell },
                    { key: "sphere", label: "Bereich", value: (a) => SPHERE_LABELS[a.sphere] },
                    { key: "balance", label: "Saldo", align: "right", cell: balanceCell }
                ] satisfies Column<Account>[]}
                rows={filtered}
                getKey={(a) => a.id}
                cardTitle={(a) => `${a.number} ${a.name}`}
                cardSubtitle={(a) => ACCOUNT_TYPE_LABELS[a.type]}
                rowClass={(a) => (a.active ? "" : "opacity-70")}
                empty={search ? "Kein passendes Konto gefunden." : "Noch keine Konten angelegt."}
            >
                {#snippet actions(account)}
                    <Button
                        href={`/intern/finance/accounts/${account.id}`}
                        variant="secondary"
                        size="sm"
                        icon="journal-text"
                        ariaLabel="Kontenblatt öffnen"
                    />
                    {#if data.canManage}
                        <Button
                            variant="ghost"
                            size="sm"
                            icon="pencil"
                            ariaLabel="Konto bearbeiten"
                            onclick={() => askEdit(account)}
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
                        {#if !account.system}
                            <Button
                                variant="ghost"
                                size="sm"
                                icon="trash"
                                ariaLabel="Konto löschen"
                                onclick={() => askDelete(account)}
                            />
                        {/if}
                    {/if}
                {/snippet}
            </DataTable>
        </Card>

        <Card
            title="Buchungsarten"
            subtitle="Bestimmen das Gegenkonto in der einfachen Erfassungsmaske."
            padding="none"
        >
            <DataTable
                columns={[
                    { key: "name", label: "Bezeichnung", value: (c) => c.name },
                    {
                        key: "direction",
                        label: "Richtung",
                        value: (c) => (c.direction === "in" ? "Einnahme" : "Ausgabe")
                    },
                    {
                        key: "account",
                        label: "Gegenkonto",
                        value: (c) => `${c.accountNumber} ${c.accountName}`
                    }
                ] satisfies Column<PageData["categories"][number]>[]}
                rows={data.categories}
                getKey={(c) => c.id}
                cardTitle={(c) => c.name}
                cardSubtitle={(c) => `${c.accountNumber} ${c.accountName}`}
                rowClass={(c) => (c.active ? "" : "opacity-70")}
                empty="Noch keine Buchungsarten angelegt."
            />
        </Card>
    {/if}
</div>

<Modal bind:open={addOpen} title="Konto anlegen">
    <form method="post" action="?/create" id="account-add" class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Nummer" required hint="3 bis 6 Ziffern.">
                {#snippet children({ id })}
                    <TextInput {id} name="number" inputmode="numeric" placeholder="4130" required />
                {/snippet}
            </FormField>
            <FormField label="Bezeichnung" required>
                {#snippet children({ id })}
                    <TextInput {id} name="name" placeholder="Bußgelder" required />
                {/snippet}
            </FormField>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Kontoart" required>
                {#snippet children({ id })}
                    <Select {id} name="type" options={typeOptions} required />
                {/snippet}
            </FormField>
            <FormField label="Bereich">
                {#snippet children({ id })}
                    <Select {id} name="sphere" options={sphereOptions} />
                {/snippet}
            </FormField>
        </div>

        <FormField label="Beschreibung">
            {#snippet children({ id })}
                <TextInput {id} name="description" placeholder="Optional" />
            {/snippet}
        </FormField>
    </form>

    {#snippet footer()}
        <Button variant="secondary" onclick={() => (addOpen = false)}>Abbrechen</Button>
        <Button
            variant="primary"
            icon="check-lg"
            onclick={() => document.forms.namedItem("account-add")?.requestSubmit()}
        >
            Anlegen
        </Button>
    {/snippet}
</Modal>

<Modal bind:open={editOpen} title="Konto bearbeiten">
    {#if editTarget}
        {@const account = editTarget}
        <form method="post" action="?/update" id="account-edit" class="space-y-4">
            <input type="hidden" name="id" value={account.id} />

            {#if account.system}
                <Alert
                    tone="info"
                    message="Nummer und Kontoart eines mitgelieferten Kontos bleiben unverändert — die Geschäftslogik sucht diese Konten über ihre Nummer."
                />
            {/if}

            <FormField label="Bezeichnung" required>
                {#snippet children({ id })}
                    <TextInput {id} name="name" value={account.name} required />
                {/snippet}
            </FormField>

            <FormField label="Bereich">
                {#snippet children({ id })}
                    <Select {id} name="sphere" options={sphereOptions} value={account.sphere} />
                {/snippet}
            </FormField>

            <FormField label="Beschreibung">
                {#snippet children({ id })}
                    <TextInput {id} name="description" value={account.description} />
                {/snippet}
            </FormField>
        </form>
    {/if}

    {#snippet footer()}
        <Button variant="secondary" onclick={() => (editOpen = false)}>Abbrechen</Button>
        <Button
            variant="primary"
            icon="check-lg"
            onclick={() => document.forms.namedItem("account-edit")?.requestSubmit()}
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
    message={`Das Konto ${deleteTarget?.number ?? ""} ${deleteTarget?.name ?? ""} wird entfernt. Bebuchte Konten können nur deaktiviert werden.`}
    confirmLabel="Löschen"
    tone="danger"
    onconfirm={() => deleteForm?.requestSubmit()}
    oncancel={() => (deleteTarget = null)}
/>
