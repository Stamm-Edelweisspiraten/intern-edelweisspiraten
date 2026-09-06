<script lang="ts">
    import { BarChart } from "layerchart";
    import ChartFrame, { type ChartSize } from "./ChartFrame.svelte";
    import {
        axisEuroCompact,
        CHART_AXIS,
        CHART_COLORS,
        CHART_GRID,
        CHART_PADDING,
        chartTooltip,
        charsPerBand,
        tooltipEuro
    } from "./colors";

    /**
     * Erträge und Aufwendungen je Monat, gruppierte Balken.
     *
     * Steht neben der Monatsübersicht. Die Beträge kommen als Cents herein;
     * für die Achse werden sie in Euro umgerechnet, weil eine Achse mit
     * Cent-Werten in Zehntausenderschritten unlesbar ist.
     *
     * Die Ueberschrift laesst sich abschalten (`title=""`): steht das
     * Diagramm in einer Karte, die dasselbe schon im Titel sagt, waere
     * sie doppelt.
     */
    let {
        months,
        size = "md",
        title = "Erträge und Aufwendungen je Monat"
    }: {
        months: { month: string; label: string; income: number; expense: number }[];
        size?: ChartSize;
        title?: string;
    } = $props();

    /**
     * Die Monatsnamen stehen voll in den Daten; gekuerzt wird erst auf der
     * Achse. Damit zeigt die Kurzinfo „September“, auch wenn an der Achse nur
     * „Sep“ Platz hat.
     */
    const data = $derived(
        months.map((entry) => ({
            label: entry.label,
            income: entry.income / 100,
            expense: entry.expense / 100
        }))
    );

    const isEmpty = $derived(
        months.every((entry) => entry.income === 0 && entry.expense === 0)
    );

    /** Der laengste Monatsname entscheidet fuer alle zwoelf. */
    const longest = $derived(
        months.reduce((max, entry) => Math.max(max, entry.label.length), 0)
    );

    /**
     * Beschriftung nach verfuegbarer Breite statt hart auf drei Zeichen.
     *
     * Vorher stand dort immer `label.slice(0, 3)` -- in einer breiten Karte
     * war das unnoetig knapp, in einer schmalen immer noch zu breit. Die
     * Breite kommt aus dem Rahmen (`ChartFrame` misst sie); daraus ergibt
     * sich, wie viele Zeichen ein Monat bekommt.
     *
     * Drei Stufen, und zwar fuer die ganze Achse gemeinsam: der volle Name,
     * das uebliche Kuerzel (Jan, Feb, Mär ...) oder der Anfangsbuchstabe.
     */
    function monthLabel(label: string, width: number): string {
        const fits = charsPerBand(width, months.length);
        if (longest <= fits) return label;
        return fits >= 3 ? label.slice(0, 3) : label.slice(0, 1);
    }

    const tooltip = chartTooltip({ value: tooltipEuro });
</script>

<ChartFrame {title} {size} {isEmpty} empty="In diesem Jahr wurde noch nichts gebucht.">
    {#snippet legend()}
        <span class="inline-flex items-center gap-1.5">
            <span class="w-3 h-3 rounded-sm" style={`background: ${CHART_COLORS.income}`}></span>
            Erträge
        </span>
        <span class="inline-flex items-center gap-1.5">
            <span class="w-3 h-3 rounded-sm" style={`background: ${CHART_COLORS.expense}`}></span>
            Aufwendungen
        </span>
    {/snippet}

    {#snippet children({ width }: { width: number })}
        <BarChart
            {data}
            x="label"
            seriesLayout="group"
            series={[
                {
                    key: "income",
                    label: "Erträge",
                    value: "income",
                    color: CHART_COLORS.income
                },
                {
                    key: "expense",
                    label: "Aufwendungen",
                    value: "expense",
                    color: CHART_COLORS.expense
                }
            ]}
            grid={{ y: CHART_GRID }}
            padding={CHART_PADDING}
            props={{
                yAxis: {
                    ...CHART_AXIS,
                    format: (value: number) => axisEuroCompact(value * 100)
                },
                xAxis: {
                    ...CHART_AXIS,
                    format: (value: string) => monthLabel(value, width)
                },
                rule: { stroke: "var(--color-border-strong)" },
                tooltip
            }}
        />
    {/snippet}
</ChartFrame>
