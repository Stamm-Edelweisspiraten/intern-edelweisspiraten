<script lang="ts">
    import { BarChart } from "layerchart";
    import ChartFrame from "./ChartFrame.svelte";
    import { axisEuro, CHART_COLORS } from "./colors";

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
        height = 260,
        title = "Erträge und Aufwendungen je Monat"
    }: {
        months: { month: string; label: string; income: number; expense: number }[];
        height?: number;
        title?: string;
    } = $props();

    /** Kurze Monatsnamen: „September“ sprengt zwölf Spalten. */
    const data = $derived(
        months.map((entry) => ({
            label: entry.label.slice(0, 3),
            income: entry.income / 100,
            expense: entry.expense / 100
        }))
    );

    const isEmpty = $derived(
        months.every((entry) => entry.income === 0 && entry.expense === 0)
    );
</script>

<ChartFrame
    {title}
    {height}
    {isEmpty}
    empty="In diesem Jahr wurde noch nichts gebucht."
>
    {#snippet legend()}
        <span class="inline-flex items-center gap-1.5">
            <span
                class="w-3 h-3 rounded-sm"
                style={`background: ${CHART_COLORS.income}`}
            ></span>
            Erträge
        </span>
        <span class="inline-flex items-center gap-1.5">
            <span
                class="w-3 h-3 rounded-sm"
                style={`background: ${CHART_COLORS.expense}`}
            ></span>
            Aufwendungen
        </span>
    {/snippet}

    <BarChart
        {data}
        x="label"
        seriesLayout="group"
        series={[
            { key: "income", label: "Erträge", value: "income", color: CHART_COLORS.income },
            { key: "expense", label: "Aufwendungen", value: "expense", color: CHART_COLORS.expense }
        ]}
        props={{
            yAxis: { format: (value: number) => axisEuro(value * 100) }
        }}
    />
</ChartFrame>
