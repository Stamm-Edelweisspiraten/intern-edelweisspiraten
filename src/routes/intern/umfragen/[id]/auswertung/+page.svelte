<script lang="ts">
    import {
        Alert,
        Badge,
        Button,
        Card,
        DataTable,
        EmptyState,
        PageHeader,
        StatTile
    } from "$lib/components/ui";
    import type { Column } from "$lib/components/ui";
    import { formatDateTime } from "$lib/format";
    import { isChoiceType } from "$lib/surveys/fields";
    import type { PageData } from "./$types";

    /**
     * Ergebnisse einer Umfrage.
     *
     * Der Balken steht NEBEN der Tabelle, nie an ihrer Stelle: ohne
     * JavaScript und für eine Vorlesehilfe müssen die Zahlen vollständig
     * lesbar bleiben. Deshalb trägt der Balken `aria-hidden` und die Tabelle
     * die Beschriftung -- dieselbe Regel wie bei den Kassendiagrammen, nur
     * ohne Bibliothek: eine Breite in Prozent braucht keine.
     */

    let { data }: { data: PageData } = $props();

    type ResultField = PageData["results"]["fields"][number];
    type CountRow = ResultField["counts"][number];
    type TextRow = ResultField["texts"][number];

    const survey = $derived(data.survey);
    const results = $derived(data.results);

    const STATUS_LABELS = {
        draft: "Entwurf",
        published: "Läuft",
        closed: "Abgeschlossen"
    } as const;

    function percent(share: number): string {
        return `${(share * 100).toLocaleString("de-DE", { maximumFractionDigits: 0 })} %`;
    }

    /** Der Mittelwert einer Skala, auf eine Nachkommastelle. */
    function average(value: number | null): string {
        return value === null
            ? "–"
            : value.toLocaleString("de-DE", {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1
              });
    }

    /**
     * Der Absender eines Freitextes.
     *
     * Ein Name aus dem öffentlichen Link ist eine SELBSTAUSKUNFT: dort gibt
     * es keine Anmeldung und damit keine geprüfte Identität. Er bekommt
     * deshalb einen Zusatz und darf nicht aussehen wie ein Name aus dem
     * Portal -- sonst zählt jemand eine Stimme, die sich beliebig oft
     * abgeben lässt, wie eine bestätigte.
     */
    function author(text: TextRow): string {
        if (!text.author) return "Ohne Absender";
        return text.source === "link" ? `${text.author} (eigene Angabe)` : text.author;
    }

    const countColumns: Column<CountRow>[] = [
        { key: "label", label: "Antwort", value: (row) => row.label },
        { key: "count", label: "Anzahl", align: "right", value: (row) => row.count },
        { key: "share", label: "Anteil", align: "right", value: (row) => percent(row.share) }
    ];
</script>

<svelte:head><title>Auswertung: {survey.title} - Umfragen</title></svelte:head>

{#snippet answerList(entries: TextRow[])}
    <ul class="space-y-3">
        {#each entries as text, index (index)}
            <li class="p-3 rounded-card border border-border">
                <p class="text-sm text-fg whitespace-pre-line">{text.value}</p>
                <p class="mt-1 text-xs text-fg-subtle">
                    {author(text)} · {formatDateTime(text.submittedAt)}
                </p>
            </li>
        {/each}
    </ul>
{/snippet}

<div class="max-w-4xl mx-auto space-y-8">
    <PageHeader
        title="Auswertung"
        eyebrow="Umfrage"
        subtitle={survey.title}
        back={{ href: `/intern/umfragen/${survey.id}`, label: "Zur Umfrage" }}
    >
        {#snippet badge()}
            <Badge tone="neutral" label={STATUS_LABELS[survey.status]} />
            {#if survey.anonymous}
                <Badge tone="info" size="xs" icon="incognito" label="Anonym" />
            {/if}
        {/snippet}

        {#snippet actions()}
            <Button
                href={`/intern/umfragen/${survey.id}/auswertung/export.csv`}
                variant="secondary"
                icon="filetype-csv"
            >
                Als CSV
            </Button>
        {/snippet}
    </PageHeader>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Antworten" value={String(results.responseCount)} icon="inbox" />
        <!--
            Herkunft getrennt: eine Antwort aus dem Portal steht hinter einem
            angemeldeten Zugang, eine über den Link hinter niemandem.
        -->
        <StatTile
            label="Aus dem Portal"
            value={String(results.internCount)}
            icon="person-check"
            hint="Angemeldet abgegeben"
        />
        <StatTile
            label="Über den Link"
            value={String(results.linkCount)}
            icon="link-45deg"
            tone={results.linkCount > 0 ? "warning" : "neutral"}
            hint="Ohne Anmeldung, Identität ungeprüft"
        />
        <StatTile label="Fragen" value={String(results.fields.length)} icon="list-check" />
    </div>

    {#if survey.anonymous}
        <Alert
            tone="info"
            message="Diese Umfrage ist anonym: die Antworten tragen keinen Absender. Vermerkt ist lediglich, wer teilgenommen hat – ohne Bezug zur Antwort."
        />
    {/if}

    {#if results.linkCount > 0}
        <Alert
            tone="warning"
            title="Antworten über den externen Link"
            message="Über den Link kann dieselbe Person mehrfach antworten – ohne Anmeldung gibt es keine verlässliche Identität. Angegebene Namen sind Selbstauskunft und als „(eigene Angabe)“ gekennzeichnet."
        />
    {/if}

    {#if results.responseCount === 0}
        <Card>
            <EmptyState
                icon="inbox"
                title="Noch keine Antwort"
                description="Sobald die erste Antwort eingeht, stehen hier die Auszählung und die Freitexte."
            />
        </Card>
    {:else}
        {#each results.fields as entry (entry.field.id)}
            {#if entry.field.type === "section"}
                <!--
                    Eine Zwischenüberschrift ist keine Frage: eine Karte mit
                    „0 von 12 beantwortet“ behauptete hier eine Auszählung,
                    die es nicht gibt.
                -->
                <div class="pt-4 border-t border-border">
                    <h2 class="text-lg font-bold text-fg">{entry.field.label}</h2>
                    {#if entry.field.help}
                        <p class="mt-1 text-sm text-fg-muted">{entry.field.help}</p>
                    {/if}
                </div>
            {:else}
                <Card
                    title={entry.field.label}
                    subtitle={entry.field.help || undefined}
                    meta={`${entry.answered} von ${entry.responseCount} Antworten beantwortet`}
                >
                    {#if isChoiceType(entry.field.type) || entry.field.type === "scale"}
                        {#if entry.field.type === "scale"}
                            <p class="mb-4 text-sm text-fg">
                                Mittelwert:
                                <span class="font-semibold tabular-figures">
                                    {average(entry.average)}
                                </span>
                                <span class="text-fg-subtle">
                                    aus {entry.answered}
                                    {entry.answered === 1 ? "Angabe" : "Angaben"}
                                </span>
                            </p>
                        {/if}

                        <!--
                            Die Balken sind Schmuck: dieselben Zahlen stehen
                            darunter in der Tabelle.
                        -->
                        <div class="space-y-2 mb-4" aria-hidden="true">
                            {#each entry.counts as row (row.value)}
                                <div class="flex items-center gap-3">
                                    <span class="w-40 shrink-0 text-sm text-fg truncate">
                                        {row.label}
                                    </span>
                                    <span class="flex-1 h-2.5 rounded-control bg-surface-sunken">
                                        <span
                                            class="block h-2.5 rounded-control bg-primary"
                                            style="width: {row.share * 100}%"
                                        ></span>
                                    </span>
                                    <span
                                        class="w-24 shrink-0 text-right text-sm text-fg-muted tabular-figures"
                                    >
                                        {row.count} · {percent(row.share)}
                                    </span>
                                </div>
                            {/each}
                        </div>

                        <DataTable
                            columns={countColumns}
                            rows={entry.counts}
                            getKey={(row) => row.value}
                            caption={`Auszählung zu „${entry.field.label}“`}
                            cardTitle={(row) => row.label}
                            cardSubtitle={(row) => `${row.count} · ${percent(row.share)}`}
                            empty="Keine Auswahl getroffen."
                        />

                        <p class="mt-2 text-xs text-fg-subtle">
                            Der Anteil bezieht sich auf die {entry.answered} Antworten, die diese
                            Frage ausgefüllt haben.
                            {#if entry.field.type === "multi"}
                                Mehrfachnennungen sind möglich, die Summe kann deshalb über 100 %
                                liegen.
                            {/if}
                        </p>

                        {#if entry.otherTexts.length > 0}
                            <!--
                                „Sonstiges“ gehört zur Auszählung oben, ist aber
                                Fließtext. In die Tabelle gemischt vermengte es
                                eine Zählung mit Prosa; deshalb steht es als
                                eigene Liste darunter.
                            -->
                            <div class="mt-4 pt-4 border-t border-border space-y-2">
                                <p class="text-sm font-semibold text-fg-muted">
                                    Angaben unter „Sonstiges“
                                    <span class="text-fg-subtle font-normal tabular-figures">
                                        ({entry.otherTexts.length})
                                    </span>
                                </p>
                                {@render answerList(entry.otherTexts)}
                            </div>
                        {/if}
                    {:else if entry.texts.length === 0}
                        <EmptyState inline title="Diese Frage hat noch niemand ausgefüllt." />
                    {:else}
                        {@render answerList(entry.texts)}
                    {/if}
                </Card>
            {/if}
        {/each}
    {/if}
</div>
