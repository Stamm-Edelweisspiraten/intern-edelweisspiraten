<script lang="ts">
    import { goto } from "$app/navigation";
    import {
        Alert,
        Badge,
        Button,
        Card,
        ConfirmDialog,
        DataTable,
        EmptyState,
        FormField,
        Modal,
        PageHeader,
        SearchInput,
        Select,
        TextInput
    } from "$lib/components/ui";
    import DropZone from "$lib/components/files/DropZone.svelte";
    import FilePreview from "$lib/components/files/FilePreview.svelte";
    import { canPreview, formatBytes, iconFor, typeLabel } from "$lib/components/files/fileMeta";
    import { formatDateTime } from "$lib/format";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type Folder = PageData["folders"][number];
    type Entry = PageData["documents"][number];

    // -----------------------------------------------------------------------
    // Ordnerbaum
    // -----------------------------------------------------------------------

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

    /** Vollständiger Pfad eines Ordners, für die Auswahllisten. */
    function labelFor(folder: Folder): string {
        const steps = folder.path.map((step) => step.name);
        return [...steps, folder.name].join(" / ");
    }

    const folderOptions = $derived(
        [...data.folders]
            .map((folder) => ({ value: folder.id, label: labelFor(folder) }))
            .sort((a, b) => a.label.localeCompare(b.label, "de"))
    );

    /** Nur Ordner, in die auch abgelegt werden darf -- als Verschiebeziel. */
    const writableOptions = $derived(
        [...data.folders]
            .filter((folder) => folder.canWrite)
            .map((folder) => ({ value: folder.id, label: labelFor(folder) }))
            .sort((a, b) => a.label.localeCompare(b.label, "de"))
    );

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

    /** Die aktuell gesetzten Freigaben, für die Vorbelegung im Formular. */
    const sharedIds = $derived(new Set((current?.shares ?? []).map((share) => share.targetId)));
    const writableIds = $derived(
        new Set((current?.shares ?? []).filter((share) => share.canWrite).map((s) => s.targetId))
    );

    const mayEdit = $derived(Boolean(current?.canWrite && data.canUpload));

    // -----------------------------------------------------------------------
    // Suche und Sortierung
    // -----------------------------------------------------------------------

    let search = $state("");

    const filtered = $derived(
        search.trim() === ""
            ? data.documents
            : data.documents.filter((entry) => {
                  const needle = search.trim().toLowerCase();
                  return (
                      entry.title.toLowerCase().includes(needle) ||
                      entry.filename.toLowerCase().includes(needle) ||
                      entry.description.toLowerCase().includes(needle)
                  );
              })
    );

    const SORT_OPTIONS = [
        { value: "date", label: "Datum" },
        { value: "name", label: "Name" },
        { value: "size", label: "Größe" },
        { value: "type", label: "Typ" }
    ];

    /**
     * Sortiert wird auf dem Server; die Auswahl steht in der Adresszeile.
     * Damit bleibt sie beim Neuladen erhalten und lässt sich verlinken.
     */
    function applySort(sort: string, direction: string) {
        if (!current) return;
        const params = new URLSearchParams({
            ordner: current.id,
            sortieren: sort,
            richtung: direction
        });
        void goto(`/intern/dateien?${params.toString()}`, { keepFocus: true, noScroll: true });
    }

    // -----------------------------------------------------------------------
    // Auswahl
    // -----------------------------------------------------------------------

    let selected = $state<string[]>([]);

    /**
     * Beim Ordnerwechsel ist eine alte Auswahl bedeutungslos. Kein $state:
     * der Effekt liest und schreibt den Wert selbst.
     */
    let selectionFolder: string | null = null;
    $effect(() => {
        const id = current?.id ?? null;
        if (selectionFolder !== id) {
            selectionFolder = id;
            selected = [];
        }
    });

    const selectedEntries = $derived(data.documents.filter((entry) => selected.includes(entry.id)));

    // -----------------------------------------------------------------------
    // Dialoge
    // -----------------------------------------------------------------------

    let createOpen = $state(false);
    let editFolderOpen = $state(false);
    let shareOpen = $state(false);
    let uploadOpen = $state(false);
    let previewOpen = $state(false);
    let renameOpen = $state(false);
    let moveOpen = $state(false);
    let bulkMoveOpen = $state(false);

    let deleteFolderOpen = $state(false);
    let deleteEntryOpen = $state(false);
    let bulkDeleteOpen = $state(false);

    let deleteFolderForm = $state<HTMLFormElement | null>(null);
    let deleteEntryForm = $state<HTMLFormElement | null>(null);
    let bulkDeleteForm = $state<HTMLFormElement | null>(null);

    let active = $state<Entry | null>(null);
    let renameTitle = $state("");
    let renameFilename = $state("");
    let moveTarget = $state("");
    let bulkMoveTarget = $state("");
    let editName = $state("");
    let editDescription = $state("");
    let editParent = $state("");

    function submitForm(name: string) {
        globalThis.document.forms.namedItem(name)?.requestSubmit();
    }

    function openPreview(entry: Entry) {
        active = entry;
        previewOpen = true;
    }

    function openRename(entry: Entry) {
        active = entry;
        renameTitle = entry.title;
        renameFilename = entry.filename;
        renameOpen = true;
    }

    function openMove(entry: Entry) {
        active = entry;
        moveTarget = "";
        moveOpen = true;
    }

    function openDelete(entry: Entry) {
        active = entry;
        deleteEntryOpen = true;
    }

    function openEditFolder() {
        if (!current) return;
        editName = current.name;
        editDescription = current.description;
        editParent = current.parentId ?? "";
        editFolderOpen = true;
    }

    // -----------------------------------------------------------------------
    // Kontextmenü
    // -----------------------------------------------------------------------

    /**
     * Rechtsklick auf eine Zeile -- und derselbe Inhalt über die Schaltfläche
     * mit den drei Punkten, damit die Aktionen ohne Maus erreichbar bleiben.
     * Der Fokus wandert beim Öffnen in das Menü und beim Schließen zurück.
     */
    let menuEntry = $state<Entry | null>(null);
    let menuX = $state(0);
    let menuY = $state(0);
    let menuPanel = $state<HTMLDivElement | null>(null);
    let menuOpener: HTMLElement | null = null;

    function openMenuAt(entry: Entry, x: number, y: number, opener: HTMLElement | null) {
        menuEntry = entry;
        // Nicht über den Rand hinaus: 14rem Breite, 16rem Höhe grob gerechnet.
        menuX = Math.min(x, globalThis.innerWidth - 240);
        menuY = Math.min(y, globalThis.innerHeight - 260);
        menuOpener = opener;
    }

    function openerContains(node: Node | null): boolean {
        return Boolean(node && menuOpener?.contains(node));
    }

    function closeMenu(restoreFocus = true) {
        menuEntry = null;
        if (restoreFocus) menuOpener?.focus();
        menuOpener = null;
    }

    function onContextMenu(event: MouseEvent, entry: Entry) {
        event.preventDefault();
        openMenuAt(entry, event.clientX, event.clientY, event.currentTarget as HTMLElement);
    }

    function onMenuButton(event: MouseEvent, entry: Entry) {
        const button = event.currentTarget as HTMLElement;
        const box = button.getBoundingClientRect();
        openMenuAt(entry, box.left, box.bottom + 4, button);
    }

    $effect(() => {
        if (!menuEntry || !menuPanel) return;
        menuPanel.querySelector<HTMLElement>("[role='menuitem']")?.focus();
    });

    function onMenuKeydown(event: KeyboardEvent) {
        if (event.key === "Escape") {
            event.preventDefault();
            closeMenu();
            return;
        }

        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();

        const items = Array.from(
            menuPanel?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? []
        );
        if (items.length === 0) return;

        const index = items.indexOf(globalThis.document.activeElement as HTMLElement);
        const next =
            event.key === "ArrowDown"
                ? (index + 1) % items.length
                : (index - 1 + items.length) % items.length;
        items[next].focus();
    }

    function runFromMenu(action: (entry: Entry) => void) {
        const entry = menuEntry;
        closeMenu(false);
        if (entry) action(entry);
    }

</script>

<svelte:head><title>Dateien - Intern</title></svelte:head>

<svelte:window
    onclick={(event) => {
        if (!menuEntry) return;
        if (menuPanel?.contains(event.target as Node)) return;
        // Der Klick, der das Menü gerade geöffnet hat, blubbert bis hierher --
        // ohne diese Zeile ginge es im selben Moment wieder zu.
        if (openerContains(event.target as Node)) return;
        closeMenu(false);
    }}
    onscroll={() => menuEntry && closeMenu(false)}
/>

{#snippet nameCell(entry: Entry)}
    <div
        class="flex items-start gap-2 min-w-0"
        oncontextmenu={(event) => onContextMenu(event, entry)}
        role="presentation"
    >
        <span
            class={`bi bi-${iconFor(entry.contentType)} text-fg-subtle shrink-0 mt-0.5`}
            aria-hidden="true"
        ></span>
        <div class="min-w-0">
            {#if canPreview(entry.contentType)}
                <button
                    type="button"
                    class="text-sm font-semibold text-fg hover:text-primary transition text-left break-words"
                    onclick={() => openPreview(entry)}
                >
                    {entry.title}
                </button>
            {:else}
                <span class="text-sm font-semibold text-fg break-words">{entry.title}</span>
            {/if}
            <p class="text-xs text-fg-subtle break-words">{entry.filename}</p>
            {#if entry.description}
                <p class="text-xs text-fg-muted break-words">{entry.description}</p>
            {/if}
        </div>
    </div>
{/snippet}

{#snippet rowActions(entry: Entry)}
    {#if canPreview(entry.contentType)}
        <Button
            variant="ghost"
            size="sm"
            icon="eye"
            ariaLabel={`${entry.title} ansehen`}
            onclick={() => openPreview(entry)}
        />
    {/if}
    <Button
        href={`/intern/dateien/${entry.id}?download=1`}
        variant="ghost"
        size="sm"
        icon="download"
        ariaLabel={`${entry.title} herunterladen`}
    />
    <Button
        variant="ghost"
        size="sm"
        icon="three-dots-vertical"
        ariaLabel={`Aktionen für ${entry.title}`}
        onclick={(event) => onMenuButton(event, entry)}
    />
{/snippet}

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
                                <nav aria-label="Pfad" class="text-xs text-fg-subtle mb-1">
                                    {#each current.path as step (step.id)}
                                        <a class="hover:underline" href={`?ordner=${step.id}`}>
                                            {step.name}
                                        </a>
                                        <span aria-hidden="true"> / </span>
                                    {/each}
                                    <span class="text-fg-muted">{current.name}</span>
                                </nav>
                                <h2 class="text-lg font-semibold text-fg">{current.name}</h2>
                                {#if current.description}
                                    <p class="text-sm text-fg-muted mt-1">{current.description}</p>
                                {/if}
                                <p class="text-xs text-fg-subtle mt-1">
                                    {current.documentCount} Datei(en) · {formatBytes(
                                        current.totalBytes
                                    )}
                                </p>
                            </div>
                        {/snippet}

                        {#snippet actions()}
                            {#if current.parentId}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    icon="arrow-up"
                                    href={`?ordner=${current.parentId}`}
                                >
                                    Eine Ebene höher
                                </Button>
                            {/if}
                            {#if mayEdit}
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
                                    icon="pencil"
                                    onclick={openEditFolder}
                                >
                                    Ordner bearbeiten
                                </Button>
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

                    {#if mayEdit}
                        <DropZone folderId={current.id} />
                    {/if}

                    <Card title="Dateien" meta={`${filtered.length} von ${data.documents.length}`}>
                        {#snippet actions()}
                            <SearchInput
                                bind:value={search}
                                placeholder="In diesem Ordner suchen…"
                                label="Dateien durchsuchen"
                                count={filtered.length}
                            />
                        {/snippet}

                        <div class="space-y-4">
                            <!-- Sortierung -->
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="text-xs font-semibold text-fg-muted">Sortieren:</span>
                                <div class="w-40">
                                    <Select
                                        value={data.sort}
                                        options={SORT_OPTIONS}
                                        onchange={(event) =>
                                            applySort(
                                                (event.currentTarget as HTMLSelectElement).value,
                                                data.direction
                                            )}
                                    />
                                </div>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    icon={data.direction === "asc" ? "sort-up" : "sort-down"}
                                    onclick={() =>
                                        applySort(
                                            data.sort,
                                            data.direction === "asc" ? "desc" : "asc"
                                        )}
                                >
                                    {data.direction === "asc" ? "Aufsteigend" : "Absteigend"}
                                </Button>

                                {#if mayEdit && selected.length > 0}
                                    <span class="ml-auto text-xs text-fg-muted">
                                        {selected.length} ausgewählt
                                    </span>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        icon="folder-symlink"
                                        onclick={() => {
                                            bulkMoveTarget = "";
                                            bulkMoveOpen = true;
                                        }}
                                    >
                                        Verschieben
                                    </Button>
                                    <Button
                                        variant="danger"
                                        size="sm"
                                        icon="trash"
                                        onclick={() => (bulkDeleteOpen = true)}
                                    >
                                        Löschen
                                    </Button>
                                {/if}
                            </div>

                            {#if data.documents.length === 0}
                                <EmptyState
                                    icon="file-earmark"
                                    title="Noch nichts abgelegt"
                                    description={current.canWrite
                                        ? "Lege die erste Datei in diesem Ordner ab – per Ziehen und Ablegen oder über „Datei ablegen“."
                                        : "In diesem Ordner liegt noch nichts."}
                                />
                            {:else}
                                <DataTable
                                    columns={[
                                        { key: "name", label: "Name", cell: nameCell },
                                        {
                                            key: "type",
                                            label: "Typ",
                                            value: (entry) => typeLabel(entry.contentType)
                                        },
                                        {
                                            key: "size",
                                            label: "Größe",
                                            align: "right",
                                            value: (entry) => formatBytes(entry.size)
                                        },
                                        {
                                            key: "changed",
                                            label: "Geändert",
                                            value: (entry) => formatDateTime(entry.createdAt)
                                        },
                                        {
                                            key: "author",
                                            label: "Hochgeladen von",
                                            value: (entry) => entry.createdBy ?? "–"
                                        }
                                    ]}
                                    rows={filtered}
                                    getKey={(entry) => entry.id}
                                    caption={`Dateien in ${current.name}`}
                                    empty="Keine Datei passt zur Suche."
                                    cardTitle={(entry) => entry.title}
                                    cardSubtitle={(entry) => entry.filename}
                                    selectable={mayEdit}
                                    bind:selected
                                    selectLabel={(entry) => `${entry.title} auswählen`}
                                    actions={rowActions}
                                />
                            {/if}
                        </div>
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
            class={`flex items-center gap-2 px-3 py-2 rounded-control text-sm transition ${
                current?.id === folder.id
                    ? "bg-primary-soft text-primary font-semibold"
                    : "text-fg hover:bg-surface-muted"
            }`}
            style={`padding-left: ${0.75 + depth * 0.85}rem`}
            aria-current={current?.id === folder.id ? "page" : undefined}
        >
            <span class="bi bi-folder2 text-fg-subtle" aria-hidden="true"></span>
            <span class="min-w-0 truncate">{folder.name}</span>
            {#if folder.documentCount > 0}
                <span
                    class="ml-auto text-xs text-fg-subtle tabular-nums"
                    title={`${folder.documentCount} Datei(en), ${formatBytes(folder.totalBytes)}`}
                >
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

<!-- Kontextmenü -->
{#if menuEntry}
    <div
        bind:this={menuPanel}
        role="menu"
        tabindex="-1"
        aria-label={`Aktionen für ${menuEntry.title}`}
        onkeydown={onMenuKeydown}
        class="fixed z-50 w-56 rounded-card border border-border bg-surface p-1"
        style={`left: ${menuX}px; top: ${menuY}px; box-shadow: var(--shadow-card);`}
    >
        {#if canPreview(menuEntry.contentType)}
            <button
                type="button"
                role="menuitem"
                class="w-full text-left px-3 py-2 rounded-control text-sm text-fg hover:bg-surface-muted"
                onclick={() => runFromMenu(openPreview)}
            >
                <span class="bi bi-eye mr-2" aria-hidden="true"></span>Vorschau
            </button>
            <a
                role="menuitem"
                href={`/intern/dateien/${menuEntry.id}/vorschau`}
                class="block px-3 py-2 rounded-control text-sm text-fg hover:bg-surface-muted"
                onclick={() => closeMenu(false)}
            >
                <span class="bi bi-box-arrow-up-right mr-2" aria-hidden="true"></span>
                Vorschau als eigene Seite
            </a>
        {/if}

        <a
            role="menuitem"
            href={`/intern/dateien/${menuEntry.id}?download=1`}
            class="block px-3 py-2 rounded-control text-sm text-fg hover:bg-surface-muted"
            onclick={() => closeMenu(false)}
        >
            <span class="bi bi-download mr-2" aria-hidden="true"></span>Herunterladen
        </a>

        {#if mayEdit}
            <div class="my-1 border-t border-border"></div>
            <button
                type="button"
                role="menuitem"
                class="w-full text-left px-3 py-2 rounded-control text-sm text-fg hover:bg-surface-muted"
                onclick={() => runFromMenu(openRename)}
            >
                <span class="bi bi-pencil mr-2" aria-hidden="true"></span>Umbenennen
            </button>
            <button
                type="button"
                role="menuitem"
                class="w-full text-left px-3 py-2 rounded-control text-sm text-fg hover:bg-surface-muted"
                onclick={() => runFromMenu(openMove)}
            >
                <span class="bi bi-folder-symlink mr-2" aria-hidden="true"></span>Verschieben
            </button>
            <button
                type="button"
                role="menuitem"
                class="w-full text-left px-3 py-2 rounded-control text-sm text-danger hover:bg-danger-soft"
                onclick={() => runFromMenu(openDelete)}
            >
                <span class="bi bi-trash mr-2" aria-hidden="true"></span>Löschen
            </button>
        {/if}
    </div>
{/if}

<!-- Vorschau -->
<Modal bind:open={previewOpen} title={active?.title ?? "Vorschau"} size="lg">
    <FilePreview document={active} />

    {#snippet footer()}
        {#if active}
            <Button
                variant="secondary"
                icon="box-arrow-up-right"
                href={`/intern/dateien/${active.id}/vorschau`}
            >
                Eigene Seite
            </Button>
        {/if}
        <Button variant="primary" onclick={() => (previewOpen = false)}>Schließen</Button>
    {/snippet}
</Modal>

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
                <Select
                    {id}
                    name="parentId"
                    value={current?.id ?? ""}
                    placeholder="Oberste Ebene"
                    options={folderOptions}
                />
            {/snippet}
        </FormField>
    </form>

    {#snippet footer()}
        <Button variant="secondary" onclick={() => (createOpen = false)}>Abbrechen</Button>
        <Button variant="primary" icon="folder-plus" onclick={() => submitForm("ordner-anlegen")}>
            Anlegen
        </Button>
    {/snippet}
</Modal>

<!-- Ordner bearbeiten: umbenennen und verschieben -->
{#if current && data.canManage}
    <Modal bind:open={editFolderOpen} title={`Ordner „${current.name}“ bearbeiten`}>
        <form method="post" action="?/updateFolder" class="space-y-4" id="ordner-bearbeiten">
            <input type="hidden" name="folderId" value={current.id} />

            <FormField label="Name" required>
                {#snippet children({ id })}
                    <TextInput {id} name="name" bind:value={editName} required />
                {/snippet}
            </FormField>

            <FormField label="Beschreibung">
                {#snippet children({ id })}
                    <TextInput {id} name="description" bind:value={editDescription} />
                {/snippet}
            </FormField>

            <FormField
                label="Übergeordneter Ordner"
                hint="Der Ordner erbt die Freigaben seines neuen Elternordners. In einen eigenen Unterordner geht es nicht."
            >
                {#snippet children({ id })}
                    <Select
                        {id}
                        name="parentId"
                        bind:value={editParent}
                        placeholder="Oberste Ebene"
                        options={folderOptions.filter((option) => option.value !== current.id)}
                    />
                {/snippet}
            </FormField>
        </form>

        {#snippet footer()}
            <Button variant="secondary" onclick={() => (editFolderOpen = false)}>Abbrechen</Button>
            <Button
                variant="primary"
                icon="check-lg"
                onclick={() => submitForm("ordner-bearbeiten")}
            >
                Speichern
            </Button>
        {/snippet}
    </Modal>
{/if}

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
            <Button variant="primary" icon="check-lg" onclick={() => submitForm("freigaben")}>
                Speichern
            </Button>
        {/snippet}
    </Modal>
{/if}

<!-- Hochladen: der Rückfall ohne JavaScript -->
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
                        class="w-full text-sm text-fg file:mr-3 file:px-4 file:py-2 file:rounded-control file:border-0 file:bg-surface-muted file:text-fg file:text-sm"
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
            <Button variant="primary" icon="upload" onclick={() => submitForm("datei-ablegen")}>
                Ablegen
            </Button>
        {/snippet}
    </Modal>
{/if}

<!-- Datei umbenennen -->
<Modal bind:open={renameOpen} title="Datei umbenennen">
    <form method="post" action="?/renameDocument" class="space-y-4" id="datei-umbenennen">
        <input type="hidden" name="documentId" value={active?.id ?? ""} />

        <FormField label="Titel" required hint="So steht die Datei in der Liste.">
            {#snippet children({ id })}
                <TextInput {id} name="title" bind:value={renameTitle} required />
            {/snippet}
        </FormField>

        <FormField
            label="Dateiname"
            hint="So heißt die Datei beim Herunterladen. Die Endung bleibt, wie sie ist."
        >
            {#snippet children({ id })}
                <TextInput {id} name="filename" bind:value={renameFilename} />
            {/snippet}
        </FormField>
    </form>

    {#snippet footer()}
        <Button variant="secondary" onclick={() => (renameOpen = false)}>Abbrechen</Button>
        <Button variant="primary" icon="check-lg" onclick={() => submitForm("datei-umbenennen")}>
            Speichern
        </Button>
    {/snippet}
</Modal>

<!-- Datei verschieben -->
<Modal bind:open={moveOpen} title="Datei verschieben">
    <form method="post" action="?/moveDocument" class="space-y-4" id="datei-verschieben">
        <input type="hidden" name="documentId" value={active?.id ?? ""} />

        {#if writableOptions.length === 0}
            <Alert
                tone="warning"
                message="Es gibt keinen weiteren Ordner, in dem du ablegen darfst."
            />
        {:else}
            <FormField label="Zielordner" required hint="Nur Ordner mit Schreibrecht.">
                {#snippet children({ id })}
                    <Select
                        {id}
                        name="targetFolderId"
                        bind:value={moveTarget}
                        placeholder="– bitte wählen –"
                        options={writableOptions}
                        required
                    />
                {/snippet}
            </FormField>
        {/if}
    </form>

    {#snippet footer()}
        <Button variant="secondary" onclick={() => (moveOpen = false)}>Abbrechen</Button>
        <Button
            variant="primary"
            icon="folder-symlink"
            disabled={!moveTarget}
            onclick={() => submitForm("datei-verschieben")}
        >
            Verschieben
        </Button>
    {/snippet}
</Modal>

<!-- Auswahl verschieben -->
<Modal bind:open={bulkMoveOpen} title={`${selected.length} Datei(en) verschieben`}>
    <form method="post" action="?/moveDocuments" class="space-y-4" id="auswahl-verschieben">
        {#each selected as id (id)}
            <input type="hidden" name="documentIds" value={id} />
        {/each}

        <ul class="text-sm text-fg-muted list-disc pl-5 max-h-40 overflow-auto">
            {#each selectedEntries as entry (entry.id)}
                <li class="break-words">{entry.title}</li>
            {/each}
        </ul>

        <FormField label="Zielordner" required hint="Nur Ordner mit Schreibrecht.">
            {#snippet children({ id })}
                <Select
                    {id}
                    name="targetFolderId"
                    bind:value={bulkMoveTarget}
                    placeholder="– bitte wählen –"
                    options={writableOptions}
                    required
                />
            {/snippet}
        </FormField>
    </form>

    {#snippet footer()}
        <Button variant="secondary" onclick={() => (bulkMoveOpen = false)}>Abbrechen</Button>
        <Button
            variant="primary"
            icon="folder-symlink"
            disabled={!bulkMoveTarget}
            onclick={() => submitForm("auswahl-verschieben")}
        >
            Verschieben
        </Button>
    {/snippet}
</Modal>

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
    bind:open={deleteEntryOpen}
    title="Datei löschen"
    message={active ? `„${active.title}“ wird dauerhaft entfernt.` : ""}
    confirmLabel="Endgültig löschen"
    onconfirm={() => deleteEntryForm?.requestSubmit()}
/>

<ConfirmDialog
    bind:open={bulkDeleteOpen}
    title="Auswahl löschen"
    message={`${selected.length} Datei(en) werden dauerhaft entfernt.`}
    confirmLabel="Endgültig löschen"
    onconfirm={() => bulkDeleteForm?.requestSubmit()}
/>

<form method="post" action="?/deleteFolder" bind:this={deleteFolderForm} class="hidden">
    <input type="hidden" name="folderId" value={current?.id ?? ""} />
</form>

<form method="post" action="?/deleteDocument" bind:this={deleteEntryForm} class="hidden">
    <input type="hidden" name="documentId" value={active?.id ?? ""} />
    <input type="hidden" name="folderId" value={current?.id ?? ""} />
</form>

<form method="post" action="?/deleteDocuments" bind:this={bulkDeleteForm} class="hidden">
    {#each selected as id (id)}
        <input type="hidden" name="documentIds" value={id} />
    {/each}
</form>
