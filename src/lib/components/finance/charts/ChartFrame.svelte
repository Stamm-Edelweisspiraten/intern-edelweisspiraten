<script lang="ts" module>
    /**
     * Benannte Hoehen statt frei gewaehlter Zahlen.
     *
     * Vorher trug jedes Diagramm seine eigene Zahl (220, 240, 260, 280) --
     * nebeneinander in einem Raster sah das aus wie ein Versehen. Drei Groessen
     * reichen: eine Kachel, der Regelfall und ein Diagramm, das eine ganze
     * Karte traegt.
     */
    export type ChartSize = "sm" | "md" | "lg";

    export const CHART_HEIGHTS: Record<ChartSize, number> = {
        sm: 180,
        md: 240,
        lg: 300
    };
</script>

<script lang="ts">
    import type { Snippet } from "svelte";

    /**
     * Rahmen für ein Diagramm.
     *
     * Trägt Titel, Unterzeile, Kennwert, Höhe und -- wichtig -- `aria-hidden`.
     * Jedes Diagramm steht NEBEN seiner Tabelle, nicht statt ihr: die Zahlen
     * bleiben ohne JavaScript und für einen Screenreader vollständig lesbar,
     * das Diagramm ist die Zugabe. Deshalb wird es aus dem Zugänglichkeitsbaum
     * genommen, statt es mit einer Beschreibung zu versehen, die die Tabelle
     * daneben ohnehin besser liefert.
     *
     * Der Kopf ist derselbe wie bei `Card`: Titel und Unterzeile links, ein
     * Kennwert rechts. Damit liest sich ein Diagramm in einer Karte wie ein
     * Abschnitt der Karte und nicht wie ein Fremdkörper.
     *
     * Die gemessene Breite geht an das Diagramm weiter (`children({ width })`).
     * Beschriftungen, die bei 375 px gekürzt werden müssen und bei 1280 px
     * nicht, brauchen genau diese Zahl.
     */
    let {
        title,
        subtitle,
        meta,
        size = "md",
        empty = "Für diesen Zeitraum gibt es nichts anzuzeigen.",
        isEmpty = false,
        legend,
        children
    }: {
        title?: string;
        subtitle?: string;
        meta?: string;
        size?: ChartSize;
        empty?: string;
        isEmpty?: boolean;
        legend?: Snippet;
        children: Snippet<[{ width: number }]>;
    } = $props();

    const height = $derived(CHART_HEIGHTS[size]);

    /**
     * Solange nichts gemessen ist (Server, erster Durchgang), gilt eine
     * mittlere Breite. Sonst kuerzte jedes Diagramm im ersten Bild seine
     * Beschriftungen so, als stuende es in einer Handybreite.
     */
    let measured = $state(0);
    const width = $derived(measured || 480);
</script>

<div class="space-y-2">
    {#if title || subtitle || meta}
        <div class="flex items-baseline justify-between gap-3 flex-wrap">
            <div class="min-w-0">
                {#if title}
                    <h3 class="text-sm font-semibold text-fg">{title}</h3>
                {/if}
                {#if subtitle}
                    <p class="text-xs text-fg-muted">{subtitle}</p>
                {/if}
            </div>
            {#if meta}
                <span class="text-xs text-fg-subtle tabular-figures shrink-0">{meta}</span>
            {/if}
        </div>
    {/if}

    {#if isEmpty}
        <!--
            Ruhig statt gestrichelt: derselbe Ton wie der einzeilige
            Leerzustand von `EmptyState`. Ein gestrichelter Rahmen sieht aus
            wie eine Ablagefläche, in die etwas hineingehört -- hier fehlt
            aber nichts, es gibt schlicht nichts zu zeigen.
        -->
        <p class="text-sm text-fg-subtle text-center py-10">{empty}</p>
    {:else}
        <!--
            aria-hidden: die Tabelle daneben trägt dieselben Zahlen und ist
            die zugängliche Fassung.
        -->
        <div
            class="min-w-0"
            style={`height: ${height}px`}
            aria-hidden="true"
            bind:clientWidth={measured}
        >
            {@render children({ width })}
        </div>

        {#if legend}
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
                {@render legend()}
            </div>
        {/if}
    {/if}
</div>
