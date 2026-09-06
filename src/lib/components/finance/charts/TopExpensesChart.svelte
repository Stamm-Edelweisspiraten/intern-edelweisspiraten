<script lang="ts">
    import { BarChart } from "layerchart";
    import ChartFrame, { type ChartSize } from "./ChartFrame.svelte";
    import {
        AXIS_CHAR_WIDTH,
        axisEuroCompact,
        CHART_AXIS,
        CHART_COLORS,
        CHART_GRID,
        CHART_PADDING,
        chartTooltip,
        tooltipEuro
    } from "./colors";

    /**
     * Die größten Aufwandskonten, waagerechte Balken.
     *
     * Waagerecht, weil die Kontobezeichnungen lang sind
     * („Gruppenstunde/Material“) und senkrecht gedreht niemand liest.
     *
     * Die Ueberschrift laesst sich abschalten (`title=""`): steht das
     * Diagramm in einer Karte, die dasselbe schon im Titel sagt, waere
     * sie doppelt.
     */
    let {
        rows,
        size = "lg",
        title = "Größte Aufwandskonten"
    }: {
        rows: { accountId: string; number: string; name: string; amount: number }[];
        size?: ChartSize;
        title?: string;
    } = $props();

    /**
     * Die vollen Namen bleiben in den Daten; gekuerzt wird erst auf der Achse.
     * Damit zeigt die Kurzinfo „Gruppenstunde/Material“, auch wenn links nur
     * „Gruppenstunde/M…“ Platz hat.
     */
    const data = $derived(
        rows.map((row) => ({
            label: row.name,
            amount: row.amount / 100
        }))
    );

    const isEmpty = $derived(rows.length === 0);

    /** Etwa so breit ist ein Zeichen der 10-px-Achsenbeschriftung. */
    const CHAR_WIDTH = AXIS_CHAR_WIDTH;

    /**
     * Gitter und Achse zaehlen dieselben Teilstriche.
     *
     * Ohne das nimmt das Gitter die Voreinstellung von d3 (etwa zehn Linien),
     * die Achse dagegen so viele, wie bei achtzig Pixel Abstand hineinpassen
     * (drei bis vier). Dann stehen Linien, an denen keine Zahl steht -- das
     * sieht aus wie ein Fehler und ist auch einer.
     */
    const VALUE_TICKS = 4;

    /**
     * Wie viel Platz die Beschriftung links bekommen darf.
     *
     * Waagerechte Balken brauchen festen Platz, sonst schneidet LayerChart sie
     * am Rand ab -- bei 375 px stand dort „…nde/Material“. Ein Drittel der
     * Breite ist die Obergrenze: mehr, und vom Balken bleibt nichts uebrig.
     */
    function labelSpace(width: number): number {
        return Math.min(150, Math.max(64, Math.round(width * 0.34)));
    }

    function maxChars(width: number): number {
        return Math.max(6, Math.floor((labelSpace(width) - 10) / CHAR_WIDTH));
    }

    function shorten(label: string, width: number): string {
        const max = maxChars(width);
        return label.length > max ? `${label.slice(0, max - 1)}…` : label;
    }

    /**
     * Der Einzug links kommt aus der laengsten tatsaechlich dargestellten
     * Beschriftung, nicht aus einer festen Zahl (frueher 118 px). Sind die
     * Namen kurz, faengt der Balken frueher an.
     */
    function paddingLeft(width: number): number {
        const longest = data.reduce(
            (max, entry) => Math.max(max, shorten(entry.label, width).length),
            0
        );
        return Math.min(labelSpace(width), Math.round(longest * CHAR_WIDTH) + 10);
    }

    const tooltip = chartTooltip({ value: tooltipEuro });
</script>

<ChartFrame
    {title}
    subtitle={rows.length > 0 ? `Die ${rows.length} größten` : undefined}
    {size}
    {isEmpty}
    empty="Im Zeitraum wurden keine Aufwendungen gebucht."
>
    {#snippet children({ width }: { width: number })}
        <BarChart
            {data}
            orientation="horizontal"
            y="label"
            x="amount"
            series={[
                {
                    key: "amount",
                    label: "Aufwand",
                    value: "amount",
                    color: CHART_COLORS.expense
                }
            ]}
            grid={{ x: CHART_GRID, xTicks: VALUE_TICKS }}
            padding={{ ...CHART_PADDING, left: paddingLeft(width) }}
            props={{
                xAxis: {
                    ...CHART_AXIS,
                    ticks: VALUE_TICKS,
                    format: (value: number) => axisEuroCompact(value * 100)
                },
                yAxis: {
                    ...CHART_AXIS,
                    format: (value: string) => shorten(value, width)
                },
                rule: { stroke: "var(--color-border-strong)" },
                tooltip
            }}
        />
    {/snippet}
</ChartFrame>
