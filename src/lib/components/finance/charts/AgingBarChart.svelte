<script lang="ts">
    import { BarChart } from "layerchart";
    import ChartFrame from "./ChartFrame.svelte";
    import { axisEuro, CHART_COLORS } from "./colors";
    import { formatEuro } from "$lib/money";

    /**
     * Fälligkeitsstaffel der offenen Forderungen.
     *
     * Steht neben der Tabelle auf der Seite „Offene Posten“. Die Balken
     * stehen nach Alter geordnet -- links, was noch nicht fällig ist, rechts,
     * was seit über neunzig Tagen offen ist.
     *
     * Eine Farbe je Balken wäre schöner, geht aber nicht: `fill` ist bei
     * LayerChart eine Zeichenkette, keine Funktion über den Datenpunkt. Die
     * Einfärbung nach Alter steht deshalb in der Tabelle daneben, wo sie
     * ohnehin besser aufgehoben ist.
     *
     * Die Ueberschrift laesst sich abschalten (`title=""`): steht das
     * Diagramm in einer Karte, die dasselbe schon im Titel sagt, waere
     * sie doppelt.
     */
    let {
        buckets,
        height = 220,
        title = "Fälligkeitsstaffel"
    }: {
        buckets: { label: string; fromDays: number; amount: number; count: number }[];
        height?: number;
        title?: string;
    } = $props();

    const data = $derived(
        buckets.map((bucket) => ({
            label: bucket.label,
            amount: bucket.amount / 100
        }))
    );

    const isEmpty = $derived(buckets.every((bucket) => bucket.amount === 0));

    const total = $derived(buckets.reduce((sum, bucket) => sum + bucket.amount, 0));
    const overdue = $derived(
        buckets
            .filter((bucket) => bucket.fromDays >= 1)
            .reduce((sum, bucket) => sum + bucket.amount, 0)
    );
</script>

<ChartFrame
    {title}
    subtitle={isEmpty ? undefined : `${formatEuro(total)} offen`}
    {height}
    {isEmpty}
    empty="Es gibt keine offenen Forderungen."
>
    {#snippet legend()}
        <span>Von links nach rechts nach Alter geordnet.</span>
        {#if overdue > 0}
            <span class="text-danger">Davon überfällig: {formatEuro(overdue)}</span>
        {/if}
    {/snippet}

    <BarChart
        {data}
        x="label"
        y="amount"
        series={[
            { key: "amount", label: "Offen", value: "amount", color: CHART_COLORS.warning }
        ]}
        props={{
            yAxis: { format: (value: number) => axisEuro(value * 100) }
        }}
    />
</ChartFrame>
