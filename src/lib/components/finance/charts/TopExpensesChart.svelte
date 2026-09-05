<script lang="ts">
    import { BarChart } from "layerchart";
    import ChartFrame from "./ChartFrame.svelte";
    import { axisEuro, CHART_COLORS } from "./colors";

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
        height = 280,
        title = "Größte Aufwandskonten"
    }: {
        rows: { accountId: string; number: string; name: string; amount: number }[];
        height?: number;
        title?: string;
    } = $props();

    /**
     * Die Beschriftungen werden gekürzt und bekommen links festen Platz.
     *
     * Ohne beides schnitt LayerChart sie bei schmalen Fenstern am linken Rand
     * ab -- bei 375 px stand dort „…nde/Material“. Die vollen Namen stehen in
     * der Tabelle daneben.
     */
    const LABEL_MAX = 20;

    const data = $derived(
        rows.map((row) => ({
            label: row.name.length > LABEL_MAX ? `${row.name.slice(0, LABEL_MAX - 1)}…` : row.name,
            amount: row.amount / 100
        }))
    );

    const isEmpty = $derived(rows.length === 0);
</script>

<ChartFrame
    {title}
    subtitle={rows.length > 0 ? `Die ${rows.length} größten` : undefined}
    {height}
    {isEmpty}
    empty="Im Zeitraum wurden keine Aufwendungen gebucht."
>
    <BarChart
        {data}
        orientation="horizontal"
        y="label"
        x="amount"
        series={[{ key: "amount", label: "Aufwand", value: "amount", color: CHART_COLORS.expense }]}
        padding={{ left: 118, bottom: 24, top: 8, right: 8 }}
        props={{
            xAxis: { format: (value: number) => axisEuro(value * 100) }
        }}
    />
</ChartFrame>
