<script lang="ts">
    import {
        Alert,
        Badge,
        Button,
        Card,
        ConfirmDialog,
        EmptyState,
        FormField,
        Modal,
        PageHeader,
        TextInput
    } from "$lib/components/ui";
    import { formatDateTime } from "$lib/format";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let editOpen = $state(false);
    let shareOpen = $state(false);
    let cancelOpen = $state(false);
    let deleteOpen = $state(false);
    let cancelForm = $state<HTMLFormElement | null>(null);
    let deleteForm = $state<HTMLFormElement | null>(null);

    const entry = $derived(data.event);

    const RESPONSE_LABELS = { yes: "Zusage", no: "Absage", maybe: "Vielleicht" } as const;
    const RESPONSE_TONES = { yes: "success", no: "danger", maybe: "warning" } as const;

    function formatSpan(): string {
        const start = new Date(entry.startsAt);

        if (entry.allDay) {
            const day = start.toLocaleDateString("de-DE", {
                weekday: "long",
                day: "2-digit",
                month: "long",
                year: "numeric"
            });
            if (!entry.endsAt || entry.endsAt.slice(0, 10) === entry.startsAt.slice(0, 10)) {
                return `${day}, ganztägig`;
            }
            return `${day} bis ${new Date(entry.endsAt).toLocaleDateString("de-DE")}, ganztägig`;
        }

        const full = start.toLocaleString("de-DE", {
            weekday: "long",
            day: "2-digit",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });

        if (!entry.endsAt) return `${full} Uhr`;

        const end = new Date(entry.endsAt);
        const sameDay = entry.endsAt.slice(0, 10) === entry.startsAt.slice(0, 10);

        return sameDay
            ? `${full} – ${end.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`
            : `${full} Uhr bis ${end.toLocaleString("de-DE")} Uhr`;
    }

    /** Für das Bearbeitungsformular: ISO ohne Zeitzone und ohne Sekunden. */
    function forInput(iso: string | null): string {
        if (!iso) return "";
        const date = new Date(iso);
        const pad = (value: number) => String(value).padStart(2, "0");
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    const sharedIds = $derived(new Set(entry.shares.map((share) => share.targetId)));
    const total = $derived(entry.counts.yes + entry.counts.no + entry.counts.maybe);
</script>

<svelte:head><title>{entry.title} - Termine</title></svelte:head>

<div class="max-w-4xl mx-auto space-y-8">
    <PageHeader
        title={entry.title}
        eyebrow="Termin"
        subtitle={formatSpan()}
        back={{ href: "/intern/termine", label: "Zur Übersicht" }}
    >
        {#snippet badge()}
            {#if entry.status === "cancelled"}
                <Badge tone="danger" label="Abgesagt" />
            {:else if entry.status === "draft"}
                <Badge tone="neutral" label="Entwurf" />
            {/if}
        {/snippet}

        {#snippet actions()}
            {#if data.canManage}
                <Button
                    href={`/intern/termine/${entry.id}/teilnehmer.pdf`}
                    variant="secondary"
                    icon="file-earmark-pdf"
                >
                    Teilnehmerliste
                </Button>
                <Button variant="secondary" icon="pencil" onclick={() => (editOpen = true)}>
                    Bearbeiten
                </Button>
                <Button variant="secondary" icon="share" onclick={() => (shareOpen = true)}>
                    Freigaben
                </Button>
                {#if entry.status !== "cancelled"}
                    <Button
                        variant="ghost"
                        icon="x-circle"
                        onclick={() => (cancelOpen = true)}
                    >
                        Absagen
                    </Button>
                {/if}
                <Button
                    variant="ghost"
                    icon="trash"
                    ariaLabel="Termin löschen"
                    onclick={() => (deleteOpen = true)}
                />
            {/if}
        {/snippet}
    </PageHeader>

    {#if form?.error}<Alert tone="danger" message={form.error} />{/if}
    {#if form?.success}<Alert tone="success" message={form.success} />{/if}

    {#if entry.status === "cancelled"}
        <Alert
            tone="danger"
            title="Dieser Termin wurde abgesagt"
            message="Er bleibt hier stehen, damit die Absage jeden erreicht, der bereits zugesagt hatte."
        />
    {/if}

    <Card>
        <dl class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
                <dt class="text-fg-subtle">Wann</dt>
                <dd class="text-fg">{formatSpan()}</dd>
            </div>
            {#if entry.location}
                <div>
                    <dt class="text-fg-subtle">Wo</dt>
                    <dd class="text-fg">{entry.location}</dd>
                </div>
            {/if}
            {#if entry.responseDeadline}
                <div>
                    <dt class="text-fg-subtle">Rückmeldung bis</dt>
                    <dd class="text-fg">{formatDateTime(entry.responseDeadline)}</dd>
                </div>
            {/if}
            <div>
                <dt class="text-fg-subtle">Für wen</dt>
                <dd class="text-fg">
                    {#if entry.shares.length === 0}
                        Alle im Stamm
                    {:else}
                        <span class="flex flex-wrap gap-1">
                            {#each entry.shares as share (share.id)}
                                <Badge tone="neutral" size="xs" label={share.targetName} />
                            {/each}
                        </span>
                    {/if}
                </dd>
            </div>
        </dl>

        {#if entry.description}
            <p class="text-sm text-fg mt-4 whitespace-pre-line">{entry.description}</p>
        {/if}
    </Card>

    <!-- Eigene Rückmeldung -->
    <Card
        title="Deine Rückmeldung"
        subtitle={data.ownMembers.length > 1
            ? "Für jedes verknüpfte Mitglied getrennt."
            : undefined}
    >
        {#if data.ownMembers.length === 0}
            <p class="text-sm text-fg-muted">
                Mit deinem Zugang ist kein Mitglied verknüpft. Eine Rückmeldung ist deshalb nicht
                möglich – die Stammesführung kann die Verknüpfung nachtragen.
            </p>
        {:else if !data.canRespond}
            <Alert
                tone="info"
                message={entry.status === "cancelled"
                    ? "Der Termin wurde abgesagt, eine Rückmeldung ist nicht mehr nötig."
                    : "Die Rückmeldefrist ist abgelaufen."}
            />
        {/if}

        <div class="space-y-3 mt-2">
            {#each data.ownMembers as member (member.id)}
                <form
                    method="post"
                    action="?/respond"
                    class="p-4 rounded-xl border border-border space-y-3"
                >
                    <input type="hidden" name="memberId" value={member.id} />

                    <div class="flex items-center justify-between gap-3 flex-wrap">
                        <span class="text-sm font-semibold text-fg">{member.name}</span>
                        {#if member.response}
                            <Badge
                                tone={RESPONSE_TONES[member.response]}
                                size="xs"
                                label={RESPONSE_LABELS[member.response]}
                            />
                        {:else}
                            <span class="text-xs text-fg-subtle">Noch keine Rückmeldung</span>
                        {/if}
                    </div>

                    {#if data.canRespond}
                        <TextInput
                            name="note"
                            value={member.note}
                            placeholder="Anmerkung, z. B. „kommt später“"
                        />

                        <div class="flex flex-wrap gap-2">
                            <Button
                                type="submit"
                                name="response"
                                value="yes"
                                variant={member.response === "yes" ? "primary" : "secondary"}
                                size="sm"
                                icon="check-lg"
                            >
                                Zusagen
                            </Button>
                            <Button
                                type="submit"
                                name="response"
                                value="maybe"
                                variant={member.response === "maybe" ? "primary" : "secondary"}
                                size="sm"
                                icon="question-lg"
                            >
                                Vielleicht
                            </Button>
                            <Button
                                type="submit"
                                name="response"
                                value="no"
                                variant={member.response === "no" ? "primary" : "secondary"}
                                size="sm"
                                icon="x-lg"
                            >
                                Absagen
                            </Button>
                            {#if member.response}
                                <Button
                                    type="submit"
                                    name="response"
                                    value="withdraw"
                                    variant="ghost"
                                    size="sm"
                                >
                                    Zurücknehmen
                                </Button>
                            {/if}
                        </div>
                    {/if}
                </form>
            {/each}
        </div>
    </Card>

    <!-- Teilnehmerliste -->
    {#if data.canManage}
        <Card title="Rückmeldungen" meta={`${total} von allen Eingeladenen`}>
            <div class="grid grid-cols-3 gap-4 mb-4">
                <div class="p-3 rounded-xl bg-success-subtle">
                    <p class="text-2xl font-semibold text-success tabular-nums">
                        {entry.counts.yes}
                    </p>
                    <p class="text-xs text-success">Zusagen</p>
                </div>
                <div class="p-3 rounded-xl bg-warning-subtle">
                    <p class="text-2xl font-semibold text-warning tabular-nums">
                        {entry.counts.maybe}
                    </p>
                    <p class="text-xs text-warning">Vielleicht</p>
                </div>
                <div class="p-3 rounded-xl bg-danger-subtle">
                    <p class="text-2xl font-semibold text-danger tabular-nums">
                        {entry.counts.no}
                    </p>
                    <p class="text-xs text-danger">Absagen</p>
                </div>
            </div>

            {#if data.responses.length === 0}
                <EmptyState
                    icon="inbox"
                    title="Noch keine Rückmeldungen"
                    description="Sobald jemand zu- oder absagt, erscheint es hier."
                />
            {:else}
                <ul class="divide-y divide-border">
                    {#each data.responses as response (response.memberId)}
                        <li class="py-3 flex items-start justify-between gap-3">
                            <div class="min-w-0">
                                <p class="text-sm text-fg">{response.memberName}</p>
                                {#if response.note}
                                    <p class="text-xs text-fg-muted">{response.note}</p>
                                {/if}
                                <p class="text-xs text-fg-subtle">
                                    {formatDateTime(response.respondedAt)}
                                </p>
                            </div>
                            <Badge
                                tone={RESPONSE_TONES[response.response]}
                                size="xs"
                                label={RESPONSE_LABELS[response.response]}
                            />
                        </li>
                    {/each}
                </ul>
            {/if}
        </Card>
    {/if}
</div>

{#if data.canManage}
    <Modal bind:open={editOpen} title="Termin bearbeiten">
        <form method="post" action="?/update" class="space-y-4" id="termin-bearbeiten">
            <FormField label="Titel" required>
                {#snippet children({ id })}
                    <TextInput {id} name="title" value={entry.title} required />
                {/snippet}
            </FormField>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Beginn" required>
                    {#snippet children({ id })}
                        <TextInput
                            {id}
                            name="startsAt"
                            type="datetime-local"
                            value={forInput(entry.startsAt)}
                            required
                        />
                    {/snippet}
                </FormField>
                <FormField label="Ende">
                    {#snippet children({ id })}
                        <TextInput
                            {id}
                            name="endsAt"
                            type="datetime-local"
                            value={forInput(entry.endsAt)}
                        />
                    {/snippet}
                </FormField>
            </div>

            <label class="flex items-center gap-2 text-sm text-fg cursor-pointer">
                <input
                    type="checkbox"
                    name="allDay"
                    checked={entry.allDay}
                    class="rounded border-border-strong"
                />
                Ganztägig
            </label>

            <FormField label="Ort">
                {#snippet children({ id })}
                    <TextInput {id} name="location" value={entry.location} />
                {/snippet}
            </FormField>

            <FormField label="Beschreibung">
                {#snippet children({ id })}
                    <textarea
                        {id}
                        name="description"
                        rows="3"
                        value={entry.description}
                        class="w-full px-4 py-3 rounded-xl text-sm bg-surface text-fg border border-border-strong shadow-sm"
                    ></textarea>
                {/snippet}
            </FormField>

            <FormField label="Rückmeldefrist">
                {#snippet children({ id })}
                    <TextInput
                        {id}
                        name="responseDeadline"
                        type="datetime-local"
                        value={forInput(entry.responseDeadline)}
                    />
                {/snippet}
            </FormField>

            <FormField label="Status">
                {#snippet children({ id })}
                    <select
                        {id}
                        name="status"
                        class="w-full px-4 py-3 rounded-xl text-sm bg-surface text-fg border border-border-strong shadow-sm"
                    >
                        <option value="published" selected={entry.status === "published"}>
                            Veröffentlicht
                        </option>
                        <option value="draft" selected={entry.status === "draft"}>Entwurf</option>
                        <option value="cancelled" selected={entry.status === "cancelled"}>
                            Abgesagt
                        </option>
                    </select>
                {/snippet}
            </FormField>
        </form>

        {#snippet footer()}
            <Button variant="secondary" onclick={() => (editOpen = false)}>Abbrechen</Button>
            <Button
                variant="primary"
                icon="check-lg"
                onclick={() => document.forms.namedItem("termin-bearbeiten")?.requestSubmit()}
            >
                Speichern
            </Button>
        {/snippet}
    </Modal>

    {#if data.shareOptions}
        <Modal bind:open={shareOpen} title="Freigaben">
            <form method="post" action="?/setShares" class="space-y-4" id="termin-freigaben">
                <p class="text-sm text-fg-muted">
                    Ohne Auswahl ist der Termin für alle im Stamm sichtbar.
                </p>

                {#each [{ kind: "group", label: "Gruppen", entries: data.shareOptions.groups }, { kind: "position", label: "Ämter", entries: data.shareOptions.positions }, { kind: "role", label: "Rollen", entries: data.shareOptions.roles }, { kind: "user", label: "Einzelne Personen", entries: data.shareOptions.users }] as block (block.kind)}
                    {#if block.entries.length > 0}
                        <fieldset class="space-y-1.5">
                            <legend class="text-xs font-semibold text-fg-subtle uppercase tracking-wide">
                                {block.label}
                            </legend>
                            <div class="flex flex-wrap gap-2">
                                {#each block.entries as option (option.id)}
                                    <label
                                        class="flex items-center gap-2 text-xs text-fg px-2.5 py-1.5 rounded-lg border border-border cursor-pointer hover:bg-surface-muted transition"
                                    >
                                        <input
                                            type="checkbox"
                                            name="share"
                                            value={`${block.kind}:${option.id}`}
                                            checked={sharedIds.has(option.id)}
                                            class="rounded border-border-strong"
                                        />
                                        {option.name}
                                    </label>
                                {/each}
                            </div>
                        </fieldset>
                    {/if}
                {/each}
            </form>

            {#snippet footer()}
                <Button variant="secondary" onclick={() => (shareOpen = false)}>Abbrechen</Button>
                <Button
                    variant="primary"
                    icon="check-lg"
                    onclick={() => document.forms.namedItem("termin-freigaben")?.requestSubmit()}
                >
                    Speichern
                </Button>
            {/snippet}
        </Modal>
    {/if}

    <ConfirmDialog
        bind:open={cancelOpen}
        title="Termin absagen"
        message={`„${entry.title}“ wird als abgesagt gekennzeichnet. Der Eintrag bleibt sichtbar, damit die Absage jeden erreicht.`}
        confirmLabel="Absagen"
        onconfirm={() => cancelForm?.requestSubmit()}
    />

    <ConfirmDialog
        bind:open={deleteOpen}
        title="Termin löschen"
        message={`„${entry.title}“ wird mit allen Rückmeldungen dauerhaft entfernt. Für einen bereits angekündigten Termin ist „Absagen“ die bessere Wahl.`}
        confirmLabel="Endgültig löschen"
        onconfirm={() => deleteForm?.requestSubmit()}
    />

    <form method="post" action="?/cancel" bind:this={cancelForm} class="hidden"></form>
    <form method="post" action="?/delete" bind:this={deleteForm} class="hidden"></form>
{/if}
