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
    import ImageDropZone from "$lib/components/gallery/ImageDropZone.svelte";
    import { formatBytes } from "$lib/components/files/fileMeta";
    import { formatDate } from "$lib/format";
    import type { ActionData, PageData } from "./$types";

    /**
     * Eine Galerie mit ihren Bildern.
     *
     * Das Raster zeigt Vorschaubilder (`?klein=1`); erst die Einzelansicht
     * laedt das Original. Jede Kachel bekommt ihr Seitenverhaeltnis aus
     * `width`/`height` mit -- ohne das springt das Raster beim Nachladen, weil
     * der Platz erst feststeht, wenn das Bild da ist.
     *
     * Zwei Wege zur Reihenfolge: die Pfeile an jeder Kachel senden ein
     * gewoehnliches Formular (und funktionieren damit ohne JavaScript), der
     * Sortierdialog schickt die ganze Liste auf einmal. Ein veraltetes
     * Formular kann dabei kein Bild verlieren -- `reorderImages` haengt
     * fehlende Kennungen hinten an.
     */

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type Image = PageData["images"][number];

    /**
     * Beschriftungen der Freigabearten. Bewusst hier und nicht aus
     * `$lib/server/shareService`: alles unter `$lib/server` ist Servercode.
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

    let editOpen = $state(false);
    let shareOpen = $state(false);
    let uploadOpen = $state(false);
    let sortOpen = $state(false);
    let captionOpen = $state(false);

    let captionImage = $state<Image | null>(null);
    let pendingImage = $state<Image | null>(null);
    let confirmImageOpen = $state(false);
    let confirmGalleryOpen = $state(false);

    let deleteImageForm = $state<HTMLFormElement | null>(null);
    let deleteGalleryForm = $state<HTMLFormElement | null>(null);

    /** Die Reihenfolge im Sortierdialog -- erst beim Absenden verbindlich. */
    let sortOrder = $state<Image[]>([]);

    const eventOptions = $derived(
        data.eventOptions.map((entry) => ({
            value: entry.id,
            label: `${formatDate(entry.startsAt)} – ${entry.title}`
        }))
    );

    const sharedIds = $derived(new Set(data.gallery.shares.map((share) => share.targetId)));
    const writableIds = $derived(
        new Set(
            data.gallery.shares.filter((share) => share.canWrite).map((share) => share.targetId)
        )
    );

    function submitForm(name: string) {
        globalThis.document.forms.namedItem(name)?.requestSubmit();
    }

    function thumbUrl(image: Image): string {
        return `/intern/galerie/${data.gallery.id}/bild/${image.id}/datei?klein=1`;
    }

    function viewUrl(image: Image): string {
        return `/intern/galerie/${data.gallery.id}/bild/${image.id}`;
    }

    /** Seitenverhaeltnis der Kachel -- ohne Abmessungen ein ruhiges 3:2. */
    function ratio(image: Image): string {
        if (image.width && image.height) return `aspect-ratio: ${image.width} / ${image.height};`;
        return "aspect-ratio: 3 / 2;";
    }

    function openCaption(image: Image) {
        captionImage = image;
        captionOpen = true;
    }

    function askDeleteImage(image: Image) {
        pendingImage = image;
        confirmImageOpen = true;
    }

    function openSort() {
        sortOrder = [...data.images];
        sortOpen = true;
    }

    function moveInSort(index: number, direction: -1 | 1) {
        const target = index + direction;
        if (target < 0 || target >= sortOrder.length) return;
        const next = [...sortOrder];
        [next[index], next[target]] = [next[target], next[index]];
        sortOrder = next;
    }
</script>

<svelte:head>
    <title>{data.gallery.title} – Galerie</title>
</svelte:head>

<div class="space-y-6">
    <PageHeader
        title={data.gallery.title}
        eyebrow="Galerie"
        subtitle={data.gallery.description || undefined}
        back={{ href: "/intern/galerie", label: "Alle Galerien" }}
    >
        {#snippet actions()}
            {#if data.canManage}
                <Button variant="secondary" icon="pencil" onclick={() => (editOpen = true)}>
                    Bearbeiten
                </Button>
                <Button variant="secondary" icon="share" onclick={() => (shareOpen = true)}>
                    Freigaben
                </Button>
                {#if data.images.length > 1}
                    <Button variant="secondary" icon="sort-down" onclick={openSort}>
                        Sortieren
                    </Button>
                {/if}
                <Button
                    variant="danger"
                    icon="trash"
                    onclick={() => (confirmGalleryOpen = true)}
                >
                    Löschen
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

    <Card padding="sm">
        <div class="flex items-center justify-between gap-4 flex-wrap">
            <p class="text-sm text-fg-muted tabular-figures">
                {data.gallery.imageCount} Bild(er) · {formatBytes(data.gallery.totalBytes)}
                {#if data.gallery.eventId && data.gallery.eventTitle}
                    ·
                    <a
                        href={`/intern/termine/${data.gallery.eventId}`}
                        class="hover:underline"
                    >
                        {data.gallery.eventTitle}
                    </a>
                {/if}
            </p>

            <div class="flex flex-wrap gap-1.5">
                {#if data.gallery.shares.length === 0}
                    <Badge tone="neutral" icon="globe" label="Für alle sichtbar" />
                {:else}
                    {#each data.gallery.shares as share (share.id)}
                        <Badge
                            tone={share.canWrite ? "success" : "neutral"}
                            icon={SHARE_ICONS[share.targetKind]}
                            label={`${SHARE_LABELS[share.targetKind]}: ${share.targetName}${share.canWrite ? " (hochladen)" : ""}`}
                        />
                    {/each}
                {/if}
            </div>
        </div>
    </Card>

    {#if data.canUpload}
        <div class="space-y-2">
            <ImageDropZone galleryId={data.gallery.id} />
            <p class="text-xs text-fg-subtle text-center">
                Ohne JavaScript geht es
                <button
                    type="button"
                    class="underline font-semibold"
                    onclick={() => (uploadOpen = true)}
                >
                    über dieses Formular
                </button>.
            </p>
        </div>
    {/if}

    {#if data.images.length === 0}
        <Card>
            <EmptyState
                icon="image"
                title="Noch keine Bilder"
                description={data.canUpload
                    ? "Bilder hierher ziehen oder über die Schaltfläche auswählen."
                    : "Sobald jemand Bilder hochlädt, erscheinen sie hier."}
            />
        </Card>
    {:else}
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {#each data.images as image, index (image.id)}
                <article
                    class="rounded-card border border-border bg-surface overflow-hidden flex flex-col"
                    style="box-shadow: var(--shadow-card);"
                >
                    <a href={viewUrl(image)} class="block bg-surface-sunken" style={ratio(image)}>
                        <img
                            src={thumbUrl(image)}
                            alt={image.caption || image.filename}
                            loading="lazy"
                            decoding="async"
                            width={image.width ?? undefined}
                            height={image.height ?? undefined}
                            class="w-full h-full object-cover"
                        />
                    </a>

                    <div class="p-3 space-y-2 flex-1 flex flex-col">
                        <p class="text-sm text-fg">
                            {image.caption || image.filename}
                        </p>
                        <p class="text-xs text-fg-subtle tabular-figures">
                            {formatBytes(image.size)}
                            {#if image.width && image.height}
                                · {image.width} × {image.height}
                            {/if}
                            {#if !image.hasThumb}
                                · ohne Vorschaubild
                            {/if}
                            {#if data.gallery.coverImageId === image.id}
                                · Titelbild
                            {/if}
                        </p>

                        <div class="flex flex-wrap items-center gap-1 pt-1 mt-auto">
                            {#if data.canUpload}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    icon="chat-left-text"
                                    onclick={() => openCaption(image)}
                                >
                                    Beschriften
                                </Button>
                            {/if}

                            {#if data.canManage}
                                <!-- Pfeile als eigene Formulare: kein JavaScript nötig. -->
                                <form method="post" action="?/move" class="inline">
                                    <input type="hidden" name="imageId" value={image.id} />
                                    <input type="hidden" name="direction" value="up" />
                                    <Button
                                        type="submit"
                                        variant="ghost"
                                        size="sm"
                                        icon="arrow-up"
                                        ariaLabel="Nach vorne"
                                        disabled={index === 0}
                                    />
                                </form>
                                <form method="post" action="?/move" class="inline">
                                    <input type="hidden" name="imageId" value={image.id} />
                                    <input type="hidden" name="direction" value="down" />
                                    <Button
                                        type="submit"
                                        variant="ghost"
                                        size="sm"
                                        icon="arrow-down"
                                        ariaLabel="Nach hinten"
                                        disabled={index === data.images.length - 1}
                                    />
                                </form>
                                <form method="post" action="?/setCover" class="inline">
                                    <input
                                        type="hidden"
                                        name="imageId"
                                        value={data.gallery.coverImageId === image.id
                                            ? ""
                                            : image.id}
                                    />
                                    <Button
                                        type="submit"
                                        variant="ghost"
                                        size="sm"
                                        icon={data.gallery.coverImageId === image.id
                                            ? "star-fill"
                                            : "star"}
                                        ariaLabel={data.gallery.coverImageId === image.id
                                            ? "Titelbild entfernen"
                                            : "Als Titelbild setzen"}
                                    />
                                </form>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    icon="trash"
                                    ariaLabel="Bild löschen"
                                    onclick={() => askDeleteImage(image)}
                                />
                            {/if}
                        </div>
                    </div>
                </article>
            {/each}
        </div>
    {/if}
</div>

<!-- Zerstörendes: das Formular bleibt ohne JavaScript absendbar. -->
{#if pendingImage}
    <form method="post" action="?/deleteImage" bind:this={deleteImageForm} class="hidden">
        <input type="hidden" name="imageId" value={pendingImage.id} />
    </form>

    <ConfirmDialog
        bind:open={confirmImageOpen}
        title="Bild löschen"
        message={`„${pendingImage.caption || pendingImage.filename}“ wird endgültig gelöscht – Original und Vorschaubild.`}
        confirmLabel="Endgültig löschen"
        onconfirm={() => deleteImageForm?.requestSubmit()}
    />
{/if}

{#if data.canManage}
    <form method="post" action="?/deleteGallery" bind:this={deleteGalleryForm} class="hidden">
    </form>

    <ConfirmDialog
        bind:open={confirmGalleryOpen}
        title="Galerie löschen"
        message={`„${data.gallery.title}“ und alle ${data.gallery.imageCount} Bilder darin werden endgültig gelöscht.`}
        confirmLabel="Endgültig löschen"
        onconfirm={() => deleteGalleryForm?.requestSubmit()}
    />
{/if}

<!-- Bildunterschrift -->
{#if captionImage && data.canUpload}
    <Modal bind:open={captionOpen} title="Bildunterschrift">
        <form method="post" action="?/updateImage" class="space-y-4" id="bildunterschrift">
            <input type="hidden" name="imageId" value={captionImage.id} />

            <FormField label="Bildunterschrift" hint="Wer oder was ist zu sehen?">
                {#snippet children({ id, describedBy })}
                    <Textarea
                        {id}
                        {describedBy}
                        name="caption"
                        rows={3}
                        value={captionImage?.caption ?? ""}
                    />
                {/snippet}
            </FormField>
        </form>

        {#snippet footer()}
            <Button variant="secondary" onclick={() => (captionOpen = false)}>Abbrechen</Button>
            <Button
                variant="primary"
                icon="check-lg"
                onclick={() => submitForm("bildunterschrift")}
            >
                Speichern
            </Button>
        {/snippet}
    </Modal>
{/if}

<!-- Hochladen: der Rückfall ohne JavaScript -->
{#if data.canUpload}
    <Modal bind:open={uploadOpen} title="Bild hochladen">
        <form
            method="post"
            action="?/upload"
            enctype="multipart/form-data"
            class="space-y-4"
            id="bild-hochladen"
        >
            <FormField label="Bilddatei" required>
                {#snippet children({ id })}
                    <input
                        {id}
                        type="file"
                        name="file"
                        required
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        class="w-full text-sm text-fg file:mr-3 file:px-3 file:py-2 file:rounded-control file:border file:border-border file:bg-surface-muted file:text-fg file:text-sm"
                    />
                {/snippet}
            </FormField>

            <FormField label="Bildunterschrift">
                {#snippet children({ id, describedBy })}
                    <TextInput {id} {describedBy} name="caption" />
                {/snippet}
            </FormField>

            <p class="text-xs text-fg-subtle">
                Auf diesem Weg entsteht kein Vorschaubild – das Raster zeigt dann das Original.
            </p>
        </form>

        {#snippet footer()}
            <Button variant="secondary" onclick={() => (uploadOpen = false)}>Abbrechen</Button>
            <Button
                variant="primary"
                icon="upload"
                onclick={() => submitForm("bild-hochladen")}
            >
                Hochladen
            </Button>
        {/snippet}
    </Modal>
{/if}

<!-- Sortieren -->
{#if data.canManage}
    <Modal bind:open={sortOpen} title="Reihenfolge" size="lg">
        <form method="post" action="?/reorder" class="space-y-2" id="reihenfolge">
            <p class="text-sm text-fg-muted">
                Die Reihenfolge gilt für das Raster und die Einzelansicht.
            </p>

            <ul class="space-y-1">
                {#each sortOrder as image, index (image.id)}
                    <li
                        class="flex items-center gap-3 px-3 py-2 rounded-control border border-border"
                    >
                        <input type="hidden" name="order" value={image.id} />
                        <img
                            src={thumbUrl(image)}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            class="w-12 h-12 object-cover rounded-control bg-surface-sunken"
                        />
                        <span class="text-sm text-fg flex-1 min-w-0 truncate">
                            {image.caption || image.filename}
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            icon="arrow-up"
                            ariaLabel="Nach vorne"
                            disabled={index === 0}
                            onclick={() => moveInSort(index, -1)}
                        />
                        <Button
                            variant="ghost"
                            size="sm"
                            icon="arrow-down"
                            ariaLabel="Nach hinten"
                            disabled={index === sortOrder.length - 1}
                            onclick={() => moveInSort(index, 1)}
                        />
                    </li>
                {/each}
            </ul>
        </form>

        {#snippet footer()}
            <Button variant="secondary" onclick={() => (sortOpen = false)}>Abbrechen</Button>
            <Button variant="primary" icon="check-lg" onclick={() => submitForm("reihenfolge")}>
                Reihenfolge speichern
            </Button>
        {/snippet}
    </Modal>
{/if}

<!-- Bearbeiten -->
{#if data.canManage}
    <Modal bind:open={editOpen} title="Galerie bearbeiten">
        <form method="post" action="?/update" class="space-y-5" id="galerie-bearbeiten">
            <FormField label="Titel" required>
                {#snippet children({ id, describedBy, invalid })}
                    <TextInput
                        {id}
                        {describedBy}
                        {invalid}
                        name="title"
                        required
                        value={data.gallery.title}
                    />
                {/snippet}
            </FormField>

            <FormField label="Beschreibung">
                {#snippet children({ id, describedBy })}
                    <Textarea
                        {id}
                        {describedBy}
                        name="description"
                        rows={3}
                        value={data.gallery.description}
                    />
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
                        value={data.gallery.eventId ?? ""}
                    />
                {/snippet}
            </FormField>
        </form>

        {#snippet footer()}
            <Button variant="secondary" onclick={() => (editOpen = false)}>Abbrechen</Button>
            <Button
                variant="primary"
                icon="check-lg"
                onclick={() => submitForm("galerie-bearbeiten")}
            >
                Speichern
            </Button>
        {/snippet}
    </Modal>
{/if}

<!-- Freigaben -->
{#if data.canManage && data.shareOptions}
    <Modal bind:open={shareOpen} title={`Freigaben für „${data.gallery.title}“`}>
        <form method="post" action="?/setShares" class="space-y-5" id="freigaben">
            <p class="text-sm text-fg-muted">
                Ohne Freigabe ist die Galerie für alle sichtbar. Das Häkchen „hochladen“ erlaubt
                zusätzlich, Bilder beizusteuern.
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
                                            checked={sharedIds.has(entry.id)}
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
                                            checked={writableIds.has(entry.id)}
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
        </form>

        {#snippet footer()}
            <Button variant="secondary" onclick={() => (shareOpen = false)}>Abbrechen</Button>
            <Button variant="primary" icon="check-lg" onclick={() => submitForm("freigaben")}>
                Speichern
            </Button>
        {/snippet}
    </Modal>
{/if}
