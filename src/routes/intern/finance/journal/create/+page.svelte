<script lang="ts">
    import {
        Alert,
        Button,
        Card,
        FormField,
        PageHeader,
        Select,
        TextInput
    } from "$lib/components/ui";
    import { formatEuro, parseEuro } from "$lib/money";
    import { toDateInputValue } from "$lib/format";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    interface Row {
        accountId: string;
        debit: string;
        credit: string;
        memberId: string;
        note: string;
    }

    function emptyRow(): Row {
        return { accountId: "", debit: "", credit: "", memberId: "", note: "" };
    }

    let rows = $state<Row[]>([emptyRow(), emptyRow()]);

    const accountOptions = $derived(
        data.accounts.map((account) => ({ value: account.id, label: account.label }))
    );
    const memberOptions = $derived(
        data.members.map((member) => ({ value: member.id, label: member.name }))
    );
    const yearOptions = $derived(
        data.years.map((year) => ({ value: year.id, label: String(year.year) }))
    );

    /**
     * Live-Anzeige der Differenz. Der Server prüft dasselbe noch einmal, und
     * die Datenbank ein drittes Mal — hier geht es nur darum, dass niemand
     * ein Formular abschickt, das ohnehin abgewiesen wird.
     */
    const totals = $derived.by(() => {
        let debit = 0;
        let credit = 0;
        for (const row of rows) {
            debit += parseEuro(row.debit) ?? 0;
            credit += parseEuro(row.credit) ?? 0;
        }
        return { debit, credit, difference: debit - credit };
    });

    const balanced = $derived(totals.difference === 0 && totals.debit > 0);

    function addRow() {
        rows = [...rows, emptyRow()];
    }

    function removeRow(index: number) {
        if (rows.length <= 2) return;
        rows = rows.filter((_, i) => i !== index);
    }
</script>

<svelte:head><title>Freier Buchungssatz – Kasse</title></svelte:head>

<div class="space-y-8">
    <PageHeader
        title="Freier Buchungssatz"
        eyebrow="Kasse"
        subtitle="Beliebig viele Zeilen mit Soll und Haben. Die Summen müssen übereinstimmen."
        back={{ href: "/intern/finance/journal" }}
    />

    {#if form?.error}<Alert tone="danger" message={form.error} />{/if}

    {#if data.years.length === 0}
        <Alert
            tone="warning"
            message="Es gibt kein aktives Geschäftsjahr. Ohne aktives Jahr kann nicht gebucht werden."
        />
    {:else}
        <form method="post" class="space-y-8">
            <input type="hidden" name="lines" value={JSON.stringify(rows)} />

            <Card title="Beleg">
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <FormField label="Geschäftsjahr" required>
                        {#snippet children({ id })}
                            <Select
                                {id}
                                name="fiscalYearId"
                                options={yearOptions}
                                value={data.selectedYear?.id ?? ""}
                                required
                            />
                        {/snippet}
                    </FormField>
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
                    <FormField label="Buchungstext" required>
                        {#snippet children({ id })}
                            <TextInput
                                {id}
                                name="description"
                                placeholder="z. B. Umbuchung Rücklage"
                                required
                            />
                        {/snippet}
                    </FormField>
                </div>
            </Card>

            <Card title="Zeilen" meta={`${rows.length} Zeilen`}>
                {#snippet actions()}
                    <Button variant="secondary" size="sm" icon="plus-lg" onclick={addRow}>
                        Zeile
                    </Button>
                {/snippet}

                <div class="space-y-4">
                    {#each rows as row, index (index)}
                        <div
                            class="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end border border-border rounded-card p-4"
                        >
                            <div class="lg:col-span-4">
                                <FormField label={`Konto ${index + 1}`}>
                                    {#snippet children({ id })}
                                        <Select
                                            {id}
                                            bind:value={rows[index].accountId}
                                            options={accountOptions}
                                            placeholder="– Konto wählen –"
                                        />
                                    {/snippet}
                                </FormField>
                            </div>

                            <div class="lg:col-span-2">
                                <FormField label="Soll">
                                    {#snippet children({ id })}
                                        <TextInput
                                            {id}
                                            inputmode="decimal"
                                            bind:value={rows[index].debit}
                                            placeholder="0,00"
                                        />
                                    {/snippet}
                                </FormField>
                            </div>

                            <div class="lg:col-span-2">
                                <FormField label="Haben" hint={index === 0 ? "Je Zeile nur eines von beidem." : undefined}>
                                    {#snippet children({ id })}
                                        <TextInput
                                            {id}
                                            inputmode="decimal"
                                            bind:value={rows[index].credit}
                                            placeholder="0,00"
                                        />
                                    {/snippet}
                                </FormField>
                            </div>

                            <div class="lg:col-span-3">
                                <FormField label="Mitglied">
                                    {#snippet children({ id })}
                                        <Select
                                            {id}
                                            bind:value={rows[index].memberId}
                                            options={memberOptions}
                                            placeholder="– keines –"
                                        />
                                    {/snippet}
                                </FormField>
                            </div>

                            <div class="lg:col-span-1 flex justify-end">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    icon="trash"
                                    ariaLabel={`Zeile ${index + 1} entfernen`}
                                    disabled={rows.length <= 2}
                                    onclick={() => removeRow(index)}
                                />
                            </div>
                        </div>
                    {/each}
                </div>

                {#snippet footer()}
                    <div class="flex items-center gap-6 flex-wrap w-full justify-end">
                        <dl class="flex items-center gap-6 text-sm">
                            <div class="text-right">
                                <dt class="text-xs text-fg-subtle uppercase tracking-wide">Soll</dt>
                                <dd class="font-bold tabular-figures">{formatEuro(totals.debit)}</dd>
                            </div>
                            <div class="text-right">
                                <dt class="text-xs text-fg-subtle uppercase tracking-wide">Haben</dt>
                                <dd class="font-bold tabular-figures">
                                    {formatEuro(totals.credit)}
                                </dd>
                            </div>
                            <div class="text-right">
                                <dt class="text-xs text-fg-subtle uppercase tracking-wide">
                                    Differenz
                                </dt>
                                <dd
                                    class={`font-bold tabular-figures ${balanced ? "text-success" : "text-danger"}`}
                                >
                                    {formatEuro(totals.difference)}
                                </dd>
                            </div>
                        </dl>
                        <Button type="submit" variant="primary" icon="check-lg" disabled={!balanced}>
                            Buchen
                        </Button>
                    </div>
                {/snippet}
            </Card>
        </form>
    {/if}
</div>
