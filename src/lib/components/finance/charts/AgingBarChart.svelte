<script lang="ts">
    import { BarChart } from "layerchart";
    import ChartFrame, { type ChartSize } from "./ChartFrame.svelte";
    import {
        agingColor,
        axisEuroCompact,
        CHART_AXIS,
        CHART_GRID,
        CHART_PADDING,
        chartTooltip,
        charsPerBand,
        tooltipEuro
    } from "./colors";
    import { formatEuro } from "$lib/money";

    /**
     * Fälligkeitsstaffel der offenen Forderungen.
     *
     * Steht neben der Tabelle auf der Seite „Offene Posten“. Die Balken
     * stehen nach Alter geordnet -- links, was noch nicht fällig ist, rechts,
     * was seit über neunzig Tagen offen ist.
     *
     * Eine Farbe je Balken geht sehr wohl: nicht über `fill` (das gilt für
     * alle Balken einer Reihe gemeinsam), sondern über `c` und `cRange` --
     * dieselbe Technik, mit der der Ring seine Segmente einfärbt. `c="label"`
     * macht die Beschriftung zum Farbmerkmal, `cDomain` legt die Reihenfolge
     * fest, `cRange` die Farben dazu. Die Reihe darf dann KEINE eigene Farbe
     * tragen: LayerChart nimmt `series[].color` vor der Farbskala.
     *
     * Die Ueberschrift laesst sich abschalten (`title=""`): steht das
     * Diagramm in einer Karte, die dasselbe schon im Titel sagt, waere
     * sie doppelt.
     */
    let {
        buckets,
        size = "md",
        title = "Fälligkeitsstaffel"
    }: {
        buckets: { label: string; fromDays: number; amount: number; count: number }[];
        size?: ChartSize;
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

    /** Der laengste Zeitraum entscheidet fuer alle. */
    const longest = $derived(
        buckets.reduce((max, entry) => Math.max(max, entry.label.length), 0)
    );

    /**
     * Die Zeitraeume heissen „Noch nicht fällig“ oder „61 – 90 Tage“ -- fünf
     * davon nebeneinander passen in keine schmale Achse. Gekuerzt wird nur die
     * Achse, und dann fuer alle Bereiche gemeinsam; die volle Bezeichnung
     * steht in der Tabelle daneben und in der Kurzinfo.
     */
    function bucketLabel(label: string, width: number): string {
        if (longest <= charsPerBand(width, buckets.length)) return label;

        const index = buckets.findIndex((entry) => entry.label === label);
        if (index < 0) return label;

        const bucket = buckets[index];
        if (bucket.fromDays <= 0) return "nicht fällig";

        // Die Obergrenze steht im naechsten Bereich: „31 – 60“ endet dort, wo
        // „61 – 90“ beginnt. Der letzte Bereich ist nach oben offen.
        const next = buckets[index + 1];
        return next ? `${bucket.fromDays}–${next.fromDays - 1}` : `> ${bucket.fromDays - 1}`;
    }

    const tooltip = chartTooltip({ value: tooltipEuro });
</script>

<ChartFrame
    {title}
    subtitle={isEmpty ? undefined : "Von links nach rechts nach Alter geordnet."}
    meta={isEmpty ? undefined : `${formatEuro(total)} offen`}
    {size}
    {isEmpty}
    empty="Es gibt keine offenen Forderungen."
>
    {#snippet legend()}
        <span>Je älter die Forderung, desto röter der Balken; Zahlen sind Tage.</span>
        {#if overdue > 0}
            <span class="text-danger">Davon überfällig: {formatEuro(overdue)}</span>
        {/if}
    {/snippet}

    {#snippet children({ width }: { width: number })}
        <BarChart
            {data}
            x="label"
            y="amount"
            c="label"
            cDomain={buckets.map((bucket) => bucket.label)}
            cRange={buckets.map((bucket) => agingColor(bucket.fromDays))}
            seriesLayout="overlap"
            series={[{ key: "amount", label: "Offen", value: "amount" }]}
            grid={{ y: CHART_GRID }}
            padding={CHART_PADDING}
            props={{
                yAxis: {
                    ...CHART_AXIS,
                    format: (value: number) => axisEuroCompact(value * 100)
                },
                xAxis: {
                    ...CHART_AXIS,
                    format: (value: string) => bucketLabel(value, width)
                },
                rule: { stroke: "var(--color-border-strong)" },
                tooltip
            }}
        />
    {/snippet}
</ChartFrame>
