import { describe, expect, it } from "vitest";
import { csvCell, csvDocument, csvRow, CSV_SEPARATOR } from "./csv";

/**
 * Die CSV-Regeln lagen vorher als zwei wortgleiche Kopien in den beiden
 * Exportrouten und waren nirgends geprueft. Der Test haelt die Konventionen
 * fest, auf die sich Excel in deutscher Einstellung verlaesst -- Semikolon,
 * BOM und CRLF -- und die Entschaerfung von Formelzellen.
 */

const BOM = "﻿";

describe("csvCell", () => {
    it("gibt einfache Werte unveraendert zurueck", () => {
        expect(csvCell("Meute Panther")).toBe("Meute Panther");
        expect(csvCell(42)).toBe("42");
    });

    it("macht aus null und undefined eine leere Zelle", () => {
        expect(csvCell(null)).toBe("");
        expect(csvCell(undefined)).toBe("");
    });

    it("bettet eine Zelle mit dem Trenner ein", () => {
        expect(csvCell("Mustermann; Max")).toBe('"Mustermann; Max"');
    });

    it("verdoppelt Anfuehrungszeichen und bettet die Zelle ein", () => {
        expect(csvCell('Er sagte "Hallo"')).toBe('"Er sagte ""Hallo"""');
    });

    it("bettet eingebettete Zeilenumbrueche ein", () => {
        expect(csvCell("Zeile 1\nZeile 2")).toBe('"Zeile 1\nZeile 2"');
        expect(csvCell("Zeile 1\r\nZeile 2")).toBe('"Zeile 1\r\nZeile 2"');
    });

    it("laesst Umlaute unangetastet", () => {
        expect(csvCell("Grüße aus Köln – Fälligkeit")).toBe("Grüße aus Köln – Fälligkeit");
    });
});

describe("csvCell: Schutz vor CSV-Injection", () => {
    it("entschaerft eine Formel mit Gleichheitszeichen", () => {
        // Ein Anfuehrungszeichen ist nicht noetig: die Zelle enthaelt weder
        // Trenner noch Umbruch. Entscheidend ist das vorangestellte Apostroph.
        expect(csvCell("=cmd|' /c calc'!A1")).toBe("'=cmd|' /c calc'!A1");
    });

    it("entschaerft fuehrendes Plus, Minus und Klammeraffen", () => {
        expect(csvCell("+1")).toBe("'+1");
        expect(csvCell("-1")).toBe("'-1");
        expect(csvCell("@x")).toBe("'@x");
    });

    it("entschaerft fuehrende Steuerzeichen, die Excel ueberliest", () => {
        expect(csvCell("\t=1+1")).toBe("'\t=1+1");
    });

    it("laesst Werte in Ruhe, die das Zeichen nicht am Anfang tragen", () => {
        expect(csvCell("Max-Mustermann")).toBe("Max-Mustermann");
        expect(csvCell("info@example.org")).toBe("info@example.org");
    });

    it("entschaerft eine negative Zahl als Zeichenkette, nicht als Zahl", () => {
        // Zahlen kommen als number an und werden nicht zu Formeln.
        expect(csvCell(-5)).toBe("'-5");
    });
});

describe("csvRow", () => {
    it("verbindet die Zellen mit dem Semikolon", () => {
        expect(CSV_SEPARATOR).toBe(";");
        expect(csvRow(["a", "b", "c"])).toBe("a;b;c");
    });

    it("ergibt aus einer leeren Zeile eine Leerzeile", () => {
        expect(csvRow([])).toBe("");
    });
});

describe("csvDocument", () => {
    it("stellt die BOM voran", () => {
        const doc = csvDocument([["a"]]);
        expect(doc.startsWith(BOM)).toBe(true);
        expect(doc.charCodeAt(0)).toBe(0xfeff);
    });

    it("trennt die Zeilen mit CRLF und schliesst mit einem Umbruch ab", () => {
        expect(csvDocument([["a"], ["b"]])).toBe(`${BOM}a\r\nb\r\n`);
    });

    it("erzeugt fuer eine leere Zeile eine wirklich leere Zeile", () => {
        expect(csvDocument([["Kopf"], [], ["Wert"]])).toBe(`${BOM}Kopf\r\n\r\nWert\r\n`);
    });

    it("setzt Escaping, Umlaute und Entschaerfung gemeinsam um", () => {
        const doc = csvDocument([
            ["Name", "Betrag"],
            ["Müller; Käthe", "-12,50"],
            ['Sagt "Hallo"', "=1+1"]
        ]);

        expect(doc).toBe(
            `${BOM}Name;Betrag\r\n` +
                `"Müller; Käthe";'-12,50\r\n` +
                `"Sagt ""Hallo""";'=1+1\r\n`
        );
    });
});
