import { describe, expect, it } from "vitest";
import { buildCalendar } from "./calendar";
import type { EventEntry } from "./eventService";

/**
 * iCalendar-Erzeugung.
 *
 * Die Fallen liegen im Format selbst: Zeilenlänge in Oktetten, maskierte
 * Sonderzeichen, CRLF, und das ausschließende Ende bei ganztägigen Terminen.
 * Ein Kalenderprogramm meldet solche Fehler nicht -- es zeigt den Termin
 * einfach nicht an.
 */

const OPTIONS = {
    name: "Stamm Musterstadt – Termine",
    baseUrl: "https://portal.example.org",
    domain: "portal.example.org"
};

function makeEvent(overrides: Partial<EventEntry> = {}): EventEntry {
    return {
        id: "11111111-1111-4111-8111-111111111111",
        title: "Gruppenstunde",
        description: "",
        location: "",
        startsAt: new Date("2026-05-10T16:30:00Z"),
        endsAt: new Date("2026-05-10T18:00:00Z"),
        allDay: false,
        status: "published",
        responsesEnabled: true,
        color: "blau",
        coverFileId: null,
        responseDeadline: null,
        shares: [],
        counts: { yes: 0, no: 0, maybe: 0 },
        createdAt: new Date("2026-04-01T10:00:00Z"),
        ...overrides
    };
}

describe("buildCalendar", () => {
    it("baut ein gültiges Grundgerüst", () => {
        const ics = buildCalendar([], OPTIONS);
        expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
        expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
        expect(ics).toContain("VERSION:2.0");
    });

    it("benutzt CRLF und endet mit einem Zeilenumbruch", () => {
        const ics = buildCalendar([makeEvent()], OPTIONS);
        // Kein einzelnes LF ohne vorangehendes CR.
        expect(/[^\r]\n/.test(ics)).toBe(false);
        expect(ics.endsWith("\r\n")).toBe(true);
    });

    it("schreibt Beginn und Ende als UTC-Zeitpunkte", () => {
        const ics = buildCalendar([makeEvent()], OPTIONS);
        expect(ics).toContain("DTSTART:20260510T163000Z");
        expect(ics).toContain("DTEND:20260510T180000Z");
    });

    it("macht das Ende ganztägiger Termine ausschließend", () => {
        const ics = buildCalendar(
            [
                makeEvent({
                    allDay: true,
                    startsAt: new Date("2026-07-20T00:00:00Z"),
                    endsAt: new Date("2026-07-24T00:00:00Z")
                })
            ],
            OPTIONS
        );

        expect(ics).toContain("DTSTART;VALUE=DATE:20260720");
        // Ein Lager bis einschließlich 24. endet für den Kalender am 25.
        expect(ics).toContain("DTEND;VALUE=DATE:20260725");
    });

    it("behandelt einen eintägigen ganztägigen Termin richtig", () => {
        const ics = buildCalendar(
            [
                makeEvent({
                    allDay: true,
                    startsAt: new Date("2026-07-20T00:00:00Z"),
                    endsAt: null
                })
            ],
            OPTIONS
        );

        expect(ics).toContain("DTSTART;VALUE=DATE:20260720");
        expect(ics).toContain("DTEND;VALUE=DATE:20260721");
    });

    it("maskiert Komma, Semikolon, Backslash und Zeilenumbruch", () => {
        const ics = buildCalendar(
            [
                makeEvent({
                    title: "Lager; mit, Zeichen\\Test",
                    description: "Erste Zeile\nZweite Zeile"
                })
            ],
            OPTIONS
        );

        expect(ics).toContain("SUMMARY:Lager\\; mit\\, Zeichen\\\\Test");
        expect(ics).toContain("DESCRIPTION:Erste Zeile\\nZweite Zeile");
    });

    it("bricht lange Zeilen nach 75 Oktetten um", () => {
        const ics = buildCalendar([makeEvent({ title: "A".repeat(200) })], OPTIONS);

        for (const line of ics.split("\r\n")) {
            expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
        }
        // Folgezeilen beginnen mit einem Leerzeichen.
        expect(ics).toContain("\r\n A");
    });

    it("zählt beim Umbruch Oktette, nicht Zeichen", () => {
        // Umlaute belegen in UTF-8 zwei Oktette; ein Umbruch mitten im Zeichen
        // machte die Datei unlesbar.
        const ics = buildCalendar([makeEvent({ title: "ä".repeat(120) })], OPTIONS);

        for (const line of ics.split("\r\n")) {
            expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
        }
        // Kein Zeichen ist zerbrochen: der Text bleibt vollständig.
        const unfolded = ics.replace(/\r\n /g, "");
        expect(unfolded).toContain(`SUMMARY:${"ä".repeat(120)}`);
    });

    it("trägt eine Absage als CANCELLED aus", () => {
        const ics = buildCalendar([makeEvent({ status: "cancelled" })], OPTIONS);
        expect(ics).toContain("STATUS:CANCELLED");
    });

    it("gibt jedem Termin eine stabile Kennung", () => {
        const ics = buildCalendar([makeEvent()], OPTIONS);
        expect(ics).toContain("UID:11111111-1111-4111-8111-111111111111@portal.example.org");
    });

    it("verweist auf die Terminseite", () => {
        const ics = buildCalendar([makeEvent()], OPTIONS);
        expect(ics.replace(/\r\n /g, "")).toContain(
            "URL:https://portal.example.org/intern/termine/11111111-1111-4111-8111-111111111111"
        );
    });

    it("lässt ein leeres Ende weg statt es zu erfinden", () => {
        const ics = buildCalendar([makeEvent({ endsAt: null })], OPTIONS);
        expect(ics).not.toContain("DTEND");
    });
});
