import { describe, expect, it } from "vitest";
import {
    groupTargets,
    isShareKind,
    parseShareValues,
    sharesGrantGroupScope
} from "./shareService";

/**
 * Die Regeln rund um Freigaben ohne Datenbank.
 *
 * `sharesGrantGroupScope` traegt die unsymmetrische Regel des ganzen
 * Projekts: ohne Freigabe fuer alle sichtbar, aber gerade NICHT von einer
 * gruppengebundenen Verwaltung zu aendern. Sie ist der wahrscheinlichste Ort
 * fuer einen stillen Rechtefehler und deshalb hier festgehalten.
 */

const G1 = "11111111-1111-4111-8111-111111111111";
const G2 = "22222222-2222-4222-8222-222222222222";
const U1 = "33333333-3333-4333-8333-333333333333";

describe("isShareKind", () => {
    it("erkennt die vier Arten", () => {
        expect(isShareKind("group")).toBe(true);
        expect(isShareKind("position")).toBe(true);
        expect(isShareKind("role")).toBe(true);
        expect(isShareKind("user")).toBe(true);
    });

    it("weist alles andere ab", () => {
        expect(isShareKind("gruppe")).toBe(false);
        expect(isShareKind("")).toBe(false);
        expect(isShareKind("GROUP")).toBe(false);
    });
});

describe("parseShareValues", () => {
    it("zerlegt art:kennung", () => {
        expect(parseShareValues([`group:${G1}`, `user:${U1}`])).toEqual([
            { targetKind: "group", targetId: G1 },
            { targetKind: "user", targetId: U1 }
        ]);
    });

    it("verwirft unbekannte Arten, ungueltige Kennungen und Muell", () => {
        expect(
            parseShareValues([
                `gruppe:${G1}`, // unbekannte Art
                "group:keine-uuid", // ungueltige Kennung
                "ohne-trennzeichen",
                "",
                `group:${G2}`
            ])
        ).toEqual([{ targetKind: "group", targetId: G2 }]);
    });

    it("bleibt bei einer leeren Liste leer", () => {
        expect(parseShareValues([])).toEqual([]);
    });
});

describe("groupTargets", () => {
    it("liefert nur die Gruppen", () => {
        expect(
            groupTargets([
                { targetKind: "group", targetId: G1 },
                { targetKind: "user", targetId: U1 },
                { targetKind: "group", targetId: G2 }
            ])
        ).toEqual([G1, G2]);
    });
});

describe("sharesGrantGroupScope", () => {
    it("laesst stammesweite Rechte immer durch", () => {
        expect(sharesGrantGroupScope([], null)).toBe(true);
        expect(sharesGrantGroupScope([{ targetKind: "group", targetId: G1 }], null)).toBe(true);
    });

    it("weist ab, wenn das Recht gar nicht vorliegt", () => {
        expect(sharesGrantGroupScope([{ targetKind: "group", targetId: G1 }], [])).toBe(false);
    });

    it("erlaubt die eigene Gruppe", () => {
        expect(sharesGrantGroupScope([{ targetKind: "group", targetId: G1 }], [G1])).toBe(true);
    });

    it("weist eine fremde Gruppe ab", () => {
        expect(sharesGrantGroupScope([{ targetKind: "group", targetId: G2 }], [G1])).toBe(false);
    });

    it("zaehlt nur Gruppenfreigaben, keine Personen- oder Rollenziele", () => {
        expect(sharesGrantGroupScope([{ targetKind: "user", targetId: G1 }], [G1])).toBe(false);
    });

    /**
     * Der Kern der Regel: ohne Freigabe ist ein Objekt fuer alle SICHTBAR,
     * aber nicht von einer gruppengebundenen Verwaltung zu aendern.
     */
    it("verwehrt einer gruppengebundenen Verwaltung das freigabelose Objekt", () => {
        expect(sharesGrantGroupScope([], [G1])).toBe(false);
    });
});
