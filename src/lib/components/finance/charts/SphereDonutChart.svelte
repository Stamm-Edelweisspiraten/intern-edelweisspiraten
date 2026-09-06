<script lang="ts">
    import { PieChart } from "layerchart";
    import ChartFrame, { type ChartSize } from "./ChartFrame.svelte";
    import { chartTooltip, seriesColor, tooltipEuro } from "./colors";
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
        size = "md",
        title = "Erträge nach steuerlichen Bereichen"
    }: {
        spheres: { sphere: string; label: string; income: number }[];
        size?: ChartSize;
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

    const total = $derived(spheres.reduce((sum, entry) => sum + Math.max(entry.income, 0), 0));

    const tooltip = chartTooltip({ value: tooltipEuro });
</script>

<ChartFrame
    {title}
    {size}
    meta={isEmpty ? undefined : `${formatEuro(total)} Erträge`}
    {isEmpty}
    empty="Im Zeitraum wurden keine Erträge gebucht."
>
    {#snippet legend()}
        {#each data as entry (entry.key)}
            <span class="inline-flex items-center gap-1.5">
                <span class="w-3 h-3 rounded-sm" style={`background: ${entry.color}`}></span>
                {entry.label}
                <span class="text-fg-subtle tabular-figures">
                    {formatEuro(Math.round(entry.value * 100))}
                </span>
            </span>
        {/each}
    {/snippet}

    {#snippet children()}
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
            padAngle={0.02}
            padding={{ top: 4, bottom: 4 }}
            props={{ tooltip }}
        />
    {/snippet}
</ChartFrame>
