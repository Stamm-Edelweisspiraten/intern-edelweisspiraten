<script lang="ts">
    import { enhance } from "$app/forms";
    import {
        Alert,
        Badge,
        Button,
        Card,
        ConfirmDialog,
        DataTable,
        EmptyState,
        PageHeader
    } from "$lib/components/ui";
    import type { Column } from "$lib/components/ui";
    import { formatDate } from "$lib/format";
    import type { ActionData, PageData } from "./$types";

    /**
     * Übersicht aller sichtbaren Umfragen.
     *
     * Die Schaltflächen je Zeile stehen in `row.canManage` bzw.
     * `row.canResults` -- vom Server je Datensatz entschieden, weil das Recht
     * auch nur für einzelne Gruppen gelten kann.
     */

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type SurveyRow = PageData["surveys"][number];

    let deleteOpen = $state(false);
    let deleteTarget = $state<SurveyRow | null>(null);
    let deleteForm = $state<HTMLFormElement | null>(null);

    /**
     * Die Rückfrage steht EINMAL auf der Seite, nicht je Zeile -- und das
     * versteckte Formular daneben trägt die Kennung, die sie gerade meint.
     */
    function askDelete(row: SurveyRow) {
        deleteTarget = row;
        deleteOpen = true;
    }
    let pending = $state("");

    const STATUS_TONES = { draft: "neutral", published: "success", closed: "info" } as const;
    const STATUS_LABELS = {
        draft: "Entwurf",
        published: "Läuft",
        closed: "Abgeschlossen"
    } as const;

    /** Merkt sich, welche Zeile gerade absendet -- für `loading` am Knopf. */
    function track(key: string) {
        return () => {
            pending = key;
            return async ({ update }: { update: () => Promise<void> }) => {
                await update();
                pending = "";
            };
        };
    }

    function period(row: SurveyRow): string {
        if (row.opensAt && row.closesAt) {
            return `${formatDate(row.opensAt)} – ${formatDate(row.closesAt)}`;
        }
        if (row.opensAt) return `ab ${formatDate(row.opensAt)}`;
        if (row.closesAt) return `bis ${formatDate(row.closesAt)}`;
        return "";
    }

    /** Kurzform der Art: „anonym“ und „mehrfach“ ändern die Regeln spürbar. */
    function traits(row: SurveyRow): string {
        const parts = [row.audience === "member" ? "je Mitglied" : "je Zugang"];
        if (row.anonymous) parts.push("anonym");
        if (row.multiplePerUser) parts.push("mehrfach");
        return parts.join(" · ");
    }
</script>

<svelte:head><title>Umfragen - Intern</title></svelte:head>

{#snippet statusCell(row: SurveyRow)}
    <Badge tone={STATUS_TONES[row.status]} size="xs" label={STATUS_LABELS[row.status]} />
{/snippet}

<div class="space-y-8">
    <PageHeader
        title="Umfragen"
        eyebrow="Beteiligung"
        subtitle="Umfragen und Formulare – anlegen, beantworten und auswerten."
        back={{ href: "/intern/dashboard", label: "Zum Dashboard" }}
    >
        {#snippet badge()}
            <Badge tone="primary" label={`${data.surveys.length} Umfragen`} />
        {/snippet}

        {#snippet actions()}
            {#if data.mayCreate}
                <Button href="/intern/umfragen/neu" variant="primary" icon="plus-circle">
                    Neue Umfrage
                </Button>
            {/if}
        {/snippet}
    </PageHeader>

    {#if form?.error}<Alert tone="danger" message={form.error} />{/if}
    {#if form?.success}<Alert tone="success" message={form.success} />{/if}

    <Card padding="none">
        {#if data.surveys.length === 0}
            <EmptyState
                icon="clipboard-check"
                title="Noch keine Umfrage"
                description="Hier stehen Umfragen und Formulare – etwa die Essenswünsche fürs Lager oder eine Abstimmung über den nächsten Fahrtentermin."
            >
                {#snippet action()}
                    {#if data.mayCreate}
                        <Button
                            href="/intern/umfragen/neu"
                            variant="primary"
                            icon="plus-circle"
                        >
                            Neue Umfrage
                        </Button>
                    {/if}
                {/snippet}
            </EmptyState>
        {:else}
            <DataTable
                columns={[
                    { key: "title", label: "Umfrage", value: (row) => row.title },
                    { key: "status", label: "Status", cell: statusCell },
                    { key: "kind", label: "Art", value: (row) => traits(row) },
                    {
                        key: "fields",
                        label: "Fragen",
                        align: "right",
                        value: (row) => row.fieldCount
                    },
                    {
                        key: "responses",
                        label: "Antworten",
                        align: "right",
                        value: (row) => row.responseCount
                    },
                    { key: "event", label: "Termin", value: (row) => row.eventTitle ?? "" },
                    { key: "period", label: "Zeitraum", value: (row) => period(row) }
                ] satisfies Column<SurveyRow>[]}
                rows={data.surveys}
                getKey={(row) => row.id}
                caption="Alle für dich sichtbaren Umfragen"
                rowHref={(row) => `/intern/umfragen/${row.id}`}
                cardTitle={(row) => row.title}
                cardSubtitle={(row) => STATUS_LABELS[row.status]}
            >
                {#snippet actions(row: SurveyRow)}
                    <Button
                        href={`/intern/umfragen/${row.id}`}
                        variant="ghost"
                        size="sm"
                        icon="box-arrow-in-right"
                    >
                        Öffnen
                    </Button>

                    {#if row.canResults}
                        <Button
                            href={`/intern/umfragen/${row.id}/auswertung`}
                            variant="ghost"
                            size="sm"
                            icon="bar-chart"
                        >
                            Auswertung
                        </Button>
                    {/if}

                    {#if row.canManage}
                        {#if row.status === "draft"}
                            <form method="post" action="?/publish" use:enhance={track(`publish:${row.id}`)}>
                                <input type="hidden" name="surveyId" value={row.id} />
                                <Button
                                    type="submit"
                                    variant="secondary"
                                    size="sm"
                                    icon="send"
                                    loading={pending === `publish:${row.id}`}
                                >
                                    Veröffentlichen
                                </Button>
                            </form>
                        {:else if row.status === "published"}
                            <form method="post" action="?/close" use:enhance={track(`close:${row.id}`)}>
                                <input type="hidden" name="surveyId" value={row.id} />
                                <Button
                                    type="submit"
                                    variant="secondary"
                                    size="sm"
                                    icon="lock"
                                    loading={pending === `close:${row.id}`}
                                >
                                    Schließen
                                </Button>
                            </form>
                        {/if}

                        <Button
                            variant="ghost"
                            size="sm"
                            icon="trash"
                            ariaLabel={`„${row.title}“ löschen`}
                            onclick={() => askDelete(row)}
                        />
                    {/if}
                {/snippet}
            </DataTable>
        {/if}
    </Card>

    <!-- Status-Legende: eine Farbe allein trägt keine Aussage -->
    <div class="flex flex-wrap items-center gap-3 text-xs text-fg-subtle">
        {#each Object.entries(STATUS_LABELS) as [key, label] (key)}
            <span class="inline-flex items-center gap-2">
                <Badge
                    tone={STATUS_TONES[key as keyof typeof STATUS_TONES]}
                    size="xs"
                    {label}
                />
            </span>
        {/each}
        <span>Entwürfe sieht nur, wer die Umfrage verwalten darf.</span>
    </div>
</div>

<ConfirmDialog
    bind:open={deleteOpen}
    title="Umfrage löschen"
    message={deleteTarget
        ? `„${deleteTarget.title}“ wird mit allen ${deleteTarget.responseCount} Antworten dauerhaft entfernt. Eine abgeschlossene Umfrage bleibt sonst als Ergebnis erhalten.`
        : ""}
    confirmLabel="Endgültig löschen"
    onconfirm={() => deleteForm?.requestSubmit()}
    oncancel={() => (deleteTarget = null)}
/>

<form method="post" action="?/delete" bind:this={deleteForm} class="hidden">
    <input type="hidden" name="surveyId" value={deleteTarget?.id ?? ""} />
</form>
