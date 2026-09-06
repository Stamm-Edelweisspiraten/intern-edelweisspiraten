import { describe, expect, it } from "vitest";
import { validateLines, type JournalLineInput } from "./journalService";

/**
 * Die Ausgeglichenheit eines Buchungssatzes ist die zentrale Regel der
 * doppelten Buchfuehrung. Sie wird an drei Stellen geprueft: hier in der
 * Vorpruefung (fuer eine verstaendliche Meldung), noch einmal beim Schreiben
 * und ein drittes Mal von der Datenbank ueber einen aufgeschobenen Trigger.
 * Getestet wird die Vorpruefung -- die beiden anderen greifen auch dann, wenn
 * jemand an ihr vorbei schreibt.
 */

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function lines(...entries: JournalLineInput[]): JournalLineInput[] {
    return entries;
}

describe("validateLines", () => {
    it("nimmt einen ausgeglichenen Satz an", () => {
        const result = validateLines(
            lines({ accountId: A, debit: 5000 }, { accountId: B, credit: 5000 })
        );
        expect(result.ok).toBe(true);
    });

    it("nimmt eine Sammelbuchung mit mehreren Zeilen an", () => {
        const result = validateLines(
            lines(
                { accountId: A, debit: 3000 },
                { accountId: A, debit: 2000 },
                { accountId: B, credit: 5000 }
            )
        );
        expect(result.ok).toBe(true);
    });

    it("lehnt einen unausgeglichenen Satz ab und nennt die Differenz", () => {
        const result = validateLines(
            lines({ accountId: A, debit: 5000 }, { accountId: B, credit: 4000 })
        );
        expect(result.ok).toBe(false);
        expect(result.error).toContain("10,00");
    });

    it("lehnt einen Satz mit weniger als zwei Zeilen ab", () => {
        expect(validateLines(lines({ accountId: A, debit: 100 })).ok).toBe(false);
        expect(validateLines([]).ok).toBe(false);
    });

    it("lehnt eine Zeile mit Soll UND Haben ab", () => {
        const result = validateLines(
            lines({ accountId: A, debit: 100, credit: 100 }, { accountId: B, credit: 100 })
        );
        expect(result.ok).toBe(false);
        expect(result.error).toContain("Zeile 1");
    });

    it("lehnt eine Zeile ohne Betrag ab", () => {
        const result = validateLines(lines({ accountId: A }, { accountId: B, credit: 100 }));
        expect(result.ok).toBe(false);
        expect(result.error).toContain("Zeile 1");
    });

    it("lehnt negative Betraege ab", () => {
        const result = validateLines(
            lines({ accountId: A, debit: -100 }, { accountId: B, credit: -100 })
        );
        expect(result.ok).toBe(false);
    });

    it("lehnt Fliesskommabetraege ab", () => {
        // Geld ist ganzzahlig in Cents; 50,5 Cent gibt es nicht.
        const result = validateLines(
            lines({ accountId: A, debit: 50.5 }, { accountId: B, credit: 50.5 })
        );
        expect(result.ok).toBe(false);
        expect(result.error).toContain("Zeile 1");
    });

    it("lehnt eine Zeile ohne gueltiges Konto ab", () => {
        const result = validateLines(
            lines({ accountId: "kein-uuid", debit: 100 }, { accountId: B, credit: 100 })
        );
        expect(result.ok).toBe(false);
        expect(result.error).toContain("Konto");
    });
});
