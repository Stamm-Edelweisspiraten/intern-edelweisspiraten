<script lang="ts">
    import { LineChart } from "layerchart";
    import ChartFrame, { type ChartSize } from "./ChartFrame.svelte";
    import {
        axisEuroCompact,
        CHART_AXIS,
        CHART_COLORS,
        CHART_GRID,
        CHART_PADDING,
        chartTooltip,
        tooltipEuro
    } from "./colors";
    import { formatDate } from "$lib/format";

    /**
     * Kontostandsverlauf.
     *
     * Steht auf der Detailseite eines Bankkontos neben dem Kassenbericht. Die
     * Linie zeigt, was die Tabelle nur zeilenweise hergibt: ob der Bestand im
     * Jahr eng wurde.
     *
     * Die Ueberschrift laesst sich abschalten (`title=""`): steht das
     * Diagramm in einer Karte, die dasselbe schon im Titel sagt, waere
     * sie doppelt.
     */
    let {
        entries,
        size = "md",
        title = "Kontostandsverlauf"
    }: {
        entries: { date: string; balance: number }[];
        size?: ChartSize;
        title?: string;
    } = $props();

    const data = $derived(
        entries.map((entry) => ({
            date: new Date(entry.date),
            balance: entry.balance / 100
        }))
    );

    const isEmpty = $derived(entries.length < 2);

    /** Auf der Achse reicht „01.02.“; das Jahr steht in der Kurzinfo. */
    const axisDate = (value: Date) =>
        value.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });

    const tooltip = chartTooltip({
        header: (value: Date) => formatDate(value),
        value: tooltipEuro
    });
</script>

<ChartFrame
    {title}
    {size}
    {isEmpty}
    empty="Für einen Verlauf braucht es mindestens zwei Bewegungen."
>
    {#snippet children()}
        <!--
            `rule={false}`: keine doppelte Grundlinie. LayerChart zeichnet
            ueber `rule` eine eigene Linie bei null, und weil die Werteachse
            bei null beginnt, liegt dort ohnehin schon eine Gitterlinie.
        -->
        <LineChart
            {data}
            x="date"
            y="balance"
            series={[{ key: "balance", label: "Kontostand", color: CHART_COLORS.result }]}
            grid={{ y: CHART_GRID }}
            padding={CHART_PADDING}
            rule={false}
            props={{
                yAxis: {
                    ...CHART_AXIS,
                    format: (value: number) => axisEuroCompact(value * 100)
                },
                xAxis: { ...CHART_AXIS, format: axisDate },
                tooltip
            }}
        />
    {/snippet}
</ChartFrame>
