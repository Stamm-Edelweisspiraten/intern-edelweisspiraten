<script lang="ts">
    import type { Snippet } from "svelte";

    /**
     * Rahmen für ein Diagramm.
     *
     * Trägt Titel, Höhe und -- wichtig -- `aria-hidden`. Jedes Diagramm steht
     * NEBEN seiner Tabelle, nicht statt ihr: die Zahlen bleiben ohne
     * JavaScript und für einen Screenreader vollständig lesbar, das Diagramm
     * ist die Zugabe. Deshalb wird es aus dem Zugänglichkeitsbaum genommen,
     * statt es mit einer Beschreibung zu versehen, die die Tabelle daneben
     * ohnehin besser liefert.
     */
    let {
        title,
        subtitle,
        height = 240,
        empty = "Für diesen Zeitraum gibt es nichts anzuzeigen.",
        isEmpty = false,
        legend,
        children
    }: {
        title?: string;
        subtitle?: string;
        height?: number;
        empty?: string;
        isEmpty?: boolean;
        legend?: Snippet;
        children: Snippet;
    } = $props();
</script>

<div class="space-y-2">
    {#if title}
        <div class="flex items-baseline justify-between gap-3 flex-wrap">
            <h3 class="text-sm font-semibold text-fg">{title}</h3>
            {#if subtitle}
                <span class="text-xs text-fg-subtle">{subtitle}</span>
            {/if}
        </div>
    {/if}

    {#if isEmpty}
        <div
            class="flex items-center justify-center rounded-xl border border-dashed border-border text-sm text-fg-subtle px-4 text-center"
            style={`height: ${height}px`}
        >
            {empty}
        </div>
    {:else}
        <!--
            aria-hidden: die Tabelle daneben trägt dieselben Zahlen und ist
            die zugängliche Fassung.
        -->
        <div style={`height: ${height}px`} aria-hidden="true">
            {@render children()}
        </div>

        {#if legend}
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
                {@render legend()}
            </div>
        {/if}
    {/if}
</div>
