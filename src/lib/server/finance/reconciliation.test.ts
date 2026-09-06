import { describe, expect, it } from "vitest";
import { parseCsvStatement } from "./reconciliationService";

/**
 * Kontoauszuege kommen als CSV, und jede Bank baut sie anders. Getestet wird
 * das Einlesen: Spaltenerkennung ueber die Kopfzeile, deutsches Zahlen- und
 * Datumsformat, Vorzeichen und die Behandlung unbrauchbarer Zeilen.
 */

const HEADER = "Buchungstag;Beguenstigter/Zahlungspflichtiger;Verwendungszweck;Betrag";

function csv(...rows: string[]): string {
    return [HEADER, ...rows].join("\r\n");
}

describe("parseCsvStatement", () => {
    it("liest eine deutsche Zeile mit Semikolon und Komma", () => {
        const { lines, errors } = parseCsvStatement(csv("10.05.2026;Anna Berger;Spende;25,00"));

        expect(errors).toEqual([]);
        expect(lines).toHaveLength(1);
        expect(lines[0].amount).toBe(2500);
        expect(lines[0].counterparty).toBe("Anna Berger");
        expect(lines[0].reference).toBe("Spende");
    });

    it("legt das Datum auf den gemeinten Kalendertag", () => {
        // Ortszeit-Mitternacht laege in UTC+2 im Vortag; das Ergebnis muss
        // unabhaengig von der Zeitzone des Servers der 10. Mai sein.
        const { lines } = parseCsvStatement(csv("10.05.2026;A;B;1,00"));
        expect(lines[0].date.toISOString().slice(0, 10)).toBe("2026-05-10");
    });

    it("versteht zweistellige Jahreszahlen", () => {
        const { lines } = parseCsvStatement(csv("03.01.26;A;B;1,00"));
        expect(lines[0].date.toISOString().slice(0, 10)).toBe("2026-01-03");
    });

    it("versteht ISO-Datumsangaben", () => {
        const { lines } = parseCsvStatement(csv("2026-07-04;A;B;1,00"));
        expect(lines[0].date.toISOString().slice(0, 10)).toBe("2026-07-04");
    });

    it("behaelt das Vorzeichen: Ausgaenge sind negativ", () => {
        const { lines } = parseCsvStatement(csv("10.05.2026;Laden;Einkauf;-349,00"));
        expect(lines[0].amount).toBe(-34900);
    });

    it("entfernt den Tausenderpunkt", () => {
        const { lines } = parseCsvStatement(csv("10.05.2026;A;B;1.234,56"));
        expect(lines[0].amount).toBe(123456);
    });

    it("liest eingebettete Trennzeichen in Anfuehrungszeichen", () => {
        const { lines } = parseCsvStatement(
            csv('10.05.2026;"Meier; Sohn & Co";"Rechnung 1; Teil 2";10,00')
        );
        expect(lines[0].counterparty).toBe("Meier; Sohn & Co");
        expect(lines[0].reference).toBe("Rechnung 1; Teil 2");
    });

    it("uebergeht Nullbetraege", () => {
        const { lines } = parseCsvStatement(csv("10.05.2026;A;B;0,00"));
        expect(lines).toHaveLength(0);
    });

    it("meldet unleserliche Zeilen, liest die uebrigen aber weiter", () => {
        const { lines, errors } = parseCsvStatement(
            csv("kein Datum;A;B;10,00", "11.05.2026;C;D;20,00")
        );
        expect(lines).toHaveLength(1);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain("Zeile 2");
    });

    it("meldet fehlende Pflichtspalten in der Kopfzeile", () => {
        const { lines, errors } = parseCsvStatement("Konto;Text\r\n1;zwei");
        expect(lines).toHaveLength(0);
        expect(errors[0]).toContain("Kopfzeile");
    });

    it("kommt mit einer Datei ohne Buchungszeilen zurecht", () => {
        const { lines, errors } = parseCsvStatement(HEADER);
        expect(lines).toHaveLength(0);
        expect(errors).toHaveLength(1);
    });

    it("entfernt eine vorangestellte Byte-Order-Mark", () => {
        // Excel schreibt sie; ohne Behandlung waere die erste Spalte unlesbar.
        const { lines, errors } = parseCsvStatement(`﻿${csv("10.05.2026;A;B;5,00")}`);
        expect(errors).toEqual([]);
        expect(lines[0].amount).toBe(500);
    });

    it("kommt auch mit Komma als Trennzeichen zurecht", () => {
        const { lines } = parseCsvStatement("Buchungstag,Name,Verwendungszweck,Betrag\r\n10.05.2026,A,B,7.50");
        expect(lines[0].amount).toBe(750);
    });
});
