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

    type Folder = PageData["folders"][number];
    type Document = PageData["documents"][number];

    let createOpen = $state(false);
    let shareOpen = $state(false);
    let uploadOpen = $state(false);
    let deleteFolderOpen = $state(false);
    let deleteFolderForm = $state<HTMLFormElement | null>(null);
    let deleteDocumentTarget = $state<Document | null>(null);
    let deleteDocumentOpen = $state(false);
    let deleteDocumentForm = $state<HTMLFormElement | null>(null);

    const current = $derived(data.current);

    /** Nur die Ordner der obersten Ebene; die Unterordner hängen darunter. */
    const roots = $derived(data.folders.filter((folder) => !folder.parentId));

    function childrenOf(parentId: string): Folder[] {
        return data.folders.filter((folder) => folder.parentId === parentId);
    }

    /**
     * Ein Ordner, dessen Elternordner nicht sichtbar ist, hinge sonst nirgends
     * -- er wird deshalb wie ein Wurzelordner behandelt.
     */
    const orphans = $derived(
        data.folders.filter(
            (folder) =>
                folder.parentId && !data.folders.some((other) => other.id === folder.parentId)
        )
    );

    const topLevel = $derived([...roots, ...orphans]);

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

    function formatBytes(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }

    function iconFor(contentType: string): string {
        if (contentType === "application/pdf") return "file-earmark-pdf";
        if (contentType.startsWith("image/")) return "file-earmark-image";
        if (contentType.includes("sheet") || contentType.includes("excel")) {
            return "file-earmark-spreadsheet";
        }
        if (contentType.includes("word") || contentType.includes("text")) {
            return "file-earmark-text";
        }
        return "file-earmark";
    }

    /** Die aktuell gesetzten Freigaben, für die Vorbelegung im Formular. */
    const sharedIds = $derived(new Set((current?.shares ?? []).map((share) => share.targetId)));
    const writableIds = $derived(
        new Set((current?.shares ?? []).filter((share) => share.canWrite).map((s) => s.targetId))
    );

    function askDeleteDocument(document: Document) {
        deleteDocumentTarget = document;
        deleteDocumentOpen = true;
    }
</script>

<svelte:head><title>Dateien - Intern</title></svelte:head>

<div class="space-y-8">
    <PageHeader
        title="Dateien"
        eyebrow="Unterlagen"
        subtitle="Formulare, Vorlagen und Unterlagen – freigegeben an Gruppen, Ämter, Rollen oder einzelne Personen."
        back={{ href: "/intern/dashboard", label: "Zum Dashboard" }}
    >
        {#snippet badge()}
            <Badge tone="primary" label={`${data.folders.length} Ordner`} />
        {/snippet}

        {#snippet actions()}
            {#if data.canManage}
                <Button variant="primary" icon="folder-plus" onclick={() => (createOpen = true)}>
                    Neuer Ordner
                </Button>
            {/if}
        {/snippet}
    </PageHeader>

    {#if form?.error}<Alert tone="danger" message={form.error} />{/if}
    {#if form?.success}<Alert tone="success" message={form.success} />{/if}

    {#if data.folders.length === 0}
        <Card>
            <EmptyState
                icon="folder"
                title="Keine Ordner freigegeben"
                description={data.canManage
                    ? "Lege einen Ordner an und gib ihn für eine Gruppe, ein Amt, eine Rolle oder einzelne Personen frei."
                    : "Für dich ist derzeit kein Ordner freigegeben. Die Stammesführung kann dir Zugriff geben."}
            >
                {#snippet action()}
                    {#if data.canManage}
                        <Button
                            variant="primary"
                            icon="folder-plus"
                            onclick={() => (createOpen = true)}
                        >
                            Ersten Ordner anlegen
                        </Button>
                    {/if}
                {/snippet}
            </EmptyState>
        </Card>
    {:else}
        <div class="grid grid-cols-1 lg:grid-cols-[18rem_1fr] gap-6 items-start">
            <!-- Ordnerbaum -->
            <Card title="Ordner" padding="none">
                <nav aria-label="Ordner" class="p-2">
                    <ul class="space-y-0.5">
                        {#each topLevel as folder (folder.id)}
                            {@render folderItem(folder, 0)}
                        {/each}
                    </ul>
                </nav>
            </Card>

            <!-- Inhalt -->
            <div class="space-y-6 min-w-0">
                {#if current}
                    <Card>
                        {#snippet header()}
                            <div class="min-w-0">
                                {#if current.path.length > 0}
                                    <nav aria-label="Pfad" class="text-xs text-fg-subtle mb-1">
                                        {#each current.path as step, index (step.id)}
                                            <a class="hover:underline" href={`?ordner=${step.id}`}>
                                                {step.name}
                                            </a>
                                            {#if index < current.path.length - 1}
                                                <span aria-hidden="true"> / </span>
                                            {/if}
                                        {/each}
                                    </nav>
                                {/if}
                                <h2 class="text-lg font-semibold text-fg">{current.name}</h2>
                                {#if current.description}
                                    <p class="text-sm text-fg-muted mt-1">{current.description}</p>
                                {/if}
                            </div>
                        {/snippet}

                        {#snippet actions()}
                            {#if current.canWrite && data.canUpload}
                                <Button
                                    variant="primary"
                                    size="sm"
                                    icon="upload"
                                    onclick={() => (uploadOpen = true)}
                                >
                                    Datei ablegen
                                </Button>
                            {/if}
                            {#if data.canManage}
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    icon="share"
                                    onclick={() => (shareOpen = true)}
                                >
                                    Freigaben
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    icon="trash"
                                    ariaLabel={`Ordner ${current.name} löschen`}
                                    onclick={() => (deleteFolderOpen = true)}
                                />
                            {/if}
                        {/snippet}

                        <div class="flex flex-wrap items-center gap-2">
                            {#if current.shares.length === 0}
                                <span class="text-xs text-fg-subtle">
                                    {current.inherited
                                        ? "Sichtbar über den übergeordneten Ordner."
                                        : "Keine eigenen Freigaben."}
                                </span>
                            {:else}
                                {#each current.shares as share (share.id)}
                                    <Badge
                                        tone={share.canWrite ? "success" : "neutral"}
                                        size="xs"
                                        icon={SHARE_ICONS[share.targetKind]}
                                        label={`${SHARE_LABELS[share.targetKind]}: ${share.targetName}${share.canWrite ? " (schreiben)" : ""}`}
                                    />
                                {/each}
                            {/if}
                        </div>
                    </Card>

                    <Card
                        title="Dateien"
                        meta={`${data.documents.length} Einträge`}
                        padding={data.documents.length === 0 ? "md" : "none"}
                    >
                        {#if data.documents.length === 0}
                            <EmptyState
                                icon="file-earmark"
                                title="Noch nichts abgelegt"
                                description={current.canWrite
                                    ? "Lege die erste Datei in diesem Ordner ab."
                                    : "In diesem Ordner liegt noch nichts."}
                            />
                        {:else}
                            <ul class="divide-y divide-border">
                                {#each data.documents as document (document.id)}
                                    <li class="p-4 flex items-start gap-3">
                                        <span
                                            class={`bi bi-${iconFor(document.contentType)} text-xl text-fg-subtle shrink-0`}
                                            aria-hidden="true"
                                        ></span>

                                        <div class="min-w-0 flex-1">
                                            <a
                                                class="text-sm font-semibold text-fg hover:underline break-words"
                                                href={`/intern/dateien/${document.id}`}
                                            >
                                                {document.title}
                                            </a>
                                            {#if document.description}
                                                <p class="text-sm text-fg-muted">
                                                    {document.description}
                                                </p>
                                            {/if}
                                            <p class="text-xs text-fg-subtle mt-1">
                                                {document.filename} · {formatBytes(document.size)}
                                                · {formatDateTime(document.createdAt)}
                                                {#if document.createdBy}
                                                    · {document.createdBy}
                                                {/if}
                                            </p>
                                        </div>

                                        <div class="flex items-center gap-1 shrink-0">
                                            <Button
                                                href={`/intern/dateien/${document.id}`}
                                                variant="ghost"
                                                size="sm"
                                                icon="download"
                                                ariaLabel={`${document.title} herunterladen`}
                                            />
                                            {#if current.canWrite && data.canUpload}
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    icon="trash"
                                                    ariaLabel={`${document.title} löschen`}
                                                    onclick={() => askDeleteDocument(document)}
                                                />
                                            {/if}
                                        </div>
                                    </li>
                                {/each}
                            </ul>
                        {/if}
                    </Card>
                {/if}
            </div>
        </div>
    {/if}
</div>

{#snippet folderItem(folder: Folder, depth: number)}
    <li>
        <a
            href={`?ordner=${folder.id}`}
            class={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${
                current?.id === folder.id
                    ? "bg-primary-subtle text-primary font-semibold"
                    : "text-fg hover:bg-surface-muted"
            }`}
            style={`padding-left: ${0.75 + depth * 0.85}rem`}
            aria-current={current?.id === folder.id ? "page" : undefined}
        >
            <span class="bi bi-folder2 text-fg-subtle" aria-hidden="true"></span>
            <span class="min-w-0 truncate">{folder.name}</span>
            {#if folder.documentCount > 0}
                <span class="ml-auto text-xs text-fg-subtle tabular-nums">
                    {folder.documentCount}
                </span>
            {/if}
        </a>

        {#if folder.childCount > 0}
            <ul class="space-y-0.5">
                {#each childrenOf(folder.id) as child (child.id)}
                    {@render folderItem(child, depth + 1)}
                {/each}
            </ul>
        {/if}
    </li>
{/snippet}

<!-- Ordner anlegen -->
<Modal bind:open={createOpen} title="Neuer Ordner">
    <form method="post" action="?/createFolder" class="space-y-4" id="ordner-anlegen">
        <FormField label="Name" required>
            {#snippet children({ id })}
                <TextInput {id} name="name" required placeholder="Formulare" />
            {/snippet}
        </FormField>
        <FormField label="Beschreibung">
            {#snippet children({ id })}
                <TextInput {id} name="description" placeholder="Anmeldungen und Vorlagen" />
            {/snippet}
        </FormField>
        <FormField label="Übergeordneter Ordner" hint="Erbt dessen Freigaben.">
            {#snippet children({ id })}
                <select
                    {id}
                    name="parentId"
                    class="w-full px-4 py-3 rounded-xl text-sm bg-surface text-fg border border-border-strong shadow-sm"
                >
                    <option value="">Oberste Ebene</option>
                    {#each data.folders as folder (folder.id)}
                        <option value={folder.id} selected={current?.id === folder.id}>
                            {folder.path.map((step) => step.name).join(" / ")}{folder.path.length
                                ? " / "
                                : ""}{folder.name}
                        </option>
                    {/each}
                </select>
            {/snippet}
        </FormField>
    </form>

    {#snippet footer()}
        <Button variant="secondary" onclick={() => (createOpen = false)}>Abbrechen</Button>
        <Button
            variant="primary"
            icon="folder-plus"
            onclick={() => document.forms.namedItem("ordner-anlegen")?.requestSubmit()}
        >
            Anlegen
        </Button>
    {/snippet}
</Modal>

<!-- Freigaben -->
{#if current && data.canManage && data.shareOptions}
    <Modal bind:open={shareOpen} title={`Freigaben für „${current.name}“`}>
        <form method="post" action="?/setShares" class="space-y-5" id="freigaben">
            <input type="hidden" name="folderId" value={current.id} />

            <p class="text-sm text-fg-muted">
                Wer hier steht, sieht den Ordner und alle Unterordner. Das Häkchen „schreiben“
                erlaubt zusätzlich das Ablegen von Dateien.
            </p>

            {#each [{ kind: "group", label: "Gruppen", entries: data.shareOptions.groups }, { kind: "position", label: "Ämter", entries: data.shareOptions.positions }, { kind: "role", label: "Rollen", entries: data.shareOptions.roles }, { kind: "user", label: "Einzelne Personen", entries: data.shareOptions.users }] as block (block.kind)}
                {#if block.entries.length > 0}
                    <fieldset class="space-y-1.5">
                        <legend class="text-xs font-semibold text-fg-subtle uppercase tracking-wide">
                            {block.label}
                        </legend>
                        <div class="space-y-1">
                            {#each block.entries as entry (entry.id)}
                                <div
                                    class="flex items-center gap-3 px-3 py-2 rounded-lg border border-border"
                                >
                                    <label class="flex items-center gap-2 text-sm text-fg flex-1 min-w-0 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            name="share"
                                            value={`${block.kind}:${entry.id}`}
                                            checked={sharedIds.has(entry.id)}
                                            class="rounded border-border-strong"
                                        />
                                        <span class="truncate">{entry.name}</span>
                                    </label>
                                    <label class="flex items-center gap-1.5 text-xs text-fg-muted cursor-pointer shrink-0">
                                        <input
                                            type="checkbox"
                                            name={`write_${block.kind}:${entry.id}`}
                                            checked={writableIds.has(entry.id)}
                                            class="rounded border-border-strong"
                                        />
                                        schreiben
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
            <Button
                variant="primary"
                icon="check-lg"
                onclick={() => document.forms.namedItem("freigaben")?.requestSubmit()}
            >
                Speichern
            </Button>
        {/snippet}
    </Modal>
{/if}

<!-- Hochladen -->
{#if current}
    <Modal bind:open={uploadOpen} title={`Datei in „${current.name}“ ablegen`}>
        <form
            method="post"
            action="?/upload"
            enctype="multipart/form-data"
            class="space-y-4"
            id="datei-ablegen"
        >
            <input type="hidden" name="folderId" value={current.id} />

            <FormField label="Datei" required hint="Höchstens 10 MB.">
                {#snippet children({ id })}
                    <input
                        {id}
                        type="file"
                        name="file"
                        required
                        class="w-full text-sm text-fg file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-surface-muted file:text-fg file:text-sm"
                    />
                {/snippet}
            </FormField>

            <FormField label="Titel" hint="Ohne Angabe wird der Dateiname verwendet.">
                {#snippet children({ id })}
                    <TextInput {id} name="title" placeholder="Anmeldung Sommerlager" />
                {/snippet}
            </FormField>

            <FormField label="Beschreibung">
                {#snippet children({ id })}
                    <TextInput {id} name="description" placeholder="Bitte bis 30.06. abgeben." />
                {/snippet}
            </FormField>
        </form>

        {#snippet footer()}
            <Button variant="secondary" onclick={() => (uploadOpen = false)}>Abbrechen</Button>
            <Button
                variant="primary"
                icon="upload"
                onclick={() => document.forms.namedItem("datei-ablegen")?.requestSubmit()}
            >
                Ablegen
            </Button>
        {/snippet}
    </Modal>
{/if}

<ConfirmDialog
    bind:open={deleteFolderOpen}
    title="Ordner löschen"
    message={current
        ? `„${current.name}“ wird mit allen Unterordnern und Dateien dauerhaft entfernt.`
        : ""}
    confirmLabel="Endgültig löschen"
    onconfirm={() => deleteFolderForm?.requestSubmit()}
/>

<ConfirmDialog
    bind:open={deleteDocumentOpen}
    title="Datei löschen"
    message={deleteDocumentTarget
        ? `„${deleteDocumentTarget.title}“ wird dauerhaft entfernt.`
        : ""}
    confirmLabel="Endgültig löschen"
    onconfirm={() => deleteDocumentForm?.requestSubmit()}
    oncancel={() => (deleteDocumentTarget = null)}
/>

<form method="post" action="?/deleteFolder" bind:this={deleteFolderForm} class="hidden">
    <input type="hidden" name="folderId" value={current?.id ?? ""} />
</form>

<form method="post" action="?/deleteDocument" bind:this={deleteDocumentForm} class="hidden">
    <input type="hidden" name="documentId" value={deleteDocumentTarget?.id ?? ""} />
    <input type="hidden" name="folderId" value={current?.id ?? ""} />
</form>
