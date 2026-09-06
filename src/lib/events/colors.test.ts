import { describe, expect, it } from "vitest";
import {
    DEFAULT_EVENT_COLOR,
    EVENT_COLORS,
    eventColorName,
    eventColorVars,
    normalizeEventColor
} from "./colors";

/**
 * Die Farbe eines Termins steht als freier Text in der Datenbank -- bewusst,
 * damit eine neunte Farbe ohne Migration dazukommen darf. Der Preis dafuer
 * ist, dass beim Lesen alles Moegliche ankommen kann: ein alter Schluessel,
 * ein Tippfehler aus einem Skript, `null` aus einer Zeile vor der Migration.
 *
 * Diese Tests halten fest, dass daraus nie ein kaputter Stil wird, sondern
 * immer ein bekannter Schluessel -- die Anzeige darf an einem Datenfehler
 * nicht zerbrechen.
 */

describe("normalizeEventColor", () => {
    it("laesst bekannte Schluessel unveraendert", () => {
        for (const color of EVENT_COLORS) {
            expect(normalizeEventColor(color.key)).toBe(color.key);
        }
    });

    it("faellt bei einem unbekannten Wert auf die Standardfarbe zurueck", () => {
        expect(normalizeEventColor("magenta")).toBe(DEFAULT_EVENT_COLOR);
        expect(normalizeEventColor("blue")).toBe(DEFAULT_EVENT_COLOR);
    });

    it("behandelt leere Werte, null und undefined wie eine fehlende Angabe", () => {
        expect(normalizeEventColor("")).toBe(DEFAULT_EVENT_COLOR);
        expect(normalizeEventColor("   ")).toBe(DEFAULT_EVENT_COLOR);
        expect(normalizeEventColor(null)).toBe(DEFAULT_EVENT_COLOR);
        expect(normalizeEventColor(undefined)).toBe(DEFAULT_EVENT_COLOR);
    });

    it("ist unempfindlich gegen Grossschreibung und Leerzeichen", () => {
        expect(normalizeEventColor("ROT")).toBe("rot");
        expect(normalizeEventColor("Gruen")).toBe("gruen");
        expect(normalizeEventColor("  tuerkis  ")).toBe("tuerkis");
        expect(normalizeEventColor(" VIOLETT ")).toBe("violett");
    });

    it("liefert die Standardfarbe auch fuer Werte, die kein Text sind", () => {
        // Aus der Datenbank kommt Text, aus einem Formular auch -- ein
        // vertippter Aufruf soll trotzdem keine Ausnahme werfen.
        expect(normalizeEventColor(42 as unknown as string)).toBe(DEFAULT_EVENT_COLOR);
    });
});

describe("eventColorName", () => {
    it("liefert die deutsche Beschriftung mit Umlaut", () => {
        expect(eventColorName("gruen")).toBe("Grün");
        expect(eventColorName("tuerkis")).toBe("Türkis");
    });

    it("beschriftet einen unbekannten Wert wie die Standardfarbe", () => {
        expect(eventColorName("magenta")).toBe(eventColorName(DEFAULT_EVENT_COLOR));
        expect(eventColorName(null)).toBe("Blau");
    });
});

describe("eventColorVars", () => {
    it("setzt alle drei Variablen", () => {
        const style = eventColorVars("rot");

        expect(style).toContain("--ev: var(--event-rot);");
        expect(style).toContain("--ev-soft: var(--event-rot-soft);");
        expect(style).toContain("--ev-soft-fg: var(--event-rot-soft-fg);");
    });

    it("benutzt bei einem unbekannten Wert die Standardfarbe", () => {
        expect(eventColorVars("magenta")).toBe(eventColorVars(DEFAULT_EVENT_COLOR));
    });

    it("erzeugt fuer jede Farbe einen vollstaendigen Stil", () => {
        for (const color of EVENT_COLORS) {
            const style = eventColorVars(color.key);
            expect(style).toContain("--ev:");
            expect(style).toContain("--ev-soft:");
            expect(style).toContain("--ev-soft-fg:");
        }
    });
});
