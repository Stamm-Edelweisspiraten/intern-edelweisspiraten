<script lang="ts">
    import { Alert, Button, Card, FormField, PageHeader, StatTile, TextInput } from "$lib/components/ui";
    import { formatEuro } from "$lib/money";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type LevelKey = keyof PageData["finance"]["contributions"];

    /**
     * Das Formular ging bisher an die Standard-Aktion (die es nicht gibt) und
     * benannte die Felder „stamm“ statt „contrib_stamm“ — Speichern war damit
     * wirkungslos.
     *
     * Beträge werden wie überall in Euro eingegeben und serverseitig in ganze
     * Cents umgerechnet.
     */
    const LEVELS: { key: LevelKey; label: string }[] = [
        { key: "stamm", label: "Stamm" },
        { key: "gau", label: "Gau (Bremen)" },
        { key: "landesmark", label: "Landesmark (Achtern Diek)" },
        { key: "bund", label: "Bund (Christliche Pfadfinderschaft Deutschlands e.V.)" }
    ];

    const asEuroInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

    let contributions = $state<Record<string, string>>(
        Object.fromEntries(LEVELS.map((l) => [l.key, asEuroInput(data.finance.contributions[l.key])]))
    );

    const total = $derived(
        LEVELS.reduce((sum, level) => {
            const parsed = Number(String(contributions[level.key]).replace(",", "."));
            return sum + (Number.isFinite(parsed) ? Math.round(parsed * 100) : 0);
        }, 0)
    );
</script>

<svelte:head><title>Einstellungen - Adminbereich</title></svelte:head>

<div class="space-y-8">
    <PageHeader
        title="Einstellungen"
        eyebrow="Adminbereich"
        subtitle="Beitragssätze und Bankverbindung der Kasse."
        back={{ href: "/intern/admin" }}
    />

    {#if form?.error}<Alert tone="danger" message={form.error} />{/if}
    {#if form?.success}<Alert tone="success" message={form.success} />{/if}

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatTile label="Jahresbeitrag gesamt" value={formatEuro(total)} tone="primary" icon="cash-coin" />
        <StatTile
            label="Zuletzt geändert"
            value={data.finance.updatedAt
                ? new Date(data.finance.updatedAt).toLocaleDateString("de-DE")
                : "–"}
            hint={data.finance.updatedBy ?? undefined}
            tone="neutral"
            icon="clock-history"
        />
    </div>

    <form method="post" action="?/updateFinance" class="space-y-8">
        <Card
            title="Beitragssätze"
            subtitle="Gelten als Vorgabe für neu angelegte Geschäftsjahre."
        >
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                {#each LEVELS as level (level.key)}
                    <FormField label={level.label}>
                        {#snippet children({ id, describedBy })}
                            <TextInput
                                {id}
                                {describedBy}
                                name={`contrib_${level.key}`}
                                inputmode="decimal"
                                placeholder="0,00"
                                bind:value={contributions[level.key]}
                                disabled={!data.canUpdate}
                            />
                        {/snippet}
                    </FormField>
                {/each}
            </div>
        </Card>

        <Card
            title="Bankverbindung"
            subtitle="Wird auf Beitragsbescheiden und Zahlungsaufforderungen ausgewiesen."
        >
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Kontoinhaber" class="md:col-span-2">
                    {#snippet children({ id, describedBy })}
                        <TextInput
                            {id}
                            {describedBy}
                            name="bank_accountHolder"
                            value={data.finance.bank.accountHolder}
                            placeholder="Name des Kontoinhabers"
                            disabled={!data.canUpdate}
                        />
                    {/snippet}
                </FormField>

                <FormField label="IBAN" hint="Wird beim Speichern auf Gültigkeit geprüft.">
                    {#snippet children({ id, describedBy })}
                        <TextInput
                            {id}
                            {describedBy}
                            name="bank_iban"
                            value={data.finance.bank.iban}
                            placeholder="DE00 0000 0000 0000 0000 00"
                            disabled={!data.canUpdate}
                        />
                    {/snippet}
                </FormField>

                <FormField label="BIC">
                    {#snippet children({ id, describedBy })}
                        <TextInput
                            {id}
                            {describedBy}
                            name="bank_bic"
                            value={data.finance.bank.bic}
                            disabled={!data.canUpdate}
                        />
                    {/snippet}
                </FormField>

                <FormField label="Kreditinstitut">
                    {#snippet children({ id, describedBy })}
                        <TextInput
                            {id}
                            {describedBy}
                            name="bank_bankName"
                            value={data.finance.bank.bankName}
                            disabled={!data.canUpdate}
                        />
                    {/snippet}
                </FormField>

                <FormField label="Gläubiger-Identifikationsnummer" hint="Optional, für SEPA-Lastschriften.">
                    {#snippet children({ id, describedBy })}
                        <TextInput
                            {id}
                            {describedBy}
                            name="bank_creditorId"
                            value={data.finance.bank.creditorId}
                            disabled={!data.canUpdate}
                        />
                    {/snippet}
                </FormField>
            </div>
        </Card>

        {#if data.canUpdate}
            <div class="flex justify-end">
                <Button type="submit" variant="primary" icon="check-lg">Speichern</Button>
            </div>
        {/if}
    </form>
</div>
