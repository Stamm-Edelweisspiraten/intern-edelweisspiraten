import { describe, expect, it } from "vitest";
import {
    allowsOther,
    BOOLEAN_VALUES,
    expectsAnswer,
    hasRange,
    isChoiceType,
    isFieldType,
    makeOptionValues,
    mergeOptionValues,
    needsOptions,
    OTHER_VALUE,
    SCALE_LIMIT,
    scaleRange,
    scaleSteps,
    slugifyOption,
    SURVEY_FIELD_TYPES
} from "./fields";

/**
 * Die Optionswerte einer Umfrage sind das einzige Stück Logik hier, das
 * schweigend Schaden anrichten kann: ein Wert, der sich beim Umbenennen
 * ändert, oder zwei Optionen unter demselben Schlüssel zerlegen die
 * Auswertung, ohne dass irgendwo ein Fehler auftaucht. Deshalb liegt der
 * Schwerpunkt auf `makeOptionValues`.
 *
 * Ohne Datenbank -- die Datei importiert nichts aus `$lib/server`.
 */

describe("Feldtypen", () => {
    it("kennt elf Typen mit deutschem Namen, Symbol und Hinweis", () => {
        expect(SURVEY_FIELD_TYPES.map((entry) => entry.key)).toEqual([
            "text",
            "longtext",
            "single",
            "multi",
            "boolean",
            "number",
            "date",
            "email",
            "phone",
            "scale",
            "section"
        ]);

        for (const entry of SURVEY_FIELD_TYPES) {
            expect(entry.name.length).toBeGreaterThan(0);
            expect(entry.icon.length).toBeGreaterThan(0);
            expect(entry.hint.length).toBeGreaterThan(0);
        }
    });

    it("erkennt unbekannte Typen", () => {
        expect(isFieldType("single")).toBe(true);
        expect(isFieldType("scale")).toBe(true);
        expect(isFieldType("datum")).toBe(false);
        expect(isFieldType(null)).toBe(false);
    });

    it("verlangt Optionen nur bei den beiden Auswahlfeldern", () => {
        expect(needsOptions("single")).toBe(true);
        expect(needsOptions("multi")).toBe(true);
        expect(needsOptions("boolean")).toBe(false);
        expect(needsOptions("text")).toBe(false);
    });

    it("zählt Ja/Nein zu den Auswahltypen, verlangt dafür aber keine Optionen", () => {
        // Der Unterschied ist Absicht: die Auswertung zeichnet auch für
        // Ja/Nein Balken, der Editor fragt dort aber keine Optionen ab.
        expect(isChoiceType("boolean")).toBe(true);
        expect(needsOptions("boolean")).toBe(false);
        expect(isChoiceType("longtext")).toBe(false);
    });

    it("hält genau zwei Ja/Nein-Werte bereit", () => {
        expect([...BOOLEAN_VALUES]).toEqual(["ja", "nein"]);
    });
});

describe("slugifyOption", () => {
    it("schreibt Umlaute aus, statt sie zu entfernen", () => {
        expect(slugifyOption("Grün")).toBe("gruen");
        expect(slugifyOption("Käse")).toBe("kaese");
        expect(slugifyOption("Größe")).toBe("groesse");
        expect(slugifyOption("Öl")).toBe("oel");
    });

    it("macht aus Sonderzeichen einen einzigen Bindestrich", () => {
        expect(slugifyOption("Samstag & Sonntag")).toBe("samstag-sonntag");
        expect(slugifyOption("  Freitag,  abends ")).toBe("freitag-abends");
        expect(slugifyOption("10 € / Person")).toBe("10-person");
    });

    it("liefert für ein Label ganz ohne Buchstaben eine leere Zeichenkette", () => {
        expect(slugifyOption("???")).toBe("");
        expect(slugifyOption("---")).toBe("");
    });

    it("benutzt nur Kleinbuchstaben, Ziffern und Bindestriche", () => {
        expect(slugifyOption("Fahrt 2026 – Pfingsten!")).toMatch(/^[a-z0-9-]+$/);
    });
});

describe("makeOptionValues", () => {
    it("erzeugt aus Beschriftungen Wert und Label getrennt", () => {
        expect(makeOptionValues(["Samstag", "Sonntag"])).toEqual([
            { value: "samstag", label: "Samstag" },
            { value: "sonntag", label: "Sonntag" }
        ]);
    });

    it("behält die Beschriftung unverändert, auch mit Umlauten", () => {
        expect(makeOptionValues(["Grün", "Weiß"])).toEqual([
            { value: "gruen", label: "Grün" },
            { value: "weiss", label: "Weiß" }
        ]);
    });

    it("löst Doppelungen mit -2, -3 auf", () => {
        expect(makeOptionValues(["Ja", "Ja", "Ja"]).map((entry) => entry.value)).toEqual([
            "ja",
            "ja-2",
            "ja-3"
        ]);
    });

    it("löst auch Doppelungen auf, die erst durch das Anhängen entstehen", () => {
        // "Ja 2" ergäbe für sich schon "ja-2" -- der Wert ist dann vergeben.
        expect(makeOptionValues(["Ja", "Ja", "Ja 2"]).map((entry) => entry.value)).toEqual([
            "ja",
            "ja-2",
            "ja-2-2"
        ]);
    });

    it("erkennt Doppelungen, die erst durch die Sonderzeichen entstehen", () => {
        expect(
            makeOptionValues(["Mit Zelt", "mit-zelt", "Mit  Zelt!"]).map((entry) => entry.value)
        ).toEqual(["mit-zelt", "mit-zelt-2", "mit-zelt-3"]);
    });

    it("verwirft leere Beschriftungen", () => {
        // Der Fragen-Editor hält immer eine leere Zeile zum Weitertippen
        // bereit; die darf nicht als Option gespeichert werden.
        expect(makeOptionValues(["Samstag", "", "   ", "Sonntag"])).toEqual([
            { value: "samstag", label: "Samstag" },
            { value: "sonntag", label: "Sonntag" }
        ]);
        expect(makeOptionValues([])).toEqual([]);
        expect(makeOptionValues(["", "  "])).toEqual([]);
    });

    it("gibt einem Label ohne verwertbare Zeichen einen Ersatzwert", () => {
        expect(makeOptionValues(["???", "!!!"])).toEqual([
            { value: "option", label: "???" },
            { value: "option-2", label: "!!!" }
        ]);
    });

    it("schneidet umgebende Leerzeichen aus der Beschriftung", () => {
        expect(makeOptionValues(["  Samstag  "])).toEqual([
            { value: "samstag", label: "Samstag" }
        ]);
    });

    it("vergibt nie denselben Wert zweimal", () => {
        const labels = ["Ja", "ja", "JA", "Ja!", "  ja  ", "Ja 2", "ja-2"];
        const values = makeOptionValues(labels).map((entry) => entry.value);
        expect(new Set(values).size).toBe(values.length);
    });
});

describe("mergeOptionValues", () => {
    it("behält den bestehenden Wert beim Umbenennen des Labels", () => {
        // Genau die Regel, die die Auszählung zusammenhält: aus "Samstag"
        // wird "Sa." -- der gespeicherte Wert bleibt "samstag".
        expect(mergeOptionValues([{ value: "samstag", label: "Sa." }])).toEqual([
            { value: "samstag", label: "Sa." }
        ]);
    });

    it("vergibt nur für neue Zeilen einen Schlüssel", () => {
        expect(
            mergeOptionValues([
                { value: "samstag", label: "Samstag" },
                { value: "", label: "Sonntag" },
                { label: "Montag" }
            ])
        ).toEqual([
            { value: "samstag", label: "Samstag" },
            { value: "sonntag", label: "Sonntag" },
            { value: "montag", label: "Montag" }
        ]);
    });

    it("lässt einen neuen Eintrag keinen bestehenden Wert überschreiben", () => {
        expect(
            mergeOptionValues([
                { value: "", label: "Samstag" },
                { value: "samstag", label: "Sonnabend" }
            ]).map((entry) => entry.value)
        ).toEqual(["samstag-2", "samstag"]);
    });

    it("nimmt einen doppelt geschickten Wert nur einmal an", () => {
        const values = mergeOptionValues([
            { value: "ja", label: "Ja" },
            { value: "ja", label: "Doch" }
        ]).map((entry) => entry.value);

        expect(values[0]).toBe("ja");
        expect(new Set(values).size).toBe(2);
    });

    it("verwirft leere Beschriftungen samt ihrem Wert", () => {
        expect(mergeOptionValues([{ value: "alt", label: "  " }])).toEqual([]);
    });
});

describe("expectsAnswer", () => {
    it("überspringt nur den Abschnitt", () => {
        expect(expectsAnswer("section")).toBe(false);
        for (const entry of SURVEY_FIELD_TYPES) {
            if (entry.key === "section") continue;
            expect(expectsAnswer(entry.key), entry.key).toBe(true);
        }
    });
});

describe("allowsOther und hasRange", () => {
    it("erlaubt „Sonstiges“ nur bei den Auswahlfeldern", () => {
        expect(allowsOther("single")).toBe(true);
        expect(allowsOther("multi")).toBe(true);
        // Ja/Nein hat zwei feste Werte -- ein „Sonstiges“ wäre ein dritter.
        expect(allowsOther("boolean")).toBe(false);
        expect(allowsOther("text")).toBe(false);
    });

    it("wertet Grenzen nur bei Zahl und Skala aus", () => {
        expect(hasRange("number")).toBe(true);
        expect(hasRange("scale")).toBe(true);
        expect(hasRange("text")).toBe(false);
    });
});

describe("OTHER_VALUE", () => {
    /*
     * Die eigentliche Zusicherung: aus keinem Label lässt sich dieser Wert
     * erzeugen. Sonst könnte eine selbst angelegte Option „Sonstiges“
     * überschreiben.
     */
    it("kann nie aus einem Label entstehen", () => {
        expect(slugifyOption("__other__")).not.toBe(OTHER_VALUE);
        expect(slugifyOption("Sonstiges")).not.toBe(OTHER_VALUE);
        expect(makeOptionValues(["__other__", "other"]).map((o) => o.value)).not.toContain(
            OTHER_VALUE
        );
    });
});

describe("scaleRange und scaleSteps", () => {
    it("nimmt ohne Angabe 1 bis 5", () => {
        expect(scaleRange({})).toEqual({ min: 1, max: 5 });
        expect(scaleSteps({})).toEqual([1, 2, 3, 4, 5]);
    });

    it("übernimmt eigene Grenzen", () => {
        expect(scaleRange({ minValue: 1, maxValue: 6 })).toEqual({ min: 1, max: 6 });
        expect(scaleSteps({ minValue: 0, maxValue: 3 })).toEqual([0, 1, 2, 3]);
    });

    it("faellt bei unsinnigen Grenzen auf die Vorgabe zurueck", () => {
        // Max unter Min ergaebe eine leere Reihe.
        expect(scaleRange({ minValue: 5, maxValue: 2 })).toEqual({ min: 1, max: 5 });
        expect(scaleRange({ minValue: 3, maxValue: 3 })).toEqual({ min: 1, max: 5 });
        expect(scaleRange({ minValue: null, maxValue: null })).toEqual({ min: 1, max: 5 });
    });

    it("deckelt eine zu weite Skala", () => {
        const range = scaleRange({ minValue: 1, maxValue: 200 });
        expect(range.min).toBe(1);
        expect(range.max - range.min + 1).toBe(SCALE_LIMIT);
        expect(scaleSteps({ minValue: 1, maxValue: 200 })).toHaveLength(SCALE_LIMIT);
    });
});
