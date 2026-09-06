<script lang="ts">
    import { Alert, Button, EmptyState } from "$lib/components/ui";
    import { formatBytes, previewKindOf, typeLabel } from "./fileMeta";

    /**
     * Vorschau einer abgelegten Datei.
     *
     * Dieselbe Komponente bedient das Modal auf der Uebersicht und die eigene
     * Seite unter /intern/dateien/[id]/vorschau -- die Seite gibt es, damit
     * sich eine Vorschau verlinken laesst.
     *
     * Was womit angezeigt wird:
     *
     *   Bild      <img> gegen den Download-Endpunkt
     *   PDF       <iframe sandbox> gegen denselben Endpunkt
     *   Text      ueber /inhalt geholt, in einem <pre> mit Festbreitenschrift
     *   Markdown  ueber /inhalt geholt, dort SERVERSEITIG gerendert
     *
     * Das Rendern von Markdown passiert bewusst nicht hier: der Renderer
     * ($lib/server/markdown) escapt zuerst und setzt danach nur die erlaubten
     * Auszeichnungen. Was hier ankommt, ist bereits geprueftes HTML -- deshalb
     * ist das {@html} unten vertretbar.
     */

    interface PreviewDocument {
        id: string;
        title: string;
        filename: string;
        contentType: string;
        size: number;
    }

    interface TextContent {
        text: string;
        html: string | null;
    }

    interface Props {
        document: PreviewDocument | null;
        /** Vorab geladener Inhalt (Vorschauseite); sonst wird selbst geholt. */
        initial?: TextContent | null;
        /** Fehlermeldung aus dem Server-Load, falls der Inhalt nicht kam. */
        initialError?: string | null;
        /** Hoehe des Anzeigebereichs. */
        height?: string;
    }

    let {
        document: entry,
        initial = null,
        initialError = null,
        height = "60vh"
    }: Props = $props();

    const kind = $derived(entry ? previewKindOf(entry.contentType) : "none");
    const downloadHref = $derived(entry ? `/intern/dateien/${entry.id}?download=1` : "#");
    const inlineHref = $derived(entry ? `/intern/dateien/${entry.id}` : "#");

    let loading = $state(false);
    let error = $state<string | null>(null);
    let content = $state<TextContent | null>(null);
    /** Bei Markdown: gerendert oder Quelltext. */
    let showSource = $state(false);
    let imageFailed = $state(false);

    /**
     * Fuer welche Datei der Inhalt bereits geholt wurde.
     *
     * Bewusst KEIN $state: der Effekt liest und schreibt den Wert, eine
     * Abhaengigkeit darauf wuerde ihn nur ein zweites Mal laufen lassen.
     */
    let loadedFor: string | null = null;

    async function loadText(id: string) {
        loading = true;
        error = null;
        content = null;

        try {
            const response = await fetch(`/intern/dateien/${id}/inhalt`, {
                headers: { accept: "application/json" }
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => null);
                error =
                    payload?.error ??
                    "Der Inhalt konnte nicht geladen werden. Bitte die Datei herunterladen.";
                return;
            }

            const payload = await response.json();
            content = { text: payload.text ?? "", html: payload.html ?? null };
        } catch {
            error = "Der Inhalt konnte nicht geladen werden. Besteht noch eine Verbindung?";
        } finally {
            loading = false;
        }
    }

    /**
     * Nachladen, sobald eine andere Datei gezeigt wird. Der Vergleich ueber
     * loadedFor verhindert, dass jede Zustandsaenderung (etwa der Umschalter)
     * einen neuen Abruf ausloest.
     */
    $effect(() => {
        if (!entry) {
            loadedFor = null;
            content = null;
            error = null;
            return;
        }

        if (kind !== "text" && kind !== "markdown") return;
        if (loadedFor === entry.id) return;

        loadedFor = entry.id;
        imageFailed = false;
        showSource = false;

        if (initial) {
            content = initial;
            error = initialError;
            return;
        }

        void loadText(entry.id);
    });
</script>

{#if !entry}
    <EmptyState icon="eye-slash" title="Keine Datei ausgewählt" />
{:else}
    <div class="space-y-4">
        <!-- Kopfzeile: was liegt hier, und wie kommt man daran -->
        <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
                <p class="text-sm font-semibold text-fg break-words">{entry.title}</p>
                <p class="text-xs text-fg-subtle mt-0.5 break-words">
                    {entry.filename} · {typeLabel(entry.contentType)} · {formatBytes(entry.size)}
                </p>
            </div>

            <div class="flex items-center gap-2 shrink-0">
                {#if kind === "markdown" && content}
                    <Button
                        variant="secondary"
                        size="sm"
                        icon={showSource ? "eye" : "code"}
                        onclick={() => (showSource = !showSource)}
                    >
                        {showSource ? "Vorschau" : "Quelltext"}
                    </Button>
                {/if}
                <Button variant="secondary" size="sm" icon="download" href={downloadHref}>
                    Herunterladen
                </Button>
            </div>
        </div>

        {#if kind === "none"}
            <div class="rounded-card border border-border bg-surface-sunken">
                <EmptyState
                    icon="file-earmark"
                    title="Für diesen Dateityp gibt es keine Vorschau"
                    description="Die Datei lässt sich herunterladen und mit einem passenden Programm öffnen."
                />
            </div>
        {:else if kind === "image"}
            {#if imageFailed}
                <Alert
                    tone="warning"
                    message="Das Bild konnte nicht geladen werden. Bitte herunterladen."
                />
            {:else}
                <div
                    class="rounded-card border border-border bg-surface-sunken p-4 flex items-center justify-center overflow-auto"
                    style={`max-height: ${height}`}
                >
                    <img
                        src={inlineHref}
                        alt={entry.title}
                        class="max-w-full h-auto rounded-control"
                        onerror={() => (imageFailed = true)}
                    />
                </div>
            {/if}
        {:else if kind === "pdf"}
            <!--
                sandbox ohne jedes allow-*: das eingebettete Dokument bekommt
                weder Skript noch Zugriff auf den eigenen Ursprung. Zeigt ein
                Browser das PDF darin nicht an, bleibt die Schaltflaeche zum
                Herunterladen daneben stehen.
            -->
            <iframe
                src={inlineHref}
                title={`Vorschau von ${entry.title}`}
                sandbox=""
                class="w-full rounded-card border border-border bg-surface-sunken"
                style={`height: ${height}`}
            ></iframe>
        {:else if loading}
            <div
                class="rounded-card border border-border bg-surface-sunken p-8 text-center text-sm text-fg-muted"
            >
                <span class="bi bi-arrow-repeat animate-spin" aria-hidden="true"></span>
                <span class="ml-2">Inhalt wird geladen …</span>
            </div>
        {:else if error}
            <Alert tone="warning" message={error} />
        {:else if content}
            {#if kind === "markdown" && !showSource && content.html}
                <div
                    class="rounded-card border border-border bg-surface p-5 overflow-auto"
                    style={`max-height: ${height}`}
                >
                    <!-- Serverseitig gerendert und escaped; siehe Kommentar oben. -->
                    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                    {@html content.html}
                </div>
            {:else}
                <pre
                    class="rounded-card border border-border bg-surface-sunken p-4 overflow-auto text-sm text-fg font-mono whitespace-pre-wrap break-words"
                    style={`max-height: ${height}`}>{content.text}</pre>
            {/if}
        {:else}
            <EmptyState icon="file-earmark" title="Die Datei ist leer" inline />
        {/if}
    </div>
{/if}
