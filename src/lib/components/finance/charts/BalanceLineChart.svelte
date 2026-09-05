<script lang="ts">
    import { LineChart } from "layerchart";
    import ChartFrame from "./ChartFrame.svelte";
    import { axisEuro, CHART_COLORS } from "./colors";

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
        height = 240,
        title = "Kontostandsverlauf"
    }: {
        entries: { date: string; balance: number }[];
        height?: number;
        title?: string;
    } = $props();

    const data = $derived(
        entries.map((entry) => ({
            date: new Date(entry.date),
            balance: entry.balance / 100
        }))
    );

    const isEmpty = $derived(entries.length < 2);
</script>

<ChartFrame
    {title}
    {height}
    {isEmpty}
    empty="Für einen Verlauf braucht es mindestens zwei Bewegungen."
>
    <LineChart
        {data}
        x="date"
        y="balance"
        series={[{ key: "balance", label: "Kontostand", color: CHART_COLORS.result }]}
        props={{
            yAxis: { format: (value: number) => axisEuro(value * 100) },
            xAxis: {
                format: (value: Date) =>
                    value.toLocaleDateString("de-DE", { month: "short", day: "numeric" })
            }
        }}
    />
</ChartFrame>
