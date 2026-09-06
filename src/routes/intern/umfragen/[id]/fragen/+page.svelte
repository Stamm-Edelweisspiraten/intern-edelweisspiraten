<script lang="ts">
    import { enhance } from "$app/forms";
    import { Alert, Badge, Button, Card, PageHeader } from "$lib/components/ui";
    import FieldEditor from "../../FieldEditor.svelte";
    import type { ActionData, PageData } from "./$types";

    /**
     * Fragen einer bestehenden Umfrage bearbeiten.
     *
     * Derselbe Editor wie im Assistenten -- er steht in `FieldEditor.svelte`
     * eine Ebene höher. Elf Feldtypen ein zweites Mal zu bauen hieße, sie ein
     * zweites Mal falsch zu bauen.
     */

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const survey = $derived(data.survey);

    let pending = $state(false);

    const STATUS_TONES = { draft: "neutral", published: "success", closed: "info" } as const;
    const STATUS_LABELS = {
        draft: "Entwurf",
        published: "Läuft",
        closed: "Abgeschlossen"
    } as const;
</script>

<svelte:head><title>Fragen: {survey.title} - Umfragen</title></svelte:head>

<div class="max-w-4xl mx-auto space-y-8">
    <PageHeader
        title="Fragen bearbeiten"
        eyebrow="Umfrage"
        subtitle={survey.title}
        back={{ href: `/intern/umfragen/${survey.id}`, label: "Zur Umfrage" }}
    >
        {#snippet badge()}
            <Badge tone={STATUS_TONES[survey.status]} label={STATUS_LABELS[survey.status]} />
        {/snippet}
    </PageHeader>

    {#if form?.error}<Alert tone="danger" message={form.error} />{/if}
    {#if form?.success}<Alert tone="success" message={form.success} />{/if}

    <form
        method="post"
        action="?/setFields"
        class="space-y-6"
        use:enhance={() => {
            pending = true;
            return async ({ update }) => {
                await update();
                pending = false;
            };
        }}
    >
        <Card
            title="Fragebogen"
            meta={`${survey.fields.length} gespeicherte ${survey.fields.length === 1 ? "Frage" : "Fragen"}`}
        >
            <!--
                `{#key}` setzt den Editor nach dem Speichern auf den frisch
                geladenen Stand zurück. Sein `$state` entsteht einmal beim
                Einhängen -- ohne den Schlüssel liefe es nach dem Speichern
                neben `data` her und zeigte weiter die alten Zeilen.
            -->
            {#key survey.fields}
                <FieldEditor fields={survey.fields} locked={data.fieldsLocked} />
            {/key}
        </Card>

        <Card>
            <div class="flex flex-wrap items-center justify-between gap-3">
                <p class="text-sm text-fg-muted">
                    {#if data.fieldsLocked}
                        {survey.responseCount}
                        {survey.responseCount === 1 ? "Antwort liegt" : "Antworten liegen"} vor.
                    {:else}
                        Noch keine Antwort – die Fragenliste ist frei änderbar.
                    {/if}
                </p>

                <div class="flex flex-wrap gap-2">
                    <Button href={`/intern/umfragen/${survey.id}`} variant="ghost">
                        Abbrechen
                    </Button>
                    <Button
                        type="submit"
                        variant="primary"
                        icon="check-lg"
                        loading={pending}
                    >
                        Fragen speichern
                    </Button>
                </div>
            </div>
        </Card>
    </form>
</div>
