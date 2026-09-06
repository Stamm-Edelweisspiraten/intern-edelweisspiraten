/**
 * Farben der Termine.
 *
 * Die Farbe kennzeichnet die ART eines Termins (Gruppenstunde, Fahrt,
 * Elternabend) und ist damit etwas anderes als der STATUS, den die
 * semantischen Tokens `primary`/`success`/`warning`/`danger` tragen. Beide
 * Reihen nebeneinander zu benutzen ginge schief: ein abgesagter roter Termin
 * waere von einem roten laufenden Termin nicht zu unterscheiden.
 *
 * Deshalb eine eigene, kleine Reihe mit eigenen CSS-Variablen in
 * `src/routes/layout.css`. Je Farbe drei Werte, in hell und dunkel getrennt
 * belegt:
 *
 *   --event-<key>          kraeftig, fuer Punkte und Streifen
 *   --event-<key>-soft     Flaeche
 *   --event-<key>-soft-fg  Schrift auf dieser Flaeche (mindestens 4,5:1)
 *
 * Die Klassennamen werden NICHT zusammengesetzt (`bg-event-{key}` faende
 * Tailwind beim Bauen nicht und liesse sie weg), sondern als
 * `style="background: var(--event-blau-soft)"` gesetzt -- so wie das Projekt
 * es bei `box-shadow: var(--shadow-card)` schon tut.
 *
 * Der Schluessel steht als Text in `events.color`, nicht als pgEnum: eine
 * neunte Farbe soll ohne Migration dazukommen duerfen. Was hier fehlt, faellt
 * beim Lesen auf die Standardfarbe zurueck.
 */

export interface EventColor {
    /** ASCII, steht so in der Datenbank. */
    key: string;
    /** Deutsche Beschriftung fuer die Auswahl. */
    name: string;
}

export const EVENT_COLORS: readonly EventColor[] = [
    { key: "blau", name: "Blau" },
    { key: "gruen", name: "Grün" },
    { key: "rot", name: "Rot" },
    { key: "orange", name: "Orange" },
    { key: "gelb", name: "Gelb" },
    { key: "violett", name: "Violett" },
    { key: "tuerkis", name: "Türkis" },
    { key: "grau", name: "Grau" }
];

export const DEFAULT_EVENT_COLOR = "blau";

const KEYS = new Set(EVENT_COLORS.map((color) => color.key));

/** Bekannter Schluessel oder die Standardfarbe -- nie etwas anderes. */
export function normalizeEventColor(value: string | null | undefined): string {
    if (typeof value !== "string") return DEFAULT_EVENT_COLOR;
    const trimmed = value.trim().toLowerCase();
    return KEYS.has(trimmed) ? trimmed : DEFAULT_EVENT_COLOR;
}

/** Deutsche Beschriftung, fuer Vorlesehilfen und Kurzinfos. */
export function eventColorName(value: string | null | undefined): string {
    const key = normalizeEventColor(value);
    return EVENT_COLORS.find((color) => color.key === key)?.name ?? "Blau";
}

/**
 * Die drei Variablen einer Farbe als Inline-Stil.
 *
 * Ein Aufruf statt drei `style`-Zeichenketten je Verwendungsstelle; die
 * Vorlage benutzt danach `bg-[var(--ev-soft)]`-freie, einfache Eigenschaften.
 */
export function eventColorVars(value: string | null | undefined): string {
    const key = normalizeEventColor(value);
    return (
        `--ev: var(--event-${key});` +
        `--ev-soft: var(--event-${key}-soft);` +
        `--ev-soft-fg: var(--event-${key}-soft-fg);`
    );
}
