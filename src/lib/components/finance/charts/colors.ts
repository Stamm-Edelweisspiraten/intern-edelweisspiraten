/**
 * Farben und gemeinsame Darstellung der Diagramme.
 *
 * Die Werte sind CSS-Variablen aus dem Design-System, keine festen Hexwerte:
 * damit stimmen die Diagramme im hellen wie im dunklen Modus, ohne dass eine
 * zweite Palette gepflegt werden muss. LayerChart zeichnet SVG, und ein SVG
 * kann `var(--color-success)` als Füllfarbe genauso benutzen wie ein div.
 *
 * Die Zuordnung ist über alle Diagramme dieselbe -- Erträge sind überall
 * grün, Aufwendungen überall rot. Ein Diagramm, in dem dieselbe Farbe zweimal
 * etwas anderes bedeutet, ist schlimmer als keines.
 *
 * Neben den Farben stehen hier auch die Achsenformate und die gemeinsame
 * Konfiguration von Gitter und Kurzinfo (Tooltip). Sie gehoeren zusammen:
 * beides beschreibt, wie ein Diagramm aussieht, und beides soll an genau
 * einer Stelle stehen.
 */

import { formatEuro } from "$lib/money";

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
 * Farbe eines Faelligkeitsbereichs: je aelter die Forderung, desto roeter.
 *
 * Es gibt nur fuenf Farbtoene im System, und zwischen `warning` und `danger`
 * liegt nichts. Die Zwischenstufen entstehen deshalb ueber `color-mix` aus
 * genau diesen beiden Tokens -- kein Hexwert, keine zweite Palette, und im
 * dunklen Modus mischt der Browser dieselbe Reihe aus den dunklen Tokens.
 *
 * Die Staffelung folgt der Tabelle daneben, die dieselben Grenzen benutzt.
 */
export function agingColor(fromDays: number): string {
    if (fromDays <= 0) return CHART_COLORS.neutral;
    if (fromDays <= 30) return CHART_COLORS.warning;
    if (fromDays <= 60) return "color-mix(in oklab, var(--color-danger) 50%, var(--color-warning))";
    if (fromDays <= 90) return "color-mix(in oklab, var(--color-danger) 75%, var(--color-warning))";
    return CHART_COLORS.expense;
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

/**
 * Gekuerzte Beschriftung der Achse: „12 Tsd. €“ statt „12.345 €“.
 *
 * Steht dort, wo die Achse sonst ueberlaeuft -- eine senkrechte Werteachse
 * hat links etwa fuenfzig Pixel, und „123.456 €“ passt da nicht hinein.
 *
 * `Intl` mit `notation: "compact"` kuerzt im Deutschen erst ab einer Million
 * ("1,2 Mio."); Tausender laesst CLDR unveraendert stehen. Genau die sind
 * aber der Fall, der ueberlaeuft, deshalb steht „Tsd.“ hier von Hand.
 *
 * Gekuerzt wird erst ab zehntausend: „1.200 €“ ist kuerzer zu lesen als
 * „1,2 Tsd. €“ und passt in denselben Platz.
 */
export function axisEuroCompact(cents: number): string {
    const euro = cents / 100;
    const abs = Math.abs(euro);

    if (abs >= 1_000_000) {
        const millions = new Intl.NumberFormat("de-DE", {
            notation: "compact",
            maximumFractionDigits: 1
        }).format(euro);
        return `${millions} €`;
    }

    if (abs >= 10_000) {
        const thousands = new Intl.NumberFormat("de-DE", {
            maximumFractionDigits: 0
        }).format(euro / 1000);
        return `${thousands} Tsd. €`;
    }

    // Darunter ist die volle Zahl weder laenger noch unklarer: „1.200 €“ ist
    // besser als „1,2 Tsd. €“ und passt in dieselben fuenfzig Pixel.
    return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(euro)} €`;
}

/**
 * Gitterlinien: eine Linie in der Randfarbe, sonst nichts.
 *
 * LayerChart faerbt Gitterlinien sonst aus der Textfarbe mit zehn Prozent
 * Deckung. Das ist im hellen Modus fast unsichtbar und im dunklen zu kraeftig;
 * `--color-border` ist genau der Ton, den auch jede Tabellenzeile benutzt.
 */
export const CHART_GRID = { stroke: "var(--color-border)", strokeWidth: 1 };

/**
 * Achsen: kleine, zurueckhaltende Beschriftung ohne Teilstriche.
 *
 * Die Schriftgroesse (10 px) bringt LayerChart selbst mit; hier steht nur die
 * Farbe und dass die kleinen Striche an der Achse entfallen -- die
 * Gitterlinien sagen dasselbe schon.
 */
export const CHART_AXIS = {
    fill: "var(--color-fg-subtle)",
    tickMarks: false
};

/**
 * Abstaende innerhalb des Diagramms, fuer alle gleich.
 *
 * Links die fuenfzig Pixel, die eine Betragsachse braucht („1.200 €“), unten
 * die zwanzig fuer die Kategorien. Ohne diese Angabe rechnet LayerChart mit
 * zwanzig Pixeln links -- und schneidet jede Betragsachse ab.
 */
export const CHART_PADDING = { left: 58, bottom: 22, top: 8, right: 8 };

/** So breit ist ein Zeichen der Achsenbeschriftung (10 px) etwa. */
export const AXIS_CHAR_WIDTH = 5.3;

/**
 * Wie viele Zeichen eine Beschriftung je Band haben darf.
 *
 * `width` ist die gemessene Breite des Rahmens; abgezogen werden die
 * Abstaende, weil die Baender nur die Zeichenflaeche teilen. Drei Pixel
 * bleiben als Luft zwischen zwei Beschriftungen.
 *
 * Entschieden wird damit fuer die ganze Achse, nie fuer eine einzelne
 * Beschriftung: eine Achse, auf der „Mai“ ausgeschrieben steht und
 * „September“ gekuerzt, sieht aus wie ein Fehler.
 */
export function charsPerBand(width: number, count: number): number {
    const plot = width - CHART_PADDING.left - CHART_PADDING.right;
    return Math.floor((plot / Math.max(count, 1) - 3) / AXIS_CHAR_WIDTH);
}

/**
 * Die Kurzinfo am Zeiger (Tooltip).
 *
 * Drei Entscheidungen stecken darin:
 *
 * 1. `variant: "none"` schaltet die mitgelieferte Flaeche ab. Sie mischt sich
 *    aus `--color-surface-100`, das es hier nicht gibt, und faellt dann auf
 *    Weiss bzw. Schwarz zurueck. Stattdessen `bg-surface`, `border-border`
 *    und `--shadow-raised` wie bei jeder anderen erhabenen Flaeche.
 * 2. `portal: false` haelt die Kurzinfo im Diagramm. Der Rahmen darum traegt
 *    `aria-hidden`; portiert an `document.body` stuende sie ausserhalb davon
 *    und waere fuer einen Screenreader wieder sichtbar.
 * 3. Keine Bewegung. Voreingestellt folgt die Kurzinfo dem Zeiger mit einer
 *    Feder und blendet ein -- beides in JavaScript, wo der
 *    `prefers-reduced-motion`-Block aus layout.css nicht hinreicht.
 */
export function chartTooltip(options: {
    /** Kopfzeile, meist der Wert der Kategorieachse (Monat, Datum, Zeitraum). */
    header?: (value: any) => string;
    /** Die Betraege selbst. Die Diagramme rechnen in Euro, nicht in Cents. */
    value: (value: any) => string;
}) {
    return {
        root: {
            variant: "none" as const,
            portal: false,
            motion: "none" as const,
            fadeDuration: 0,
            classes: {
                container:
                    "rounded-card border border-border bg-surface px-3 py-2 text-xs text-fg"
            },
            props: {
                container: { style: "box-shadow: var(--shadow-raised);" }
            }
        },
        header: {
            classes: { root: "border-border text-fg" },
            ...(options.header ? { format: options.header } : null)
        },
        item: {
            format: options.value,
            classes: {
                label: "text-fg-muted",
                value: "text-fg font-semibold tabular-figures"
            }
        },
        /**
         * Kein „total“: die Summenzeile kaeme englisch beschriftet, und die
         * Summe aus Ertrag und Aufwand eines Monats bedeutet ohnehin nichts.
         */
        hideTotal: true
    };
}

/** Betrag in der Kurzinfo. Die Diagramme fuehren Euro, `formatEuro` Cents. */
export function tooltipEuro(value: any): string {
    const euro = Number(value);
    return Number.isFinite(euro) ? formatEuro(Math.round(euro * 100)) : "–";
}
