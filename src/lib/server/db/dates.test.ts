import { describe, expect, it } from "vitest";
import { calendarDate, calendarString, calendarYear, toCalendarDate } from "./dates";

/**
 * Kalendertage.
 *
 * Der Fehler, den diese Funktionen verhindern: ein aus Ortszeit gebautes
 * Datum (lokale Mitternacht) wird von Drizzle ueber toISOString serialisiert
 * und landet oestlich von Greenwich im VORTAG. Beim Einlesen eines
 * Kontoauszugs wurde aus dem 10.05. dadurch der 09.05.
 */

describe("toCalendarDate", () => {
    it("legt Ortszeit-Mitternacht auf denselben Tag in UTC", () => {
        const local = new Date(2026, 4, 10); // 10. Mai, lokale Mitternacht
        expect(toCalendarDate(local).toISOString()).toBe("2026-05-10T00:00:00.000Z");
    });

    it("behaelt den Tag auch bei einer Uhrzeit spaet am Abend", () => {
        const evening = new Date(2026, 4, 10, 23, 45);
        expect(calendarString(evening)).toBe("2026-05-10");
    });

    it("behaelt den Tag auch kurz nach Mitternacht", () => {
        const night = new Date(2026, 4, 10, 0, 15);
        expect(calendarString(night)).toBe("2026-05-10");
    });

    it("laesst ein bereits normiertes Datum unveraendert", () => {
        const normalized = calendarDate(2026, 4, 10);
        expect(toCalendarDate(normalized).toISOString()).toBe(normalized.toISOString());
    });

    it("uebersteht den Wechsel zur Sommerzeit", () => {
        // In Mitteleuropa faellt 2026 die Nacht zum 29. März auf die Umstellung.
        const dst = new Date(2026, 2, 29, 12, 0);
        expect(calendarString(dst)).toBe("2026-03-29");
    });
});

describe("calendarDate", () => {
    it("baut den Tag ohne Zeitzonenverschiebung", () => {
        expect(calendarDate(2026, 0, 1).toISOString()).toBe("2026-01-01T00:00:00.000Z");
        expect(calendarDate(2026, 11, 31).toISOString()).toBe("2026-12-31T00:00:00.000Z");
    });
});

describe("calendarYear", () => {
    it("liefert das Jahr des Kalendertags", () => {
        expect(calendarYear(calendarDate(2026, 0, 1))).toBe(2026);
        expect(calendarYear(calendarDate(2026, 11, 31))).toBe(2026);
    });

    it("liefert bei einem Datum aus dem Formular das erwartete Jahr", () => {
        // <input type="date"> sendet JJJJ-MM-TT; new Date() liest das als UTC.
        expect(calendarYear(new Date("2026-01-01"))).toBe(2026);
        expect(calendarYear(new Date("2026-12-31"))).toBe(2026);
    });
});
