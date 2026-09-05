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
        TextInput
    } from "$lib/components/ui";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type EventItem = PageData["events"][number];

    let createOpen = $state(false);

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
        <div class="inline-flex rounded-xl border border-border overflow-hidden" role="group">
            <a
                href="?ansicht=liste"
                class={`px-4 py-2 text-sm transition ${
                    data.view === "liste"
                        ? "bg-primary text-on-primary font-semibold"
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
                        ? "bg-primary text-on-primary font-semibold"
                        : "text-fg hover:bg-surface-muted"
                }`}
                aria-current={data.view === "monat" ? "true" : undefined}
            >
                Monat
            </a>
        </div>

        {#if data.view === "liste"}
            <div class="inline-flex rounded-xl border border-border overflow-hidden" role="group">
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
                                                ? "inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-on-primary font-semibold"
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
                                            class={`block px-1.5 py-1 rounded text-xs truncate transition ${
                                                item.status === "cancelled"
                                                    ? "bg-danger-subtle text-danger line-through"
                                                    : item.status === "draft"
                                                      ? "bg-surface-muted text-fg-muted"
                                                      : "bg-primary-subtle text-primary hover:bg-primary hover:text-on-primary"
                                            }`}
                                            title={item.title}
                                        >
                                            {#if !item.allDay}
                                                <span class="tabular-nums">
                                                    {formatTime(item.startsAt)}
                                                </span>
                                            {/if}
                                            {item.title}
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
                                        class="flex items-start gap-4 p-4 hover:bg-surface-muted transition"
                                    >
                                        <div class="w-24 shrink-0 text-sm text-fg-muted tabular-nums">
                                            {formatSpan(item)}
                                        </div>

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
                                            {#if item.counts.yes + item.counts.no + item.counts.maybe > 0}
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
                <input type="checkbox" name="allDay" class="rounded border-border-strong" />
                Ganztägig
            </label>

            <FormField label="Ort">
                {#snippet children({ id })}
                    <TextInput {id} name="location" placeholder="Pfadfinderheim" />
                {/snippet}
            </FormField>

            <FormField label="Beschreibung">
                {#snippet children({ id })}
                    <textarea
                        {id}
                        name="description"
                        rows="3"
                        class="w-full px-4 py-3 rounded-xl text-sm bg-surface text-fg border border-border-strong shadow-sm placeholder:text-fg-subtle"
                        placeholder="Was ist geplant, was soll mitgebracht werden?"
                    ></textarea>
                {/snippet}
            </FormField>

            <FormField
                label="Rückmeldefrist"
                hint="Bis wann zu- oder abgesagt werden kann. Ohne Angabe bis zum Termin selbst."
            >
                {#snippet children({ id })}
                    <TextInput {id} name="responseDeadline" type="datetime-local" />
                {/snippet}
            </FormField>

            <FormField label="Status">
                {#snippet children({ id })}
                    <select
                        {id}
                        name="status"
                        class="w-full px-4 py-3 rounded-xl text-sm bg-surface text-fg border border-border-strong shadow-sm"
                    >
                        <option value="published">Veröffentlicht</option>
                        <option value="draft">Entwurf – nur für die Verwaltung sichtbar</option>
                    </select>
                {/snippet}
            </FormField>

            {#if data.shareOptions}
                <fieldset class="space-y-2">
                    <legend class="text-sm font-semibold text-fg-muted">
                        Freigabe
                        <span class="block text-xs font-normal text-fg-subtle">
                            Ohne Auswahl ist der Termin für alle sichtbar.
                        </span>
                    </legend>

                    <div class="max-h-56 overflow-y-auto space-y-3 border border-border rounded-xl p-3">
                        {#each [{ kind: "group", label: "Gruppen", entries: data.shareOptions.groups }, { kind: "position", label: "Ämter", entries: data.shareOptions.positions }, { kind: "role", label: "Rollen", entries: data.shareOptions.roles }] as block (block.kind)}
                            {#if block.entries.length > 0}
                                <div class="space-y-1">
                                    <p class="text-xs font-semibold text-fg-subtle uppercase tracking-wide">
                                        {block.label}
                                    </p>
                                    <div class="flex flex-wrap gap-2">
                                        {#each block.entries as entry (entry.id)}
                                            <label
                                                class="flex items-center gap-2 text-xs text-fg px-2.5 py-1.5 rounded-lg border border-border cursor-pointer hover:bg-surface-muted transition"
                                            >
                                                <input
                                                    type="checkbox"
                                                    name="share"
                                                    value={`${block.kind}:${entry.id}`}
                                                    class="rounded border-border-strong"
                                                />
                                                {entry.name}
                                            </label>
                                        {/each}
                                    </div>
                                </div>
                            {/if}
                        {/each}
                    </div>
                </fieldset>
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
