/**
 * Diagramme der Kasse.
 *
 * Alle bauen auf LayerChart (SVG, Svelte 5) und benutzen dieselbe
 * Farbzuordnung aus den Design-Tokens -- damit stimmen sie in hell und
 * dunkel, ohne zweite Palette.
 *
 * Jedes Diagramm steht NEBEN seiner Tabelle, nie statt ihr: ohne JavaScript
 * und für einen Screenreader bleiben die Zahlen vollständig lesbar. Die
 * Diagramme selbst tragen deshalb `aria-hidden` (siehe ChartFrame).
 */
export { default as ChartFrame } from "./ChartFrame.svelte";
export { default as MonthlyBarChart } from "./MonthlyBarChart.svelte";
export { default as BalanceLineChart } from "./BalanceLineChart.svelte";
export { default as SphereDonutChart } from "./SphereDonutChart.svelte";
export { default as TopExpensesChart } from "./TopExpensesChart.svelte";
export { default as AgingBarChart } from "./AgingBarChart.svelte";
export { CHART_COLORS, CHART_SERIES, seriesColor, axisEuro } from "./colors";
