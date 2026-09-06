<script lang="ts">
    import { invalidateAll } from "$app/navigation";
    import { Alert, Button } from "$lib/components/ui";
    import { formatBytes } from "$lib/components/files/fileMeta";

    /**
     * Ablageflaeche fuer Bilder.
     *
     * Ableger von `$lib/components/files/DropZone.svelte` -- Fortschritt ueber
     * `XMLHttpRequest` (`fetch` meldet beim Hochladen keinen), hoechstens drei
     * gleichzeitig, und der Zweig fuer den koerperlosen 413 bleibt: ohne
     * `BODY_SIZE_LIMIT` antwortet `adapter-node` SELBST und ohne JSON, die
     * Anwendung wird dann gar nicht erreicht.
     *
     * Neu ist das Verkleinern VOR dem Absenden. Ein Bildraster aus vierzig
     * Aufnahmen einer Digitalkamera waeren sonst vierzig Mal mehrere Megabyte
     * -- auf einem Mobilfunkzugang unbrauchbar. Das Vorschaubild entsteht
     * deshalb im Browser und wird als zweites Feld mitgeschickt.
     *
     * Es ist dabei ausdruecklich eine BESCHLEUNIGUNG, kein Bestandteil: jeder
     * Fehlerpfad in `makeThumb` liefert `{blob: null}`, und der Upload laeuft
     * ohne Vorschaubild weiter. Der Server faellt dann auf das Original
     * zurueck -- genau wie beim Weg ohne JavaScript, wo nie ein Vorschaubild
     * ankommt. Daneben steht deshalb weiterhin ein gewoehnliches
     * `<form enctype="multipart/form-data">`.
     *
     * Was das Vorschaubild NICHT tut: das Original ersetzen. Es geht Byte fuer
     * Byte in die Ablage, mitsamt seiner EXIF-Daten (auch dem Aufnahmeort).
     */

    interface Props {
        galleryId: string;
        /** Ohne Schreibrecht ist die Flaeche gesperrt. */
        disabled?: boolean;
        maxBytes?: number;
    }

    let { galleryId, disabled = false, maxBytes = 10 * 1024 * 1024 }: Props = $props();

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
    /** Laengste Kante des Vorschaubildes. */
    const THUMB_EDGE = 480;

    let queue = $state<QueueItem[]>([]);
    let dragging = $state(false);
    let running = $state(0);
    const busy = $derived(running > 0);
    let notice = $state<string | null>(null);
    let fileInput = $state<HTMLInputElement | null>(null);

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
        queue = queue.map((item) => (item.key === key ? { ...item, ...patch } : item));
    }

    // -----------------------------------------------------------------------
    // Vorschaubild
    // -----------------------------------------------------------------------

    /** `canvas.toBlob` als Versprechen -- und nur, wenn der Typ auch stimmt. */
    function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
        return new Promise((resolve) => {
            try {
                canvas.toBlob(
                    (blob) => {
                        // Wer WebP nicht kann, liefert stillschweigend ein PNG
                        // -- das waere kein kleineres Bild, sondern oft ein
                        // groesseres. Dann lieber den Rueckfall nehmen.
                        resolve(blob && blob.type === type ? blob : null);
                    },
                    type,
                    0.8
                );
            } catch {
                resolve(null);
            }
        });
    }

    /**
     * Verkleinert ein Bild auf hoechstens THUMB_EDGE an der laengsten Kante.
     *
     * Liefert nebenbei die Abmessungen des ORIGINALS -- damit das Raster den
     * Platz reservieren kann, bevor das Bild da ist, und beim Laden nichts
     * springt.
     */
    async function makeThumb(
        file: File
    ): Promise<{ blob: Blob | null; width: number; height: number }> {
        try {
            if (typeof createImageBitmap !== "function") {
                return { blob: null, width: 0, height: 0 };
            }

            const bitmap = await createImageBitmap(file);
            const width = bitmap.width;
            const height = bitmap.height;

            const longest = Math.max(width, height);
            const scale = longest > THUMB_EDGE ? THUMB_EDGE / longest : 1;
            const targetWidth = Math.max(1, Math.round(width * scale));
            const targetHeight = Math.max(1, Math.round(height * scale));

            const canvas = document.createElement("canvas");
            canvas.width = targetWidth;
            canvas.height = targetHeight;

            const context = canvas.getContext("2d");
            if (!context) {
                bitmap.close?.();
                return { blob: null, width, height };
            }

            context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
            bitmap.close?.();

            const blob = (await toBlob(canvas, "image/webp")) ?? (await toBlob(canvas, "image/jpeg"));
            return { blob, width, height };
        } catch {
            // Kaputte Datei, fehlender Speicher, gesperrtes Canvas -- egal
            // was: das Bild soll trotzdem hochgeladen werden.
            return { blob: null, width: 0, height: 0 };
        }
    }

    // -----------------------------------------------------------------------
    // Hochladen
    // -----------------------------------------------------------------------

    /** Ein Bild hochladen. Loest nie ab -- der Fehler landet im Eintrag. */
    async function uploadOne(file: File, key: number): Promise<void> {
        if (file.size === 0) {
            update(key, { status: "fehler", error: "Die Datei ist leer." });
            return;
        }

        if (file.size > maxBytes) {
            update(key, {
                status: "fehler",
                error: `Das Bild ist zu groß (höchstens ${formatBytes(maxBytes)}).`
            });
            return;
        }

        update(key, { status: "laeuft", progress: 0 });

        const thumb = await makeThumb(file);

        const body = new FormData();
        body.append("file", file);
        body.append("caption", "");
        if (thumb.width > 0) body.append("width", String(thumb.width));
        if (thumb.height > 0) body.append("height", String(thumb.height));
        if (thumb.blob) {
            const extension = thumb.blob.type === "image/webp" ? "webp" : "jpg";
            body.append("thumb", thumb.blob, `vorschau.${extension}`);
        }

        return new Promise((resolve) => {
            const request = new XMLHttpRequest();
            request.open("POST", `/intern/galerie/${galleryId}/upload`);
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
                } else {
                    update(key, { status: "fehler", error: messageFor(request) });
                }
                resolve();
            };

            request.onerror = () => {
                update(key, { status: "fehler", error: "Die Verbindung wurde unterbrochen." });
                resolve();
            };

            request.onabort = () => {
                update(key, { status: "fehler", error: "Abgebrochen." });
                resolve();
            };

            request.send(body);
        });
    }

    /**
     * Eine verstaendliche Meldung aus der Antwort.
     *
     * Der 413 ist der wichtige Fall: ohne `BODY_SIZE_LIMIT` begrenzt
     * `adapter-node` den Anfragekoerper auf 512 KB und antwortet SELBST, also
     * ohne den JSON-Koerper dieser Anwendung. Ohne diesen Zweig saehe der
     * Benutzer nur einen stillen Fehlschlag.
     */
    function messageFor(request: XMLHttpRequest): string {
        try {
            const payload = JSON.parse(request.responseText);
            if (typeof payload?.error === "string") return payload.error;
        } catch {
            // Kein JSON -- der Server hat vor der Anwendung geantwortet.
        }

        if (request.status === 413) return "Das Bild ist zu groß.";
        if (request.status === 415) return "Dieses Bildformat wird nicht angenommen.";
        if (request.status === 403) return "In diese Galerie darfst du nichts hochladen.";
        if (request.status === 404) return "Die Galerie wurde nicht gefunden.";
        if (request.status === 401) return "Die Anmeldung ist abgelaufen. Bitte neu anmelden.";
        return "Das Hochladen ist fehlgeschlagen.";
    }

    /** Hoechstens PARALLEL gleichzeitig: drei Arbeiter teilen sich die Liste. */
    async function run(entries: { file: File; key: number }[]) {
        running += 1;
        notice = null;

        let cursor = 0;
        const worker = async () => {
            for (;;) {
                const index = cursor;
                cursor += 1;
                if (index >= entries.length) return;
                await uploadOne(entries[index].file, entries[index].key);
            }
        };

        await Promise.all(
            Array.from({ length: Math.min(PARALLEL, entries.length) }, () => worker())
        );

        running -= 1;
        await invalidateAll();
    }

    function enqueue(files: File[]) {
        if (disabled) return;

        // Nur Bilder. Der Server prueft es noch einmal und ist die einzige
        // Absicherung -- hier geht es allein darum, dem Benutzer den Umweg
        // ueber eine Fehlermeldung zu ersparen.
        const images = files.filter((file) => file.type.startsWith("image/"));

        if (images.length === 0) {
            notice = files.length > 0 ? "Es waren keine Bilder dabei." : null;
            return;
        }

        const entries = images.map((file) => {
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

    function ondrop(event: DragEvent) {
        event.preventDefault();
        dragDepth = 0;
        dragging = false;
        if (disabled) return;

        enqueue(Array.from(event.dataTransfer?.files ?? []));
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

    function pick() {
        if (!fileInput) return;
        enqueue(Array.from(fileInput.files ?? []));
        // Zuruecksetzen, damit dieselbe Datei erneut gewaehlt werden kann.
        fileInput.value = "";
    }

    function clearFinished() {
        queue = queue.filter((item) => item.status !== "fertig");
    }
</script>

<div class="space-y-3">
    <!--
        Die Flaeche selbst ist kein Bedienelement -- die Schaltflaeche darin
        ist es. Ziehen und Ablegen ist die Zugabe fuer die Maus, ueber die
        Tastatur fuehrt der Weg ueber "Bilder auswählen".
    -->
    <div
        role="group"
        aria-label="Bilder ablegen"
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
            class={`bi ${dragging ? "bi-download" : "bi-images"} text-3xl ${dragging ? "text-primary" : "text-fg-subtle"}`}
            aria-hidden="true"
        ></span>

        <p class="mt-2 text-sm font-semibold text-fg">
            {#if disabled}
                In diese Galerie darfst du nichts hochladen.
            {:else if dragging}
                Jetzt loslassen.
            {:else}
                Bilder hierher ziehen
            {/if}
        </p>

        {#if !disabled}
            <p class="text-xs text-fg-subtle mt-1">
                PNG, JPEG, WebP oder GIF. Höchstens {formatBytes(maxBytes)} je Bild. Eine
                verkleinerte Vorschau entsteht im Browser und wird mitgeschickt.
            </p>

            <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
                <Button
                    variant="secondary"
                    size="sm"
                    icon="image"
                    onclick={() => fileInput?.click()}
                >
                    Bilder auswählen
                </Button>
            </div>

            <input
                bind:this={fileInput}
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,image/gif"
                class="sr-only"
                tabindex="-1"
                aria-hidden="true"
                onchange={pick}
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
                    {queue.length} Bild(er) · {done} abgelegt{failed > 0
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
