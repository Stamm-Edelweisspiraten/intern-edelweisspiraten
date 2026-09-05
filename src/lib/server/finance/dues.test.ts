import { describe, expect, it } from "vitest";
import { calculateMemberDues, totalDues } from "./dues";
import type { Dues } from "./types";

/** Beispielbeiträge in Cents: 30,00 / 12,00 / 8,00 / 15,00 EUR. */
const DUES: Dues = { stamm: 3000, gau: 1200, landesmark: 800, bund: 1500 };
const FULL = 6500;

describe("calculateMemberDues", () => {
    it("berechnet ohne Angaben den vollen Beitrag", () => {
        expect(calculateMemberDues(DUES, null).payable).toBe(FULL);
        expect(calculateMemberDues(DUES, {}).payable).toBe(FULL);
    });

    it("berücksichtigt abgewählte Anteile bei REGULÄREN Mitgliedern", () => {
        // Genau hier lag der Fehler: die Häkchen wurden nur bei
        // Zweitmitgliedern ausgewertet, alle anderen zahlten stets die volle
        // Summe.
        const result = calculateMemberDues(DUES, {
            isSecondMember: false,
            contributionDues: { stamm: true, gau: true, landesmark: true, bund: false }
        });

        expect(result.payable).toBe(FULL - DUES.bund);
        expect(result.parts.bund).toBe(0);
        expect(result.waived.bund).toBe(DUES.bund);
    });

    it("berücksichtigt abgewählte Anteile weiterhin bei Zweitmitgliedern", () => {
        const result = calculateMemberDues(DUES, {
            isSecondMember: true,
            contributionDues: { stamm: true, gau: false, landesmark: false, bund: false }
        });

        expect(result.payable).toBe(DUES.stamm);
    });

    it("behandelt Zweitmitglieder und reguläre Mitglieder bei gleicher Abwahl gleich", () => {
        const flags = { stamm: true, gau: false, landesmark: true, bund: false };

        const first = calculateMemberDues(DUES, { isSecondMember: false, contributionDues: flags });
        const second = calculateMemberDues(DUES, { isSecondMember: true, contributionDues: flags });

        expect(first.payable).toBe(second.payable);
    });

    it("ergibt 0, wenn alle Anteile abgewählt sind", () => {
        const result = calculateMemberDues(DUES, {
            contributionDues: { stamm: false, gau: false, landesmark: false, bund: false }
        });

        expect(result.payable).toBe(0);
        expect(result.waived).toEqual(DUES);
    });

    it("wertet ein fehlendes Häkchen als gesetzt (Standard: zahlt)", () => {
        const result = calculateMemberDues(DUES, { contributionDues: { bund: false } });
        expect(result.payable).toBe(FULL - DUES.bund);
    });

    it("liefert Anteile und Abwahl passend zur Summe", () => {
        const result = calculateMemberDues(DUES, {
            contributionDues: { stamm: true, gau: true, landesmark: false, bund: false }
        });

        const partsSum = Object.values(result.parts).reduce((a, b) => a + b, 0);
        const waivedSum = Object.values(result.waived).reduce((a, b) => a + b, 0);

        expect(partsSum).toBe(result.payable);
        expect(partsSum + waivedSum).toBe(FULL);
    });

    it("rechnet in ganzen Cents ohne Fließkommafehler", () => {
        const odd: Dues = { stamm: 1, gau: 2, landesmark: 3, bund: 4 };
        expect(calculateMemberDues(odd, null).payable).toBe(10);
    });
});

describe("totalDues", () => {
    it("summiert alle Anteile", () => {
        expect(totalDues(DUES)).toBe(FULL);
    });
});
