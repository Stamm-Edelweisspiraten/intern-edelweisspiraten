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
        TextInput,
        Textarea
    } from "$lib/components/ui";
    import { formatBytes } from "$lib/components/files/fileMeta";
    import { formatDate } from "$lib/format";
    import type { ActionData, PageData } from "./$types";

    /**
     * Uebersicht der Galerien als Kachelraster.
     *
     * Eine Tabelle waere hier falsch: eine Galerie erkennt man am Bild. Die
     * Kachel zeigt deshalb das Titelbild gross, darunter Titel, Bildzahl und
     * den Termin, an dem die Galerie haengt.
     *
     * Das Titelbild kommt als VORSCHAUBILD (`?klein=1`) -- bei zwoelf Kacheln
     * waeren zwoelf Originale je mehrere Megabyte. Gibt es kein Vorschaubild
     * (Bild ohne JavaScript hochgeladen), liefert die Route das Original aus.
     */

    let { data, form }: { data: PageData; form: ActionData } = $props();

    /**
     * Beschriftungen der Freigabearten.
     *
     * Bewusst hier und nicht aus `$lib/server/shareService` importiert: alles
     * unter `$lib/server` ist Servercode und darf im Browser gar nicht erst
     * landen.
     */
    const SHARE_LABELS: Record<string, string> = {
        group: "Gruppe",
        position: "Amt",
        role: "Rolle",
        user: "Person"
    };

    const SHARE_ICONS: Record<string, string> = {
        group: "diagram-3",
        position: "briefcase",
        role: "shield-lock",
        user: "person"
    };

    type Gallery = PageData["galleries"][number];

    let createOpen = $state(false);
    let confirmOpen = $state(false);
    let pending = $state<Gallery | null>(null);
    let deleteForm = $state<HTMLFormElement | null>(null);

    const eventOptions = $derived([
        ...data.eventOptions.map((entry) => ({
            value: entry.id,
            label: `${formatDate(entry.startsAt)} – ${entry.title}`
        }))
    ]);

    function submitForm(name: string) {
        globalThis.document.forms.namedItem(name)?.requestSubmit();
    }

    function askDelete(gallery: Gallery) {
        pending = gallery;
        confirmOpen = true;
    }

    function coverUrl(gallery: Gallery): string {
        return `/intern/galerie/${gallery.id}/bild/${gallery.coverImageResolved}/datei?klein=1`;
    }
</script>

<svelte:head>
    <title>Galerie</title>
</svelte:head>

<div class="space-y-6">
    <PageHeader
        title="Galerie"
        subtitle="Bilder von Fahrten, Lagern und Gruppenstunden."
    >
        {#snippet actions()}
            {#if data.canManage}
                <Button variant="primary" icon="plus-lg" onclick={() => (createOpen = true)}>
                    Neue Galerie
                </Button>
            {/if}
        {/snippet}
    </PageHeader>

    {#if form?.error}
        <Alert tone="danger" message={form.error} />
    {/if}
    {#if form?.success}
        <Alert tone="success" message={form.success} />
    {/if}

    {#if data.galleries.length === 0}
        <Card>
            <EmptyState
                icon="images"
                title="Noch keine Galerie"
                description="Galerien sammeln die Bilder einer Fahrt oder eines Lagers. Wer keine Freigabe setzt, macht sie für alle sichtbar."
            >
                {#snippet action()}
                    {#if data.canManage}
                        <Button
                            variant="primary"
                            icon="plus-lg"
                            onclick={() => (createOpen = true)}
                        >
                            Neue Galerie
                        </Button>
                    {/if}
                {/snippet}
            </EmptyState>
        </Card>
    {:else}
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {#each data.galleries as gallery (gallery.id)}
                <article
                    class="rounded-card border border-border bg-surface overflow-hidden flex flex-col"
                    style="box-shadow: var(--shadow-card);"
                >
                    <a
                        href={`/intern/galerie/${gallery.id}`}
                        class="block bg-surface-sunken"
                        style="aspect-ratio: 3 / 2;"
                    >
                        {#if gallery.coverImageResolved}
                            <img
                                src={coverUrl(gallery)}
                                alt={`Titelbild der Galerie ${gallery.title}`}
                                loading="lazy"
                                decoding="async"
                                class="w-full h-full object-cover"
                            />
                        {:else}
                            <span
                                class="w-full h-full flex items-center justify-center text-fg-subtle"
                            >
                                <span class="bi bi-images text-3xl" aria-hidden="true"></span>
                            </span>
                        {/if}
                    </a>

                    <div class="p-4 space-y-2 flex-1 flex flex-col">
                        <h2 class="text-base font-semibold text-fg">
                            <a href={`/intern/galerie/${gallery.id}`} class="hover:underline">
                                {gallery.title}
                            </a>
                        </h2>

                        {#if gallery.description}
                            <p class="text-sm text-fg-muted line-clamp-2">
                                {gallery.description}
                            </p>
                        {/if}

                        <p class="text-xs text-fg-subtle tabular-figures">
                            {gallery.imageCount} Bild(er) · {formatBytes(gallery.totalBytes)} ·
                            angelegt am {formatDate(gallery.createdAt)}
                        </p>

                        {#if gallery.eventId && gallery.eventTitle}
                            <p class="text-xs text-fg-muted">
                                <span class="bi bi-calendar-event" aria-hidden="true"></span>
                                <a
                                    href={`/intern/termine/${gallery.eventId}`}
                                    class="hover:underline"
                                >
                                    {gallery.eventTitle}
                                </a>
                            </p>
                        {/if}

                        <div class="flex flex-wrap gap-1.5">
                            {#if gallery.shares.length === 0}
                                <Badge tone="neutral" icon="globe" label="Für alle sichtbar" />
                            {:else}
                                {#each gallery.shares as share (share.id)}
                                    <Badge
                                        tone={share.canWrite ? "success" : "neutral"}
                                        icon={SHARE_ICONS[share.targetKind]}
                                        label={`${SHARE_LABELS[share.targetKind]}: ${share.targetName}${share.canWrite ? " (hochladen)" : ""}`}
                                    />
                                {/each}
                            {/if}
                        </div>

                        {#if gallery.canManage}
                            <div class="pt-2 mt-auto flex justify-end">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    icon="trash"
                                    onclick={() => askDelete(gallery)}
                                >
                                    Löschen
                                </Button>
                            </div>
                        {/if}
                    </div>
                </article>
            {/each}
        </div>
    {/if}
</div>

<!--
    Loeschen: das Formular bleibt ohne JavaScript absendbar, die Rueckfrage
    entfaellt dann lediglich.
-->
{#if pending}
    <form method="post" action="?/delete" bind:this={deleteForm} class="hidden">
        <input type="hidden" name="galleryId" value={pending.id} />
    </form>

    <ConfirmDialog
        bind:open={confirmOpen}
        title="Galerie löschen"
        message={`„${pending.title}“ und alle ${pending.imageCount} Bilder darin werden endgültig gelöscht.`}
        confirmLabel="Endgültig löschen"
        onconfirm={() => deleteForm?.requestSubmit()}
    />
{/if}

{#if data.canManage && data.shareOptions}
    <Modal bind:open={createOpen} title="Neue Galerie" size="lg">
        <form method="post" action="?/create" class="space-y-5" id="galerie-anlegen">
            <FormField label="Titel" required>
                {#snippet children({ id, describedBy, invalid })}
                    <TextInput
                        {id}
                        {describedBy}
                        {invalid}
                        name="title"
                        required
                        placeholder="Sommerlager 2026"
                    />
                {/snippet}
            </FormField>

            <FormField label="Beschreibung">
                {#snippet children({ id, describedBy })}
                    <Textarea {id} {describedBy} name="description" rows={3} />
                {/snippet}
            </FormField>

            <FormField label="Termin" hint="Optional – verknüpft die Galerie mit einem Termin.">
                {#snippet children({ id, describedBy })}
                    <Select
                        {id}
                        {describedBy}
                        name="eventId"
                        options={eventOptions}
                        placeholder="– kein Termin –"
                    />
                {/snippet}
            </FormField>

            <fieldset class="space-y-3">
                <legend class="text-sm font-semibold text-fg-muted">Freigaben</legend>
                <p class="text-xs text-fg-subtle">
                    Ohne Freigabe ist die Galerie für alle sichtbar. Das Häkchen „hochladen“
                    erlaubt zusätzlich, Bilder beizusteuern.
                </p>

                {#each [{ kind: "group", label: "Gruppen", entries: data.shareOptions.groups }, { kind: "position", label: "Ämter", entries: data.shareOptions.positions }, { kind: "role", label: "Rollen", entries: data.shareOptions.roles }, { kind: "user", label: "Einzelne Personen", entries: data.shareOptions.users }] as block (block.kind)}
                    {#if block.entries.length > 0}
                        <fieldset class="space-y-1.5">
                            <legend
                                class="text-xs font-semibold text-fg-subtle uppercase tracking-wide"
                            >
                                {block.label}
                            </legend>
                            <div class="space-y-1">
                                {#each block.entries as entry (entry.id)}
                                    <div
                                        class="flex items-center gap-3 px-3 py-2 rounded-control border border-border"
                                    >
                                        <label
                                            class="flex items-center gap-2 text-sm text-fg flex-1 min-w-0 cursor-pointer"
                                        >
                                            <input
                                                type="checkbox"
                                                name="share"
                                                value={`${block.kind}:${entry.id}`}
                                                class="rounded-control border-border-strong"
                                            />
                                            <span class="truncate">{entry.name}</span>
                                        </label>
                                        <label
                                            class="flex items-center gap-1.5 text-xs text-fg-muted cursor-pointer shrink-0"
                                        >
                                            <input
                                                type="checkbox"
                                                name={`write_${block.kind}:${entry.id}`}
                                                class="rounded-control border-border-strong"
                                            />
                                            hochladen
                                        </label>
                                    </div>
                                {/each}
                            </div>
                        </fieldset>
                    {/if}
                {/each}
            </fieldset>
        </form>

        {#snippet footer()}
            <Button variant="secondary" onclick={() => (createOpen = false)}>Abbrechen</Button>
            <Button
                variant="primary"
                icon="check-lg"
                onclick={() => submitForm("galerie-anlegen")}
            >
                Anlegen
            </Button>
        {/snippet}
    </Modal>
{/if}
