<script lang="ts">
    import { onMount } from "svelte";

    /**
     * Formatierter Texteditor auf Basis von Quill.
     *
     * Quill wurde vorher zur Laufzeit von einem CDN nachgeladen -- das ist ein
     * Aufruf an einen fremden Server bei jedem Seitenaufruf und funktioniert
     * ohne Internetzugang gar nicht. Jetzt liegt die Bibliothek als
     * Abhängigkeit im Projekt und wird nur im Browser dynamisch importiert.
     */

    interface Props {
        value?: string;
        placeholder?: string;
        id?: string;
        describedBy?: string;
        minHeight?: string;
    }

    let {
        value = $bindable(""),
        placeholder = "Text eingeben ...",
        id,
        describedBy,
        minHeight = "240px"
    }: Props = $props();

    let container = $state<HTMLDivElement | null>(null);
    let ready = $state(false);
    type QuillLike = { root: HTMLElement; on: (event: string, cb: () => void) => void };
    let quill: QuillLike | null = null;

    onMount(() => {
        let disposed = false;

        (async () => {
            const [{ default: Quill }] = await Promise.all([
                import("quill"),
                import("quill/dist/quill.snow.css")
            ]);

            if (disposed || !container) return;

            quill = new Quill(container, {
                theme: "snow",
                placeholder,
                modules: {
                    toolbar: [
                        ["bold", "italic", "underline"],
                        [{ list: "ordered" }, { list: "bullet" }],
                        ["link"],
                        ["clean"]
                    ]
                }
            }) as unknown as QuillLike;

            if (value) quill!.root.innerHTML = value;

            quill!.on("text-change", () => {
                const html = quill!.root.innerHTML;
                // Quill hinterlässt bei leerem Inhalt ein leeres Absatz-Tag.
                value = html === "<p><br></p>" ? "" : html;
            });

            ready = true;
        })();

        return () => {
            disposed = true;
            quill = null;
        };
    });
</script>

<div class="rich-text" style={`--editor-min-height:${minHeight}`}>
    {#if !ready}
        <div
            class="flex items-center gap-2 px-4 py-3 text-sm text-fg-subtle border border-border-strong rounded-xl bg-surface"
            style={`min-height:${minHeight}`}
        >
            <span class="bi bi-arrow-repeat animate-spin" aria-hidden="true"></span>
            Editor wird geladen ...
        </div>
    {/if}

    <div bind:this={container} {id} aria-describedby={describedBy} class:hidden={!ready}></div>

    <!-- Ohne JavaScript bleibt das Formular über dieses Feld benutzbar. -->
    <noscript>
        <textarea
            name="bodyHtmlFallback"
            {placeholder}
            class="w-full px-4 py-3 rounded-xl text-sm bg-surface text-fg border border-border-strong"
            style={`min-height:${minHeight}`}
        ></textarea>
    </noscript>
</div>

<style>
    /*
     * Quill bringt eigene Farben mit. Hier werden sie auf die Design-Tokens
     * umgebogen, damit der Editor auch im dunklen Design lesbar ist.
     */
    .rich-text :global(.ql-toolbar.ql-snow),
    .rich-text :global(.ql-container.ql-snow) {
        border-color: var(--border-strong);
    }

    .rich-text :global(.ql-toolbar.ql-snow) {
        border-top-left-radius: 0.75rem;
        border-top-right-radius: 0.75rem;
        background: var(--surface-muted);
    }

    .rich-text :global(.ql-container.ql-snow) {
        border-bottom-left-radius: 0.75rem;
        border-bottom-right-radius: 0.75rem;
        background: var(--surface);
        color: var(--fg);
        font-size: 0.875rem;
    }

    .rich-text :global(.ql-editor) {
        min-height: var(--editor-min-height);
    }

    .rich-text :global(.ql-editor.ql-blank::before) {
        color: var(--fg-subtle);
        font-style: normal;
    }

    /* Symbole und Auswahlfelder der Werkzeugleiste einfärben. */
    .rich-text :global(.ql-snow .ql-stroke) {
        stroke: var(--fg-muted);
    }
    .rich-text :global(.ql-snow .ql-fill) {
        fill: var(--fg-muted);
    }
    .rich-text :global(.ql-snow .ql-picker) {
        color: var(--fg-muted);
    }
    .rich-text :global(.ql-snow button:hover .ql-stroke),
    .rich-text :global(.ql-snow button.ql-active .ql-stroke) {
        stroke: var(--primary);
    }
    .rich-text :global(.ql-snow button:hover .ql-fill),
    .rich-text :global(.ql-snow button.ql-active .ql-fill) {
        fill: var(--primary);
    }
    .rich-text :global(.ql-snow .ql-tooltip) {
        background: var(--surface);
        border-color: var(--border-strong);
        color: var(--fg);
        box-shadow: var(--shadow-raised);
    }
    .rich-text :global(.ql-snow .ql-tooltip input[type="text"]) {
        background: var(--surface);
        border-color: var(--border-strong);
        color: var(--fg);
    }
</style>
