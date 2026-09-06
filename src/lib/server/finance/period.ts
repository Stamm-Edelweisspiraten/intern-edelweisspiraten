import { calendarDate, toCalendarDate } from "$lib/server/db/dates";

/**
 * Zeitraum aus der Abfragezeichenkette.
 *
 * Alle Berichte und Kontenblaetter lesen ihren Zeitraum auf dieselbe Weise:
 * ?from=JJJJ-MM-TT&to=JJJJ-MM-TT. Ohne Angabe gilt das laufende
 * Geschaeftsjahr -- das ist in einer Vereinskasse fast immer die gesuchte
 * Antwort.
 */

export interface Period {
    from: Date;
    to: Date;
    /** Werte fuer die Formularfelder. */
    fromValue: string;
    toValue: string;
}

function parseDate(value: string | null): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

/** JJJJ-MM-TT eines auf UTC-Mitternacht normierten Kalendertags. */
function toValue(date: Date): string {
    return date.toISOString().slice(0, 10);
}

export function readPeriod(url: URL, fallbackYear?: number): Period {
    const year = fallbackYear ?? new Date().getFullYear();

    /*
     * Kalendertage, nicht Zeitpunkte: die Vergleiche laufen gegen date-
     * Spalten, und ein aus Ortszeit gebautes Datum verschoebe den Zeitraum
     * um einen Tag.
     */
    const parsedFrom = parseDate(url.searchParams.get("from"));
    const parsedTo = parseDate(url.searchParams.get("to"));

    const from = parsedFrom ? toCalendarDate(parsedFrom) : calendarDate(year, 0, 1);
    const to = parsedTo ? toCalendarDate(parsedTo) : calendarDate(year, 11, 31);

    return { from, to, fromValue: toValue(from), toValue: toValue(to) };
}
