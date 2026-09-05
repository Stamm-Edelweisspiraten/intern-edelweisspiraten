<script lang="ts">
    import { PieChart } from "layerchart";
    import ChartFrame from "./ChartFrame.svelte";
    import { seriesColor } from "./colors";
    import { formatEuro } from "$lib/money";

    /**
     * Ergebnis nach steuerlichen Bereichen als Ring.
     *
     * Für einen gemeinnützigen Verein ist die Aufteilung in ideellen Bereich,
     * Vermögensverwaltung, Zweckbetrieb und wirtschaftlichen Geschäftsbetrieb
     * keine Spielerei, sondern die Grundlage der Steuererklärung.
     *
     * Gezeigt werden die ERTRÄGE je Bereich, nicht das Ergebnis: ein Ring mit
     * negativen Segmenten ist nicht darstellbar.
     *
     * Die Ueberschrift laesst sich abschalten (`title=""`): steht das
     * Diagramm in einer Karte, die dasselbe schon im Titel sagt, waere
     * sie doppelt.
     */
    let {
        spheres,
        height = 240,
        title = "Erträge nach steuerlichen Bereichen"
    }: {
        spheres: { sphere: string; label: string; income: number }[];
        height?: number;
        title?: string;
    } = $props();

    const data = $derived(
        spheres
            .filter((entry) => entry.income > 0)
            .map((entry, index) => ({
                key: entry.sphere,
                label: entry.label,
                value: entry.income / 100,
                color: seriesColor(index)
            }))
    );

    const isEmpty = $derived(data.length === 0);
</script>

<ChartFrame
    {title}
    {height}
    {isEmpty}
    empty="Im Zeitraum wurden keine Erträge gebucht."
>
    {#snippet legend()}
        {#each data as entry (entry.key)}
            <span class="inline-flex items-center gap-1.5">
                <span class="w-3 h-3 rounded-sm" style={`background: ${entry.color}`}></span>
                {entry.label}
                <span class="text-fg-subtle tabular-nums">
                    {formatEuro(Math.round(entry.value * 100))}
                </span>
            </span>
        {/each}
    {/snippet}

    <!--
        `c` und `cRange` statt einer Farbe je Datensatz: sonst vergibt
        LayerChart eine eigene Palette, und die Beschriftung daneben zeigte
        andere Farben als der Ring. Die Reihenfolge von `cRange` entspricht
        der Reihenfolge der Daten, deshalb stimmt beides überein.
    -->
    <PieChart
        {data}
        key="key"
        label="label"
        value="value"
        c="key"
        cRange={data.map((entry) => entry.color)}
        innerRadius={-40}
        cornerRadius={2}
    />
</ChartFrame>
