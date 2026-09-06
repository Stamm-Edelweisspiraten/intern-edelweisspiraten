<script lang="ts">
    import { Alert, Button, Card, FormField, PageHeader, TextInput } from "$lib/components/ui";
    import { formatEuro } from "$lib/money";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const FIELDS = [
        { key: "stamm", label: "Stamm" },
        { key: "gau", label: "Gau" },
        { key: "landesmark", label: "Landesmark" },
        { key: "bund", label: "Bund" }
    ] as const;

    /** Cents als Formularwert in Euro-Schreibweise. */
    const asInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

    let values = $state<Record<string, string>>(
        Object.fromEntries(FIELDS.map((f) => [f.key, asInput(data.defaultDues[f.key])]))
    );

    const total = $derived(
        FIELDS.reduce((sum, f) => {
            const parsed = Number(String(values[f.key]).replace(",", "."));
            return sum + (Number.isFinite(parsed) ? Math.round(parsed * 100) : 0);
        }, 0)
    );
</script>

<svelte:head><title>Neues Geschäftsjahr - Intern</title></svelte:head>

<div class="max-w-2xl mx-auto space-y-8">
    <PageHeader
        title="Neues Geschäftsjahr"
        eyebrow="Kasse"
        subtitle="Lege das Jahr und die Beitragssätze fest."
        back={{ href: "/intern/finance" }}
    />

    {#if form?.error}
        <Alert tone="danger" message={form.error} />
    {/if}

    <Card>
        <form method="post" action="?/create" class="space-y-5">
            <FormField label="Jahr" required>
                {#snippet children({ id, describedBy })}
                    <TextInput
                        {id}
                        {describedBy}
                        name="year"
                        type="number"
                        value={String(data.currentYear)}
                        min={2000}
                        max={data.currentYear + 5}
                        required
                    />
                {/snippet}
            </FormField>

            <fieldset class="space-y-4">
                <legend class="text-sm font-semibold text-fg-muted">Beitragssätze pro Mitglied</legend>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {#each FIELDS as field (field.key)}
                        <FormField label={field.label}>
                            {#snippet children({ id, describedBy })}
                                <TextInput
                                    {id}
                                    {describedBy}
                                    name={`dues_${field.key}`}
                                    inputmode="decimal"
                                    bind:value={values[field.key]}
                                    placeholder="0,00"
                                />
                            {/snippet}
                        </FormField>
                    {/each}
                </div>
                <p class="text-sm text-fg-muted">
                    Gesamtbeitrag: <strong class="text-fg">{formatEuro(total)}</strong>
                </p>
            </fieldset>

            <div class="flex justify-end gap-3 pt-2">
                <Button href="/intern/finance" variant="secondary">Abbrechen</Button>
                <Button type="submit" variant="primary" icon="plus-circle">Anlegen</Button>
            </div>
        </form>
    </Card>
</div>
