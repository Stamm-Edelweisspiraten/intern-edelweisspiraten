<script lang="ts">
    import { Badge, Card, PageHeader } from "$lib/components/ui";
    import FilePreview from "$lib/components/files/FilePreview.svelte";
    import { typeLabel } from "$lib/components/files/fileMeta";
    import type { PageData } from "./$types";

    let { data }: { data: PageData } = $props();

    const backHref = $derived(`/intern/dateien?ordner=${data.folder.id}`);
</script>

<svelte:head><title>{data.document.title} - Dateien - Intern</title></svelte:head>

<div class="space-y-6">
    <PageHeader
        title={data.document.title}
        eyebrow="Vorschau"
        subtitle={data.document.filename}
        back={{ href: backHref, label: `Zurück zu „${data.folder.name}“` }}
    >
        {#snippet badge()}
            <Badge tone="neutral" label={typeLabel(data.document.contentType)} />
        {/snippet}
    </PageHeader>

    <nav aria-label="Pfad" class="text-xs text-fg-subtle">
        {#each data.folder.path as step (step.id)}
            <a class="hover:underline" href={`/intern/dateien?ordner=${step.id}`}>{step.name}</a>
            <span aria-hidden="true"> / </span>
        {/each}
        <a class="hover:underline" href={backHref}>{data.folder.name}</a>
    </nav>

    <Card>
        <FilePreview
            document={data.document}
            initial={data.content}
            initialError={data.contentError}
            height="70vh"
        />
    </Card>
</div>
