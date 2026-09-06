<script lang="ts">
    import { invalidateAll } from "$app/navigation";
    import { Alert, Button } from "$lib/components/ui";
    import { formatBytes } from "./fileMeta";

    /**
     * Ablageflaeche fuer Dateien.
     *
     * Drei Wege hinein: ziehen und ablegen, Dateien auswaehlen, einen ganzen
     * Ordner auswaehlen (`webkitdirectory`). Beim Ablegen werden Unterordner
     * mitgenommen -- der Browser gibt sie ueber `webkitGetAsEntry()` her.
     *
     * Der Fortschritt kommt von `XMLHttpRequest`: `fetch` meldet beim
     * Hochladen keinen (ReadableStream-Upload ist nicht ueberall verfuegbar).
     * Deshalb hier bewusst der aeltere Weg.
     *
     * Hoechstens DREI gleichzeitig. Mehr bringt bei einem Server nichts und
     * laesst die Fortschrittsanzeigen nur springen.
     *
     * Das Formular im Modal bleibt daneben bestehen: ohne JavaScript passiert
     * hier gar nichts, und ohne den Rueckfall waere die Seite dann nicht mehr
     * bedienbar.
     */

    interface Props {
        folderId: string;
        /** Ohne Schreibrecht ist die Flaeche gesperrt. */
        disabled?: boolean;
        maxBytes?: number;
    }

    let { folderId, disabled = false, maxBytes = 10 * 1024 * 1024 }: Props = $props();

    type Status = "wartet" | "laeuft" | "fertig" | "fehler";

    interface QueueItem {
        key: number;
        name: string;
        size: number;
        progress: number;
        status: Status;
        error: string;
    }

    const PARALLEL = 3;

    let queue = $state<QueueItem[]>([]);
    let dragging = $state(false);
    /** Wie viele Stapel gerade laufen -- zwei Ablagen kurz nacheinander sind moeglich. */
    let running = $state(0);
    const busy = $derived(running > 0);
    let notice = $state<string | null>(null);
    let fileInput = $state<HTMLInputElement | null>(null);
    let folderInput = $state<HTMLInputElement | null>(null);

    let nextKey = 0;
    /** Zaehler statt Boolean: dragleave feuert auch beim Wechsel auf ein Kind. */
    let dragDepth = 0;

    const done = $derived(queue.filter((item) => item.status === "fertig").length);
    const failed = $derived(queue.filter((item) => item.status === "fehler").length);

    const STATUS_LABEL: Record<Status, string> = {
        wartet: "wartet",
        laeuft: "wird übertragen",
        fertig: "abgelegt",
        fehler: "fehlgeschlagen"
    };

    function update(key: number, patch: Partial<QueueItem>) {
        // Neues Array, damit die Anzeige die Aenderung bemerkt.
        queue = queue.map((item) => (item.key === key ? { ...item, ...patch } : item));
    }

    /**
     * Eine Datei hochladen. Loest nie ab -- der Fehler landet im Eintrag, die
     * uebrigen Dateien sollen weiterlaufen.
     */
    function uploadOne(file: File, key: number): Promise<void> {
        return new Promise((resolve) => {
            if (file.size === 0) {
                update(key, { status: "fehler", error: "Die Datei ist leer." });
                resolve();
                return;
            }

            if (file.size > maxBytes) {
                update(key, {
                    status: "fehler",
                    error: `Die Datei ist zu groß (höchstens ${formatBytes(maxBytes)}).`
                });
                resolve();
                return;
            }

            const body = new FormData();
            body.append("folderId", folderId);
            body.append("file", file);
            body.append("title", file.name);

            const request = new XMLHttpRequest();
            request.open("POST", "/intern/dateien/upload");
            request.responseType = "text";

            request.upload.onprogress = (event) => {
                if (!event.lengthComputable) return;
                update(key, {
                    status: "laeuft",
                    progress: Math.round((event.loaded / event.total) * 100)
                });
            };

            request.onload = () => {
                if (request.status >= 200 && request.status < 300) {
                    update(key, { status: "fertig", progress: 100, error: "" });
                    resolve();
                    return;
                }

                update(key, { status: "fehler", error: messageFor(request) });
                resolve();
            };

            request.onerror = () => {
                update(key, {
                    status: "fehler",
                    error: "Die Verbindung wurde unterbrochen."
                });
                resolve();
            };

            request.onabort = () => {
                update(key, { status: "fehler", error: "Abgebrochen." });
                resolve();
            };

            update(key, { status: "laeuft", progress: 0 });
            request.send(body);
        });
    }

    /**
     * Eine verstaendliche Meldung aus der Antwort.
     *
     * Der 413 ist der wichtige Fall: `adapter-node` begrenzt den
     * Anfragekoerper ohne `BODY_SIZE_LIMIT` auf 512 KB und antwortet SELBST,
     * also ohne den JSON-Koerper dieser Anwendung. Ohne diesen Zweig sieht
     * der Benutzer nur einen stillen Fehlschlag.
     */
    function messageFor(request: XMLHttpRequest): string {
        try {
            const payload = JSON.parse(request.responseText);
            if (typeof payload?.error === "string") return payload.error;
        } catch {
            // Kein JSON -- der Server hat vor der Anwendung geantwortet.
        }

        if (request.status === 413) return "Die Datei ist zu groß.";
        if (request.status === 415) return "Dieser Dateityp wird nicht angenommen.";
        if (request.status === 403) return "In diesem Ordner darfst du nichts ablegen.";
        if (request.status === 404) return "Der Ordner wurde nicht gefunden.";
        if (request.status === 401) return "Die Anmeldung ist abgelaufen. Bitte neu anmelden.";
        return "Das Hochladen ist fehlgeschlagen.";
    }

    /** Hoechstens PARALLEL gleichzeitig: drei Arbeiter teilen sich die Liste. */
    async function run(files: { file: File; key: number }[]) {
        running += 1;
        notice = null;

        let cursor = 0;
        const worker = async () => {
            for (;;) {
                const index = cursor;
                cursor += 1;
                if (index >= files.length) return;
                await uploadOne(files[index].file, files[index].key);
            }
        };

        await Promise.all(
            Array.from({ length: Math.min(PARALLEL, files.length) }, () => worker())
        );

        running -= 1;
        await invalidateAll();
    }

    function enqueue(files: File[]) {
        if (disabled || files.length === 0) return;

        const entries = files.map((file) => {
            const key = nextKey;
            nextKey += 1;
            return {
                file,
                key,
                item: {
                    key,
                    name: file.name,
                    size: file.size,
                    progress: 0,
                    status: "wartet" as Status,
                    error: ""
                }
            };
        });

        queue = [...queue, ...entries.map((entry) => entry.item)];
        void run(entries.map((entry) => ({ file: entry.file, key: entry.key })));
    }

    // -----------------------------------------------------------------------
    // Ziehen und Ablegen
    // -----------------------------------------------------------------------

    interface FileSystemEntryLike {
        isFile: boolean;
        isDirectory: boolean;
        file(callback: (file: File) => void, error: (err: unknown) => void): void;
        createReader(): {
            readEntries(
                callback: (entries: FileSystemEntryLike[]) => void,
                error: (err: unknown) => void
            ): void;
        };
    }

    /**
     * Einen abgelegten Eintrag aufloesen -- Datei oder ganzer Ordner.
     *
     * `readEntries` liefert je Aufruf nur einen Teil (meist 100), deshalb die
     * Schleife. Die Tiefe ist begrenzt: ein verschachtelter Ordnerbaum soll
     * den Browser nicht beschaeftigen, bis nichts mehr geht.
     */
    async function collect(entry: FileSystemEntryLike, depth = 0): Promise<File[]> {
        if (depth > 8) return [];

        if (entry.isFile) {
            return new Promise((resolve) => {
                entry.file(
                    (file) => resolve([file]),
                    () => resolve([])
                );
            });
        }

        if (!entry.isDirectory) return [];

        const reader = entry.createReader();
        const children: FileSystemEntryLike[] = [];

        for (;;) {
            const batch = await new Promise<FileSystemEntryLike[]>((resolve) => {
                reader.readEntries(
                    (result) => resolve(result),
                    () => resolve([])
                );
            });

            if (batch.length === 0) break;
            children.push(...batch);
            if (children.length > 500) break;
        }

        const nested = await Promise.all(children.map((child) => collect(child, depth + 1)));
        return nested.flat();
    }

    async function ondrop(event: DragEvent) {
        event.preventDefault();
        dragDepth = 0;
        dragging = false;
        if (disabled) return;

        const transfer = event.dataTransfer;
        if (!transfer) return;

        const items = Array.from(transfer.items ?? []);
        const entries = items
            .map((item) =>
                typeof (item as DataTransferItem & { webkitGetAsEntry?: unknown })
                    .webkitGetAsEntry === "function"
                    ? (item.webkitGetAsEntry() as unknown as FileSystemEntryLike | null)
                    : null
            )
            .filter((entry): entry is FileSystemEntryLike => entry !== null);

        if (entries.length > 0) {
            const collected = await Promise.all(entries.map((entry) => collect(entry)));
            const files = collected.flat();
            if (files.length === 0) {
                notice = "In der Ablage waren keine Dateien.";
                return;
            }
            enqueue(files);
            return;
        }

        // Aeltere Browser ohne Ordnerunterstuetzung.
        enqueue(Array.from(transfer.files ?? []));
    }

    function ondragenter(event: DragEvent) {
        event.preventDefault();
        if (disabled) return;
        dragDepth += 1;
        dragging = true;
    }

    function ondragover(event: DragEvent) {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = disabled ? "none" : "copy";
    }

    function ondragleave(event: DragEvent) {
        event.preventDefault();
        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0) dragging = false;
    }

    function pick(input: HTMLInputElement | null) {
        if (!input) return;
        enqueue(Array.from(input.files ?? []));
        // Zuruecksetzen, damit dieselbe Datei erneut gewaehlt werden kann.
        input.value = "";
    }

    function clearFinished() {
        queue = queue.filter((item) => item.status !== "fertig");
    }
</script>

<div class="space-y-3">
    <!--
        Die Flaeche selbst ist kein Bedienelement -- die beiden Schaltflaechen
        darin sind es. Ziehen und Ablegen ist die Zugabe fuer die Maus, ueber
        die Tastatur fuehrt der Weg ueber "Dateien auswählen".
    -->
    <div
        role="group"
        aria-label="Dateien ablegen"
        aria-busy={busy}
        {ondrop}
        {ondragenter}
        {ondragover}
        {ondragleave}
        class={`rounded-card border-2 border-dashed px-6 py-8 text-center transition ${
            disabled
                ? "border-border bg-surface-sunken opacity-60"
                : dragging
                  ? "border-primary bg-primary-soft"
                  : "border-border-strong bg-surface-muted"
        }`}
    >
        <span
            class={`bi ${dragging ? "bi-download" : "bi-cloud-arrow-up"} text-3xl ${dragging ? "text-primary" : "text-fg-subtle"}`}
            aria-hidden="true"
        ></span>

        <p class="mt-2 text-sm font-semibold text-fg">
            {#if disabled}
                In diesem Ordner darfst du nichts ablegen.
            {:else if dragging}
                Jetzt loslassen.
            {:else}
                Dateien hierher ziehen
            {/if}
        </p>

        {#if !disabled}
            <p class="text-xs text-fg-subtle mt-1">
                Ganze Ordner sind möglich. Höchstens {formatBytes(maxBytes)} je Datei.
            </p>

            <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
                <Button
                    variant="secondary"
                    size="sm"
                    icon="file-earmark-plus"
                    onclick={() => fileInput?.click()}
                >
                    Dateien auswählen
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    icon="folder-plus"
                    onclick={() => folderInput?.click()}
                >
                    Ordner auswählen
                </Button>
            </div>

            <input
                bind:this={fileInput}
                type="file"
                multiple
                class="sr-only"
                tabindex="-1"
                aria-hidden="true"
                onchange={() => pick(fileInput)}
            />
            <input
                bind:this={folderInput}
                type="file"
                multiple
                webkitdirectory
                class="sr-only"
                tabindex="-1"
                aria-hidden="true"
                onchange={() => pick(folderInput)}
            />
        {/if}
    </div>

    {#if notice}
        <Alert tone="warning" message={notice} />
    {/if}

    {#if queue.length > 0}
        <div class="rounded-card border border-border bg-surface">
            <div class="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border">
                <p class="text-xs font-semibold text-fg-muted uppercase tracking-wide">
                    {queue.length} Datei(en) · {done} abgelegt{failed > 0
                        ? ` · ${failed} fehlgeschlagen`
                        : ""}
                </p>
                {#if !busy && done > 0}
                    <Button variant="ghost" size="sm" onclick={clearFinished}>
                        Erledigte ausblenden
                    </Button>
                {/if}
            </div>

            <ul class="divide-y divide-border" aria-live="polite">
                {#each queue as item (item.key)}
                    <li class="px-4 py-2.5 flex items-center gap-3">
                        <span
                            class={`bi shrink-0 ${
                                item.status === "fertig"
                                    ? "bi-check-circle text-success"
                                    : item.status === "fehler"
                                      ? "bi-exclamation-circle text-danger"
                                      : "bi-arrow-up-circle text-fg-subtle"
                            }`}
                            aria-hidden="true"
                        ></span>

                        <div class="min-w-0 flex-1">
                            <p class="text-sm text-fg truncate">{item.name}</p>

                            {#if item.status === "fehler"}
                                <p class="text-xs text-danger">{item.error}</p>
                            {:else if item.status === "fertig"}
                                <p class="text-xs text-fg-subtle">
                                    {formatBytes(item.size)} · abgelegt
                                </p>
                            {:else}
                                <div
                                    class="mt-1 h-1.5 rounded-control bg-surface-sunken overflow-hidden"
                                    role="progressbar"
                                    aria-valuenow={item.progress}
                                    aria-valuemin="0"
                                    aria-valuemax="100"
                                    aria-label={`Fortschritt für ${item.name}`}
                                >
                                    <div
                                        class="h-full bg-primary transition-all"
                                        style={`width: ${item.progress}%`}
                                    ></div>
                                </div>
                            {/if}
                        </div>

                        <span class="text-xs text-fg-subtle shrink-0 tabular-nums">
                            {item.status === "laeuft"
                                ? `${item.progress} %`
                                : STATUS_LABEL[item.status]}
                        </span>
                    </li>
                {/each}
            </ul>
        </div>
    {/if}
</div>
