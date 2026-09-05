/**
 * Farben der Diagramme.
 *
 * Die Werte sind CSS-Variablen aus dem Design-System, keine festen Hexwerte:
 * damit stimmen die Diagramme im hellen wie im dunklen Modus, ohne dass eine
 * zweite Palette gepflegt werden muss. LayerChart zeichnet SVG, und ein SVG
 * kann `var(--color-success)` als Füllfarbe genauso benutzen wie ein div.
 *
 * Die Zuordnung ist über alle Diagramme dieselbe -- Erträge sind überall
 * grün, Aufwendungen überall rot. Ein Diagramm, in dem dieselbe Farbe zweimal
 * etwas anderes bedeutet, ist schlimmer als keines.
 */

export const CHART_COLORS = {
    income: "var(--color-success)",
    expense: "var(--color-danger)",
    result: "var(--color-primary)",
    neutral: "var(--color-info)",
    warning: "var(--color-warning)"
} as const;

/**
 * Abstufungen für Diagramme mit mehreren gleichrangigen Reihen -- den Ring
 * nach steuerlichen Bereichen etwa. Fünf reichen: mehr Segmente kann ein
 * Ringdiagramm ohnehin nicht lesbar zeigen.
 */
export const CHART_SERIES = [
    "var(--color-primary)",
    "var(--color-success)",
    "var(--color-warning)",
    "var(--color-info)",
    "var(--color-danger)"
] as const;

/** Farbe für den Index einer Reihe, umlaufend. */
export function seriesColor(index: number): string {
    return CHART_SERIES[index % CHART_SERIES.length];
}

/**
 * Beschriftung der Achse in Euro, ohne Nachkommastellen.
 *
 * Die Beträge sind Cents. Auf einer Achse stören die Cents nur -- bei
 * Beträgen im dreistelligen Eurobereich liest sich „1.200 €“ besser als
 * „1.200,00 €“.
 */
export function axisEuro(cents: number): string {
    return new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0
    }).format(cents / 100);
}
