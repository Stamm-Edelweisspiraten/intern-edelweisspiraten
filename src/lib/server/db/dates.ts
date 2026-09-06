/**
 * Kalendertage.
 *
 * Die date-Spalten halten einen Tag ohne Uhrzeit. Drizzle serialisiert ein
 * Date-Objekt dafuer ueber toISOString() -- und damit in UTC. Ein aus
 * Ortszeit-Bestandteilen gebautes Datum (etwa `new Date(2026, 4, 10)`, also
 * lokale Mitternacht) landet in UTC+2 dadurch auf dem VORTAG. Genau das ist
 * beim Einlesen eines Kontoauszugs passiert: aus dem 10.05. wurde der 09.05.
 *
 * toCalendarDate() nimmt die ORTSZEIT-Bestandteile eines Datums und legt sie
 * auf UTC-Mitternacht. Damit steht in der Datenbank derselbe Tag, den der
 * Mensch gemeint hat -- unabhaengig von der Zeitzone des Servers.
 */

/** Kalendertag eines Datums als UTC-Mitternacht. */
export function toCalendarDate(value: Date): Date {
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
}

/** Heutiger Kalendertag als UTC-Mitternacht. */
export function todayCalendar(): Date {
    return toCalendarDate(new Date());
}

/** Kalendertag aus Bestandteilen; `month` ist nullbasiert wie bei Date. */
export function calendarDate(year: number, month: number, day: number): Date {
    return new Date(Date.UTC(year, month, day));
}

/**
 * Jahr eines Kalendertags.
 *
 * Bewusst ueber getUTCFullYear: bei einem auf UTC-Mitternacht normierten
 * Datum wuerde getFullYear() westlich von Greenwich das Vorjahr liefern.
 */
export function calendarYear(value: Date): number {
    return toCalendarDate(value).getUTCFullYear();
}

/** JJJJ-MM-TT eines Kalendertags. */
export function calendarString(value: Date): string {
    return toCalendarDate(value).toISOString().slice(0, 10);
}
