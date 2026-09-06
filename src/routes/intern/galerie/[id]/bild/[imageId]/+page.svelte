<script lang="ts">
    import {
        Alert,
        Button,
        Card,
        FormField,
        Modal,
        PageHeader,
        Textarea
    } from "$lib/components/ui";
    import { formatBytes } from "$lib/components/files/fileMeta";
    import { formatDate } from "$lib/format";
    import type { ActionData, PageData } from "./$types";

    /**
     * Ein Bild in voller Groesse.
     *
     * Hier wird bewusst das ORIGINAL geladen und nicht das Vorschaubild -- wer
     * ein einzelnes Bild oeffnet, will es ansehen. Der reservierte Platz kommt
     * aus `width`/`height`, damit die Seite beim Laden nicht springt.
     *
     * Vor und Zurueck folgen der Reihenfolge der Galerie. Am Anfang und am
     * Ende fehlt die jeweilige Schaltflaeche, statt ins Leere zu zeigen.
     */

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let captionOpen = $state(false);

    const fileUrl = $derived(
        `/intern/galerie/${data.gallery.id}/bild/${data.image.id}/datei`
    );

    const ratio = $derived(
        data.image.width && data.image.height
            ? `aspect-ratio: ${data.image.width} / ${data.image.height};`
            : ""
    );

    function submitForm(name: string) {
        globalThis.document.forms.namedItem(name)?.requestSubmit();
    }
</script>

<svelte:head>
    <title>{data.image.caption || data.image.filename} – {data.gallery.title}</title>
</svelte:head>

<div class="space-y-6">
    <PageHeader
        title={data.image.caption || data.image.filename}
        eyebrow={data.gallery.title}
        subtitle={`Bild ${data.position.index} von ${data.position.total}`}
        back={{ href: `/intern/galerie/${data.gallery.id}`, label: "Zur Galerie" }}
    >
        {#snippet actions()}
            {#if data.canEdit}
                <Button
                    variant="secondary"
                    icon="chat-left-text"
                    onclick={() => (captionOpen = true)}
                >
                    Beschriften
                </Button>
            {/if}
            <Button variant="secondary" icon="download" href={`${fileUrl}?download=1`}>
                Herunterladen
            </Button>
        {/snippet}
    </PageHeader>

    {#if form?.error}
        <Alert tone="danger" message={form.error} />
    {/if}
    {#if form?.success}
        <Alert tone="success" message={form.success} />
    {/if}

    <Card padding="none">
        <div class="bg-surface-sunken flex items-center justify-center" style={ratio}>
            <img
                src={fileUrl}
                alt={data.image.caption || data.image.filename}
                decoding="async"
                width={data.image.width ?? undefined}
                height={data.image.height ?? undefined}
                class="max-w-full max-h-[75vh] object-contain"
            />
        </div>
    </Card>

    {#if data.image.caption}
        <p class="text-sm text-fg">{data.image.caption}</p>
    {/if}

    <p class="text-xs text-fg-subtle tabular-figures">
        {data.image.filename} · {formatBytes(data.image.size)}
        {#if data.image.width && data.image.height}
            · {data.image.width} × {data.image.height}
        {/if}
        · hinzugefügt am {formatDate(data.image.createdAt)}
    </p>

    <nav class="flex items-center justify-between gap-3 flex-wrap" aria-label="Blättern">
        {#if data.previousId}
            <Button
                variant="secondary"
                icon="arrow-left"
                href={`/intern/galerie/${data.gallery.id}/bild/${data.previousId}`}
            >
                Vorheriges Bild
            </Button>
        {:else}
            <span></span>
        {/if}

        {#if data.nextId}
            <Button
                variant="secondary"
                iconRight="arrow-right"
                href={`/intern/galerie/${data.gallery.id}/bild/${data.nextId}`}
            >
                Nächstes Bild
            </Button>
        {:else}
            <span></span>
        {/if}
    </nav>
</div>

{#if data.canEdit}
    <Modal bind:open={captionOpen} title="Bildunterschrift">
        <form method="post" action="?/updateImage" class="space-y-4" id="bildunterschrift">
            <FormField label="Bildunterschrift" hint="Wer oder was ist zu sehen?">
                {#snippet children({ id, describedBy })}
                    <Textarea
                        {id}
                        {describedBy}
                        name="caption"
                        rows={3}
                        value={data.image.caption}
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
