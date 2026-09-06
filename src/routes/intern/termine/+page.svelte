<script lang="ts">
    import {
        Alert,
        Badge,
        Button,
        Card,
        EmptyState,
        FormField,
        Modal,
        PageHeader,
        Select,
        Textarea,
        TextInput
    } from "$lib/components/ui";
    import { DEFAULT_EVENT_COLOR, EVENT_COLORS, eventColorVars } from "$lib/events/colors";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type EventItem = PageData["events"][number];

    let createOpen = $state(false);

    /**
     * Farbe und Rückmeldung stehen als Zustand, weil beides die Anzeige des
     * Formulars steuert: das gewählte Feld trägt ein Häkchen, und ohne
     * Rückmeldung verschwindet das Fristfeld. Beides sind echte
     * Formularfelder, das Absenden funktioniert also auch ohne JavaScript.
     */
    let createColor = $state(DEFAULT_EVENT_COLOR);
    let createResponses = $state(true);

    const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

    const MONTH_NAMES = [
        "Januar", "Februar", "März", "April", "Mai", "Juni",
        "Juli", "August", "September", "Oktober", "November", "Dezember"
    ];

    const STATUS_TONES = {
        draft: "neutral",
        published: "success",
        cancelled: "danger"
    } as const;

    const STATUS_LABELS = {
        draft: "Entwurf",
        published: "Veröffentlicht",
        cancelled: "Abgesagt"
    } as const;

    function formatTime(iso: string): string {
        return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    }

    function formatDay(iso: string): string {
        return new Date(iso).toLocaleDateString("de-DE", {
            weekday: "long",
            day: "2-digit",
            month: "long",
            year: "numeric"
        });
    }

    /** Beginn und Ende in einer Zeile, ohne den Tag zu wiederholen. */
    function formatSpan(item: EventItem): string {
        if (item.allDay) {
            if (!item.endsAt || item.endsAt.slice(0, 10) === item.startsAt.slice(0, 10)) {
                return "Ganztägig";
            }
            return `Ganztägig bis ${new Date(item.endsAt).toLocaleDateString("de-DE")}`;
        }

        const start = formatTime(item.startsAt);
        if (!item.endsAt) return `${start} Uhr`;

        const sameDay = item.endsAt.slice(0, 10) === item.startsAt.slice(0, 10);
        return sameDay
            ? `${start} – ${formatTime(item.endsAt)} Uhr`
            : `${start} Uhr bis ${new Date(item.endsAt).toLocaleDateString("de-DE")}`;
    }

    /** Termine nach Tag, für die Listenansicht. */
    const byDay = $derived.by(() => {
        const map = new Map<string, EventItem[]>();
        for (const item of data.events) {
            const day = item.startsAt.slice(0, 10);
            const list = map.get(day) ?? [];
            list.push(item);
            map.set(day, list);
        }
        return [...map.entries()];
    });

    /**
     * Sechs Wochen à sieben Tage, beginnend am Montag vor dem Ersten. Die
     * Zellen der Nachbarmonate bleiben sichtbar, aber blass -- ein Raster mit
     * Lücken liest sich schlechter als eines ohne.
     */
    const weeks = $derived.by(() => {
        const start = new Date(data.month.from);
        const result: { date: Date; iso: string; inMonth: boolean; items: EventItem[] }[][] = [];

        for (let week = 0; week < 6; week += 1) {
            const days = [];
            for (let day = 0; day < 7; day += 1) {
                const date = new Date(
                    start.getFullYear(),
                    start.getMonth(),
                    start.getDate() + week * 7 + day
                );
                const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

                days.push({
                    date,
                    iso,
                    inMonth: date.getMonth() === data.month.month - 1,
                    items: data.events.filter((item) => item.startsAt.slice(0, 10) === iso)
                });
            }
            result.push(days);
        }

        return result;
    });

    const previousMonth = $derived(
        data.month.month === 1
            ? { jahr: data.month.year - 1, monat: 12 }
            : { jahr: data.month.year, monat: data.month.month - 1 }
    );

    const nextMonth = $derived(
        data.month.month === 12
            ? { jahr: data.month.year + 1, monat: 1 }
            : { jahr: data.month.year, monat: data.month.month + 1 }
    );

    const todayIso = new Date().toISOString().slice(0, 10);

    /**
     * Die weiteren Freigabearten in einer Liste -- Ämter, Rollen, Personen.
     * Gruppen stehen bewusst NICHT dabei: sie haben einen eigenen, deutlich
     * sichtbaren Abschnitt, weil an ihnen die Verwaltungsrechte hängen.
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

<svelte:head><title>Termine - Intern</title></svelte:head>

<div class="space-y-8">
    <PageHeader
        title="Termine"
        eyebrow="Kalender"
        subtitle="Gruppenstunden, Lager und Aktionen – mit Rückmeldung und Kalenderabo."
        back={{ href: "/intern/dashboard", label: "Zum Dashboard" }}
    >
        {#snippet badge()}
            <Badge tone="primary" label={`${data.events.length} Termine`} />
        {/snippet}

        {#snippet actions()}
            <Button href="/intern/profil/kalender" variant="secondary" icon="calendar-check">
                Kalender abonnieren
            </Button>
            {#if data.canManage}
                <Button variant="primary" icon="plus-circle" onclick={() => (createOpen = true)}>
                    Neuer Termin
                </Button>
            {/if}
        {/snippet}
    </PageHeader>

    {#if form?.error}<Alert tone="danger" message={form.error} />{/if}
    {#if form?.success}<Alert tone="success" message={form.success} />{/if}

    <!-- Ansichtswechsel -->
    <div class="flex items-center justify-between gap-3 flex-wrap">
        <div class="inline-flex rounded-control border border-border overflow-hidden" role="group">
            <a
                href="?ansicht=liste"
                class={`px-4 py-2 text-sm transition ${
                    data.view === "liste"
                        ? "bg-primary text-primary-fg font-semibold"
                        : "text-fg hover:bg-surface-muted"
                }`}
                aria-current={data.view === "liste" ? "true" : undefined}
            >
                Liste
            </a>
            <a
                href="?ansicht=monat"
                class={`px-4 py-2 text-sm transition border-l border-border ${
                    data.view === "monat"
                        ? "bg-primary text-primary-fg font-semibold"
                        : "text-fg hover:bg-surface-muted"
                }`}
                aria-current={data.view === "monat" ? "true" : undefined}
            >
                Monat
            </a>
        </div>

        {#if data.view === "liste"}
            <div
                class="inline-flex rounded-control border border-border overflow-hidden"
                role="group"
            >
                <a
                    href="?ansicht=liste"
                    class={`px-4 py-2 text-sm transition ${
                        !data.showPast
                            ? "bg-surface-muted text-fg font-semibold"
                            : "text-fg-muted hover:bg-surface-muted"
                    }`}
                >
                    Kommende
                </a>
                <a
                    href="?ansicht=liste&zeitraum=vergangen"
                    class={`px-4 py-2 text-sm transition border-l border-border ${
                        data.showPast
                            ? "bg-surface-muted text-fg font-semibold"
                            : "text-fg-muted hover:bg-surface-muted"
                    }`}
                >
                    Vergangene
                </a>
            </div>
        {:else}
            <div class="flex items-center gap-2">
                <Button
                    href={`?ansicht=monat&jahr=${previousMonth.jahr}&monat=${previousMonth.monat}`}
                    variant="ghost"
                    size="sm"
                    icon="chevron-left"
                    ariaLabel="Vorheriger Monat"
                />
                <span class="text-sm font-semibold text-fg min-w-40 text-center">
                    {MONTH_NAMES[data.month.month - 1]}
                    {data.month.year}
                </span>
                <Button
                    href={`?ansicht=monat&jahr=${nextMonth.jahr}&monat=${nextMonth.monat}`}
                    variant="ghost"
                    size="sm"
                    icon="chevron-right"
                    ariaLabel="Nächster Monat"
                />
            </div>
        {/if}
    </div>

    {#if data.view === "monat"}
        <Card padding="none">
            <div class="overflow-x-auto">
                <div class="min-w-[44rem]">
                    <div class="grid grid-cols-7 border-b border-border">
                        {#each WEEKDAYS as day (day)}
                            <div
                                class="px-2 py-2 text-xs font-semibold text-fg-subtle uppercase tracking-wide text-center"
                            >
                                {day}
                            </div>
                        {/each}
                    </div>

                    {#each weeks as week, index (index)}
                        <div class="grid grid-cols-7 border-b border-border last:border-b-0">
                            {#each week as day (day.iso)}
                                <div
                                    class={`min-h-24 p-1.5 border-r border-border last:border-r-0 space-y-1 ${
                                        day.inMonth ? "" : "bg-surface-muted/40"
                                    }`}
                                >
                                    <div
                                        class={`text-xs tabular-nums ${
                                            day.iso === todayIso
                                                ? "inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-fg font-semibold"
                                                : day.inMonth
                                                  ? "text-fg-muted"
                                                  : "text-fg-subtle"
                                        }`}
                                    >
                                        {day.date.getDate()}
                                    </div>

                                    {#each day.items as item (item.id)}
                                        <a
                                            href={`/intern/termine/${item.id}`}
                                            style={eventColorVars(item.color)}
                                            class={`flex items-center gap-1.5 px-1.5 py-1 rounded-control text-xs transition ${
                                                item.status === "cancelled"
                                                    ? "bg-danger-soft text-danger-soft-fg line-through"
                                                    : item.status === "draft"
                                                      ? "bg-surface-muted text-fg-muted"
                                                      : "bg-[var(--ev-soft)] text-[var(--ev-soft-fg)] hover:brightness-95"
                                            }`}
                                            title={item.title}
                                        >
                                            <!-- Farbpunkt: die Farbe ist Zugabe, der Titel steht daneben. -->
                                            <span
                                                class="w-1.5 h-1.5 rounded-full shrink-0"
                                                style="background: var(--ev)"
                                                aria-hidden="true"
                                            ></span>
                                            {#if !item.allDay}
                                                <span class="tabular-nums">
                                                    {formatTime(item.startsAt)}
                                                </span>
                                            {/if}
                                            <span class="truncate">{item.title}</span>
                                        </a>
                                    {/each}
                                </div>
                            {/each}
                        </div>
                    {/each}
                </div>
            </div>
        </Card>
    {:else if data.events.length === 0}
        <Card>
            <EmptyState
                icon="calendar-event"
                title={data.showPast ? "Keine vergangenen Termine" : "Keine kommenden Termine"}
                description={data.canManage
                    ? "Lege einen Termin an und gib ihn für eine Gruppe, ein Amt, eine Rolle oder einzelne Personen frei."
                    : "Sobald etwas ansteht, findest du es hier."}
            >
                {#snippet action()}
                    {#if data.canManage}
                        <Button
                            variant="primary"
                            icon="plus-circle"
                            onclick={() => (createOpen = true)}
                        >
                            Termin anlegen
                        </Button>
                    {/if}
                {/snippet}
            </EmptyState>
        </Card>
    {:else}
        <div class="space-y-6">
            {#each byDay as [day, items] (day)}
                <section class="space-y-2">
                    <h2 class="text-sm font-semibold text-fg-subtle">
                        {formatDay(`${day}T12:00:00`)}
                    </h2>

                    <Card padding="none">
                        <ul class="divide-y divide-border">
                            {#each items as item (item.id)}
                                <li>
                                    <a
                                        href={`/intern/termine/${item.id}`}
                                        style={eventColorVars(item.color)}
                                        class="flex items-stretch gap-4 p-4 hover:bg-surface-muted transition"
                                    >
                                        <!-- Farbstreifen: kennzeichnet die Art des Termins. -->
                                        <span
                                            class="w-1 shrink-0 rounded-control"
                                            style="background: var(--ev)"
                                            aria-hidden="true"
                                        ></span>

                                        <div
                                            class="w-24 shrink-0 text-sm text-fg-muted tabular-nums"
                                        >
                                            {formatSpan(item)}
                                        </div>

                                        {#if item.coverFileId}
                                            <img
                                                src={`/intern/termine/${item.id}/titelbild`}
                                                alt=""
                                                loading="lazy"
                                                class="hidden sm:block w-20 h-14 shrink-0 object-cover rounded-control border border-border bg-surface-muted"
                                            />
                                        {/if}

                                        <div class="min-w-0 flex-1">
                                            <p
                                                class={`text-sm font-semibold ${
                                                    item.status === "cancelled"
                                                        ? "text-fg-muted line-through"
                                                        : "text-fg"
                                                }`}
                                            >
                                                {item.title}
                                            </p>
                                            {#if item.location}
                                                <p class="text-xs text-fg-subtle">
                                                    <span class="bi bi-geo-alt" aria-hidden="true"
                                                    ></span>
                                                    {item.location}
                                                </p>
                                            {/if}
                                            {#if item.shares.length > 0}
                                                <div class="flex flex-wrap gap-1 mt-1.5">
                                                    {#each item.shares as share (share.id)}
                                                        <Badge
                                                            tone="neutral"
                                                            size="xs"
                                                            label={share.targetName}
                                                        />
                                                    {/each}
                                                </div>
                                            {/if}
                                        </div>

                                        <div class="flex items-center gap-2 shrink-0">
                                            {#if item.responsesEnabled && item.counts.yes + item.counts.no + item.counts.maybe > 0}
                                                <span class="text-xs text-fg-subtle tabular-nums">
                                                    {item.counts.yes} zugesagt
                                                </span>
                                            {/if}
                                            {#if item.status !== "published"}
                                                <Badge
                                                    tone={STATUS_TONES[item.status]}
                                                    size="xs"
                                                    label={STATUS_LABELS[item.status]}
                                                />
                                            {/if}
                                        </div>
                                    </a>
                                </li>
                            {/each}
                        </ul>
                    </Card>
                </section>
            {/each}
        </div>
    {/if}
</div>

{#if data.canManage}
    <Modal bind:open={createOpen} title="Neuer Termin">
        <form method="post" action="?/create" class="space-y-4" id="termin-anlegen">
            <FormField label="Titel" required>
                {#snippet children({ id })}
                    <TextInput {id} name="title" required placeholder="Gruppenstunde" />
                {/snippet}
            </FormField>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Beginn" required>
                    {#snippet children({ id })}
                        <TextInput {id} name="startsAt" type="datetime-local" required />
                    {/snippet}
                </FormField>
                <FormField label="Ende">
                    {#snippet children({ id })}
                        <TextInput {id} name="endsAt" type="datetime-local" />
                    {/snippet}
                </FormField>
            </div>

            <label class="flex items-center gap-2 text-sm text-fg cursor-pointer">
                <input type="checkbox" name="allDay" class="rounded-control border-border-strong" />
                Ganztägig
            </label>

            <FormField label="Ort">
                {#snippet children({ id })}
                    <TextInput {id} name="location" placeholder="Pfadfinderheim" />
                {/snippet}
            </FormField>

            <FormField label="Beschreibung">
                {#snippet children({ id })}
                    <Textarea
                        {id}
                        name="description"
                        rows={3}
                        placeholder="Was ist geplant, was soll mitgebracht werden?"
                    />
                {/snippet}
            </FormField>

            <!-- Farbe: nie nur die Fläche, immer auch der Name (Design-Blatt §7). -->
            <fieldset class="space-y-2">
                <legend class="text-sm font-semibold text-fg-muted">Farbe</legend>
                <div class="flex flex-wrap gap-2">
                    {#each EVENT_COLORS as option (option.key)}
                        <label
                            style={eventColorVars(option.key)}
                            class={`flex items-center gap-2 text-xs text-fg px-2.5 py-1.5 rounded-control border cursor-pointer transition ${
                                createColor === option.key
                                    ? "border-primary bg-surface-muted font-semibold"
                                    : "border-border hover:bg-surface-muted"
                            }`}
                        >
                            <input
                                type="radio"
                                name="color"
                                value={option.key}
                                bind:group={createColor}
                                class="border-border-strong"
                            />
                            <span
                                class="w-4 h-4 rounded-control border border-border shrink-0"
                                style="background: var(--ev)"
                                aria-hidden="true"
                            ></span>
                            {option.name}
                            {#if createColor === option.key}
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
                    bind:checked={createResponses}
                    class="rounded-control border-border-strong"
                />
                Zu- und Absagen erfassen
            </label>

            {#if createResponses}
                <FormField
                    label="Rückmeldefrist"
                    hint="Bis wann zu- oder abgesagt werden kann. Ohne Angabe bis zum Termin selbst."
                >
                    {#snippet children({ id })}
                        <TextInput {id} name="responseDeadline" type="datetime-local" />
                    {/snippet}
                </FormField>
            {/if}

            <FormField label="Status">
                {#snippet children({ id })}
                    <Select
                        {id}
                        name="status"
                        value="published"
                        options={[
                            { value: "published", label: "Veröffentlicht" },
                            {
                                value: "draft",
                                label: "Entwurf – nur für die Verwaltung sichtbar"
                            }
                        ]}
                    />
                {/snippet}
            </FormField>

            {#if data.shareOptions}
                <!--
                    Gruppen stehen ganz oben und offen: an ihnen hängt nicht nur
                    die Sichtbarkeit, sondern auch, wer den Termin später
                    bearbeiten darf.
                -->
                <fieldset class="space-y-2 p-3 rounded-card border border-border-strong bg-surface-muted">
                    <legend class="text-sm font-semibold text-fg px-1">Für diese Gruppen</legend>
                    <p class="text-xs text-fg-subtle">
                        {#if data.groupBound}
                            Bitte mindestens eine Gruppe auswählen – du darfst Termine nur für
                            deine eigenen Gruppen verwalten.
                        {:else}
                            Ohne Auswahl ist der Termin für den ganzen Stamm bestimmt.
                        {/if}
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
                                        {#each block.entries as entry (entry.id)}
                                            <label
                                                class="flex items-center gap-2 text-xs text-fg px-2.5 py-1.5 rounded-control border border-border cursor-pointer hover:bg-surface-muted transition"
                                            >
                                                <input
                                                    type="checkbox"
                                                    name="share"
                                                    value={`${block.kind}:${entry.id}`}
                                                    class="rounded-control border-border-strong"
                                                />
                                                {entry.name}
                                            </label>
                                        {/each}
                                    </div>
                                </fieldset>
                            {/each}
                        </div>
                    </details>
                {/if}
            {/if}
        </form>

        {#snippet footer()}
            <Button variant="secondary" onclick={() => (createOpen = false)}>Abbrechen</Button>
            <Button
                variant="primary"
                icon="plus-circle"
                onclick={() => document.forms.namedItem("termin-anlegen")?.requestSubmit()}
            >
                Anlegen
            </Button>
        {/snippet}
    </Modal>
{/if}
