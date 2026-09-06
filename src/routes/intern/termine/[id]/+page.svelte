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
        Select,
        Textarea,
        TextInput
    } from "$lib/components/ui";
    import { untrack } from "svelte";
    import { EVENT_COLORS, eventColorVars } from "$lib/events/colors";
    import { formatDateTime } from "$lib/format";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let editOpen = $state(false);
    let shareOpen = $state(false);
    let cancelOpen = $state(false);
    let deleteOpen = $state(false);
    let coverRemoveOpen = $state(false);
    let cancelForm = $state<HTMLFormElement | null>(null);
    let deleteForm = $state<HTMLFormElement | null>(null);
    let coverRemoveForm = $state<HTMLFormElement | null>(null);

    const entry = $derived(data.event);

    /**
     * Farbe und Rückmeldeschalter steuern die Anzeige des Bearbeitungsformulars
     * und müssen deshalb als Zustand vorliegen -- `$derived` wäre falsch, weil
     * der Benutzer sie ändert. `untrack` macht deutlich, dass hier absichtlich
     * nur der Startwert übernommen wird; abgeglichen wird beim Öffnen.
     */
    let editColor = $state(untrack(() => data.event.color));
    let editResponses = $state(untrack(() => data.event.responsesEnabled));
    let coverReplaceOpen = $state(false);

    /** Setzt das Formular auf den gespeicherten Stand zurück und öffnet es. */
    function openEdit() {
        editColor = data.event.color;
        editResponses = data.event.responsesEnabled;
        coverReplaceOpen = false;
        editOpen = true;
    }

    const RESPONSE_LABELS = { yes: "Zusage", no: "Absage", maybe: "Vielleicht" } as const;
    const RESPONSE_TONES = { yes: "success", no: "danger", maybe: "warning" } as const;

    const coverUrl = $derived(
        entry.coverFileId ? `/intern/termine/${entry.id}/titelbild` : null
    );

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

    const galleryMeta = $derived(
        data.galleries.length === 1 ? "1 Galerie" : `${data.galleries.length} Galerien`
    );

    /**
     * Gruppen stehen im Freigabeformular oben und offen, alles Weitere in
     * einem zugeklappten Block: an den Gruppen hängt auch das Recht, den
     * Termin zu bearbeiten.
     */
    const otherShareBlocks = $derived(
        data.shareOptions
            ? [
                  { kind: "position", label: "Ämter", entries: data.shareOptions.positions },
                  { kind: "role", label: "Rollen", entries: data.shareOptions.roles },
                  { kind: "user", label: "Einzelne Personen", entries: data.shareOptions.users }
              ].filter((block) => block.entries.length > 0)
            : []
    );
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
                {#if entry.responsesEnabled}
                    <Button
                        href={`/intern/termine/${entry.id}/teilnehmer.pdf`}
                        variant="secondary"
                        icon="file-earmark-pdf"
                    >
                        Teilnehmerliste
                    </Button>
                {/if}
                <Button variant="secondary" icon="pencil" onclick={openEdit}>
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

    <!--
        Kopfband in der Terminfarbe. Es trägt keine Information allein: die
        Farbe wiederholt nur, was Liste und Monatsraster zeigen.
    -->
    <div style={eventColorVars(entry.color)} class="space-y-0">
        {#if coverUrl}
            <img
                src={coverUrl}
                alt={`Titelbild: ${entry.title}`}
                class="w-full max-h-64 object-cover rounded-t-card border border-border border-b-0 bg-surface-muted"
            />
        {/if}
        <div
            class={`h-2 ${coverUrl ? "" : "rounded-t-card"}`}
            style="background: var(--ev)"
            aria-hidden="true"
        ></div>
    </div>

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
            {#if entry.responsesEnabled && entry.responseDeadline}
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

    <!-- Eigene Rückmeldung -- entfällt, wenn dieser Termin keine erfasst. -->
    {#if entry.responsesEnabled}
        <Card
            title="Deine Rückmeldung"
            subtitle={data.ownMembers.length > 1
                ? "Für jedes verknüpfte Mitglied getrennt."
                : undefined}
        >
            {#if data.ownMembers.length === 0}
                <p class="text-sm text-fg-muted">
                    Mit deinem Zugang ist kein Mitglied verknüpft. Eine Rückmeldung ist deshalb
                    nicht möglich – die Stammesführung kann die Verknüpfung nachtragen.
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
                        class="p-4 rounded-card border border-border space-y-3"
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
    {/if}

    <!-- Teilnehmerliste -->
    {#if data.canManage && entry.responsesEnabled}
        <Card title="Rückmeldungen" meta={`${total} von allen Eingeladenen`}>
            <div class="grid grid-cols-3 gap-4 mb-4">
                <div class="p-3 rounded-card bg-success-soft">
                    <p class="text-2xl font-semibold text-success-soft-fg tabular-figures">
                        {entry.counts.yes}
                    </p>
                    <p class="text-xs text-success-soft-fg">Zusagen</p>
                </div>
                <div class="p-3 rounded-card bg-warning-soft">
                    <p class="text-2xl font-semibold text-warning-soft-fg tabular-figures">
                        {entry.counts.maybe}
                    </p>
                    <p class="text-xs text-warning-soft-fg">Vielleicht</p>
                </div>
                <div class="p-3 rounded-card bg-danger-soft">
                    <p class="text-2xl font-semibold text-danger-soft-fg tabular-figures">
                        {entry.counts.no}
                    </p>
                    <p class="text-xs text-danger-soft-fg">Absagen</p>
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

    {#if data.galleries.length > 0}
        <!--
            Bilder zum Termin. Die Kacheln fuehren nur hin -- was jemand in der
            Galerie darf, entscheidet die Galerieseite selbst. Aufgelistet wird
            ohnehin nur, was der Server als sichtbar zurueckgegeben hat.
        -->
        <Card title="Bilder zum Termin" meta={galleryMeta}>
            <ul class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {#each data.galleries as gallery (gallery.id)}
                    <li>
                        <a
                            href={`/intern/galerie/${gallery.id}`}
                            class="block rounded-card border border-border overflow-hidden
                                   hover:border-border-strong transition"
                        >
                            <div class="aspect-[4/3] bg-surface-sunken flex items-center justify-center">
                                {#if gallery.coverImageId}
                                    <img
                                        src={`/intern/galerie/${gallery.id}/bild/${gallery.coverImageId}/datei?klein=1`}
                                        alt=""
                                        loading="lazy"
                                        decoding="async"
                                        class="size-full object-cover"
                                    />
                                {:else}
                                    <i
                                        class="bi bi-images text-2xl text-fg-subtle"
                                        aria-hidden="true"
                                    ></i>
                                {/if}
                            </div>
                            <div class="p-2">
                                <span class="block text-sm text-fg truncate">{gallery.title}</span>
                                <span class="block text-xs text-fg-subtle">
                                    {gallery.imageCount === 1
                                        ? "1 Bild"
                                        : `${gallery.imageCount} Bilder`}
                                </span>
                            </div>
                        </a>
                    </li>
                {/each}
            </ul>
        </Card>
    {/if}
</div>

{#if data.canManage}
    <Modal bind:open={editOpen} title="Termin bearbeiten">
        <form
            method="post"
            action="?/update"
            enctype="multipart/form-data"
            class="space-y-4"
            id="termin-bearbeiten"
        >
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
                    class="rounded-control border-border-strong"
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
                    <Textarea {id} name="description" rows={3} value={entry.description} />
                {/snippet}
            </FormField>

            <!-- Farbe: Fläche UND Name, nie Farbe allein (Design-Blatt §7). -->
            <fieldset class="space-y-2">
                <legend class="text-sm font-semibold text-fg-muted">Farbe</legend>
                <div class="flex flex-wrap gap-2">
                    {#each EVENT_COLORS as option (option.key)}
                        <label
                            style={eventColorVars(option.key)}
                            class={`flex items-center gap-2 text-xs text-fg px-2.5 py-1.5 rounded-control border cursor-pointer transition ${
                                editColor === option.key
                                    ? "border-primary bg-surface-muted font-semibold"
                                    : "border-border hover:bg-surface-muted"
                            }`}
                        >
                            <input
                                type="radio"
                                name="color"
                                value={option.key}
                                bind:group={editColor}
                                class="border-border-strong"
                            />
                            <span
                                class="w-4 h-4 rounded-control border border-border shrink-0"
                                style="background: var(--ev)"
                                aria-hidden="true"
                            ></span>
                            {option.name}
                            {#if editColor === option.key}
                                <span class="bi bi-check-lg text-primary" aria-hidden="true"></span>
                            {/if}
                        </label>
                    {/each}
                </div>
            </fieldset>

            <label class="flex items-center gap-2 text-sm text-fg cursor-pointer">
                <input
                    type="checkbox"
                    name="responsesEnabled"
                    bind:checked={editResponses}
                    class="rounded-control border-border-strong"
                />
                Zu- und Absagen erfassen
            </label>

            {#if editResponses}
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
            {/if}

            <!--
                Titelbild. Ist schon eines gesetzt, wird das Feld erst auf
                Wunsch gezeigt: sonst sieht ein leeres Dateifeld so aus, als
                sei kein Bild vorhanden.
            -->
            <fieldset class="space-y-2">
                <legend class="text-sm font-semibold text-fg-muted">Titelbild</legend>

                {#if coverUrl && !coverReplaceOpen}
                    <img
                        src={coverUrl}
                        alt={`Titelbild: ${entry.title}`}
                        class="w-full max-h-40 object-cover rounded-card border border-border bg-surface-muted"
                    />
                    <div class="flex flex-wrap gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            icon="arrow-repeat"
                            onclick={() => (coverReplaceOpen = true)}
                        >
                            Ersetzen
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            icon="trash"
                            onclick={() => (coverRemoveOpen = true)}
                        >
                            Entfernen
                        </Button>
                    </div>
                {:else}
                    <input
                        type="file"
                        name="cover"
                        accept="image/png,image/jpeg,image/webp"
                        class="block w-full text-sm text-fg file:mr-3 file:px-3 file:py-2 file:rounded-control file:border-0 file:bg-primary file:text-primary-fg file:text-sm"
                    />
                    <p class="text-xs text-fg-subtle">
                        PNG, JPEG oder WebP, höchstens 10 MB. Wird mit „Speichern“ übernommen.
                    </p>
                {/if}
            </fieldset>

            <FormField label="Status">
                {#snippet children({ id })}
                    <Select
                        {id}
                        name="status"
                        value={entry.status}
                        options={[
                            { value: "published", label: "Veröffentlicht" },
                            { value: "draft", label: "Entwurf" },
                            { value: "cancelled", label: "Abgesagt" }
                        ]}
                    />
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
                <fieldset
                    class="space-y-2 p-3 rounded-card border border-border-strong bg-surface-muted"
                >
                    <legend class="text-sm font-semibold text-fg px-1">Für diese Gruppen</legend>
                    <p class="text-xs text-fg-subtle">
                        Ohne Auswahl ist der Termin für den ganzen Stamm bestimmt. An den Gruppen
                        hängt außerdem, wer den Termin bearbeiten darf.
                    </p>

                    {#if data.shareOptions.groups.length === 0}
                        <p class="text-xs text-fg-muted">Es sind keine Gruppen angelegt.</p>
                    {:else}
                        <div class="flex flex-wrap gap-2">
                            {#each data.shareOptions.groups as group (group.id)}
                                <label
                                    class="flex items-center gap-2 text-sm text-fg px-2.5 py-1.5 rounded-control border border-border bg-surface cursor-pointer hover:bg-surface-muted transition"
                                >
                                    <input
                                        type="checkbox"
                                        name="share"
                                        value={`group:${group.id}`}
                                        checked={sharedIds.has(group.id)}
                                        class="rounded-control border-border-strong"
                                    />
                                    {group.name}
                                </label>
                            {/each}
                        </div>
                    {/if}
                </fieldset>

                {#if otherShareBlocks.length > 0}
                    <details class="rounded-card border border-border p-3">
                        <summary class="text-sm font-semibold text-fg-muted cursor-pointer">
                            Weitere Freigaben
                        </summary>

                        <div class="mt-3 space-y-3">
                            {#each otherShareBlocks as block (block.kind)}
                                <fieldset class="space-y-1.5">
                                    <legend
                                        class="text-xs font-semibold text-fg-subtle uppercase tracking-wide"
                                    >
                                        {block.label}
                                    </legend>
                                    <div class="flex flex-wrap gap-2">
                                        {#each block.entries as option (option.id)}
                                            <label
                                                class="flex items-center gap-2 text-xs text-fg px-2.5 py-1.5 rounded-control border border-border cursor-pointer hover:bg-surface-muted transition"
                                            >
                                                <input
                                                    type="checkbox"
                                                    name="share"
                                                    value={`${block.kind}:${option.id}`}
                                                    checked={sharedIds.has(option.id)}
                                                    class="rounded-control border-border-strong"
                                                />
                                                {option.name}
                                            </label>
                                        {/each}
                                    </div>
                                </fieldset>
                            {/each}
                        </div>
                    </details>
                {/if}
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
        message={`„${entry.title}“ wird mit allen Rückmeldungen dauerhaft entfernt. Für einen bereits angekündigten Termin ist „Absagen“ die bessere Wahl.` +
            (data.galleries.length > 0
                ? ` ${galleryMeta} bleiben erhalten und verlieren nur den Terminbezug.`
                : "")}
        confirmLabel="Endgültig löschen"
        onconfirm={() => deleteForm?.requestSubmit()}
    />

    <ConfirmDialog
        bind:open={coverRemoveOpen}
        title="Titelbild entfernen"
        message="Das Bild wird dauerhaft gelöscht. Der Termin selbst bleibt bestehen."
        confirmLabel="Entfernen"
        onconfirm={() => coverRemoveForm?.requestSubmit()}
    />

    <form method="post" action="?/cancel" bind:this={cancelForm} class="hidden"></form>
    <form method="post" action="?/delete" bind:this={deleteForm} class="hidden"></form>
    <form
        method="post"
        action="?/removeCover"
        bind:this={coverRemoveForm}
        class="hidden"
    ></form>
{/if}
