import { describe, expect, it } from "vitest";
import { formatEuro, parseEuro, splitEvenly, sumCents } from "$lib/money";

describe("formatEuro", () => {
    it("formatiert Cents mit zwei Nachkommastellen", () => {
        expect(formatEuro(1234)).toBe("12,34 EUR");
        expect(formatEuro(0)).toBe("0,00 EUR");
        expect(formatEuro(5)).toBe("0,05 EUR");
        expect(formatEuro(100)).toBe("1,00 EUR");
    });

    it("stellt negative Betraege mit Vorzeichen dar", () => {
        expect(formatEuro(-1234)).toBe("-12,34 EUR");
        expect(formatEuro(-5)).toBe("-0,05 EUR");
    });

    it("kann die Einheit weglassen", () => {
        expect(formatEuro(1234, { withUnit: false })).toBe("12,34");
    });

    it("faellt bei unbrauchbaren Werten auf 0 zurueck statt NaN zu zeigen", () => {
        // Die alte euro()-Variante aus dem Finance-Bereich hat bei einem
        // Nicht-Zahlwert eine Exception geworfen.
        expect(formatEuro(Number.NaN)).toBe("0,00 EUR");
        expect(formatEuro(Number.POSITIVE_INFINITY)).toBe("0,00 EUR");
    });
});

describe("parseEuro", () => {
    it("liest deutsche und englische Schreibweise", () => {
        expect(parseEuro("12,34")).toBe(1234);
        expect(parseEuro("12.34")).toBe(1234);
        expect(parseEuro("12")).toBe(1200);
        expect(parseEuro("0,05")).toBe(5);
    });

    it("entfernt Tausenderpunkte nur bei vorhandenem Dezimalkomma", () => {
        expect(parseEuro("1.234,56")).toBe(123456);
        // Ohne Komma ist der Punkt ein Dezimaltrenner, kein Tausenderpunkt.
        expect(parseEuro("1.234")).toBe(123);
    });

    it("akzeptiert Zahlen direkt", () => {
        expect(parseEuro(12.34)).toBe(1234);
        expect(parseEuro(0)).toBe(0);
    });

    it("meldet ungueltige Eingaben als null statt still 0 zu buchen", () => {
        expect(parseEuro("")).toBeNull();
        expect(parseEuro("   ")).toBeNull();
        expect(parseEuro("abc")).toBeNull();
        expect(parseEuro("12,34,56")).toBeNull();
        expect(parseEuro(null)).toBeNull();
        expect(parseEuro(undefined)).toBeNull();
        expect(parseEuro(Number.NaN)).toBeNull();
    });

    it("rundet korrekt auf ganze Cents", () => {
        expect(parseEuro(0.1 + 0.2)).toBe(30);
    });
});

describe("splitEvenly", () => {
    it("verteilt ohne Centverlust -- der konkrete Altfall 10,00 auf 3", () => {
        // Vorher: Number((10/3).toFixed(2)) = 3.33 je Mitglied -> Summe 9.99.
        const parts = splitEvenly(1000, 3);
        expect(parts).toEqual([334, 333, 333]);
        expect(sumCents(parts)).toBe(1000);
    });

    it("teilt glatt auf, wenn es aufgeht", () => {
        expect(splitEvenly(900, 3)).toEqual([300, 300, 300]);
        expect(splitEvenly(1000, 1)).toEqual([1000]);
    });

    it("erhaelt die Summe fuer beliebige Kombinationen", () => {
        for (let total = 0; total <= 200; total += 7) {
            for (let parts = 1; parts <= 9; parts++) {
                expect(sumCents(splitEvenly(total, parts))).toBe(total);
            }
        }
    });

    it("behandelt negative Betraege symmetrisch", () => {
        const parts = splitEvenly(-1000, 3);
        expect(sumCents(parts)).toBe(-1000);
        expect(parts).toEqual([-334, -333, -333]);
    });

    it("gibt bei ungueltiger Empfaengerzahl eine leere Liste zurueck", () => {
        expect(splitEvenly(1000, 0)).toEqual([]);
        expect(splitEvenly(1000, -1)).toEqual([]);
        expect(splitEvenly(1000, 1.5)).toEqual([]);
    });
});

describe("sumCents", () => {
    it("summiert ohne Float-Drift", () => {
        expect(sumCents([10, 20])).toBe(30);
        expect(sumCents([])).toBe(0);
    });

    it("ignoriert unbrauchbare Werte", () => {
        expect(sumCents([100, Number.NaN, 50])).toBe(150);
    });
});
