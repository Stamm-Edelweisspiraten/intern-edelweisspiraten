<script lang="ts">
    import type { Snippet } from "svelte";

    /** Ersetzt den 47-fach kopierten Karten-Klassenstring. */

    interface Props {
        padding?: "none" | "sm" | "md";
        tone?: "default" | "primary" | "warning" | "success";
        title?: string;
        subtitle?: string;
        meta?: string;
        header?: Snippet;
        actions?: Snippet;
        footer?: Snippet;
        class?: string;
        children?: Snippet;
    }

    let {
        padding = "md",
        tone = "default",
        title,
        subtitle,
        meta,
        header,
        actions,
        footer,
        class: extraClass = "",
        children
    }: Props = $props();

    const PADDING = { none: "", sm: "p-4", md: "p-6" } as const;
    const TONES = {
        default: "bg-surface border-border",
        primary: "bg-primary-soft border-primary-soft-border",
        warning: "bg-warning-soft border-warning-soft-border",
        success: "bg-success-soft border-success-soft-border"
    } as const;

    const hasHeader = $derived(!!(title || header || actions));

    /**
     * Der Kopf braucht IMMER einen Innenabstand.
     *
     * Bei padding="none" bekam er vorher gar keinen -- Titel und Meta-Angabe
     * klebten bündig an den Kartenrändern, und die Tabelle darunter begann
     * ohne Abstand. Das betraf jede Karte, die eine DataTable ohne eigenen
     * Innenabstand traegt, also den Grossteil der Listenseiten.
     *
     * Bei sm/md bleibt es beim bisherigen Verhalten: der Kopf traegt oben und
     * seitlich den Abstand, unten nichts, und der Rumpf gleicht mit pt-4 aus.
     * So entsteht ein durchgehender Rhythmus statt doppelter Luft an der Naht.
     */
    const headerPadding = $derived(padding === "none" ? "p-4" : `${PADDING[padding]} pb-0`);
</script>

<section
    class={`border rounded-card ${TONES[tone]} ${extraClass}`}
    style="box-shadow: var(--shadow-card);"
>
    {#if hasHeader}
        <div
            class={`flex items-start justify-between gap-4 flex-wrap ${headerPadding}`}
        >
            <div class="min-w-0">
                {#if title}
                    <h2 class="text-lg font-semibold text-fg">{title}</h2>
                {/if}
                {#if subtitle}
                    <p class="text-sm text-fg-muted mt-1">{subtitle}</p>
                {/if}
                {@render header?.()}
            </div>
            <div class="flex items-center gap-3 flex-wrap shrink-0">
                {#if meta}
                    <span class="text-sm text-fg-subtle">{meta}</span>
                {/if}
                {@render actions?.()}
            </div>
        </div>
    {/if}

    <div class={`${PADDING[padding]} ${hasHeader && padding !== "none" ? "pt-4" : ""}`}>
        {@render children?.()}
    </div>

    {#if footer}
        <div class={`border-t border-border flex justify-end gap-3 flex-wrap ${PADDING[padding] || "p-4"}`}>
            {@render footer()}
        </div>
    {/if}
</section>
