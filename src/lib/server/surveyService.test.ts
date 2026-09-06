import { describe, expect, it } from "vitest";
import { validateAnswers, type SurveyFieldEntry } from "./surveyService";

/**
 * `validateAnswers` ist die einzige Stelle, an der Feldfehler entstehen -- und
 * sie ist bewusst REIN gehalten, also ohne Datenbank prüfbar. Genau deshalb
 * steht hier ein Unit-Test und kein Integrationstest: eine Regel, die nur mit
 * laufender Datenbank zu prüfen wäre, wird beim Umbauen als Erstes still
 * verletzt.
 */

let counter = 0;

/** Eine Feldkennung in UUID-Form -- der Dienst prüft sie an anderer Stelle. */
function id(): string {
    counter += 1;
    return `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
}

function field(partial: Partial<SurveyFieldEntry> & { type: SurveyFieldEntry["type"] }) {
    return {
        id: id(),
        position: 0,
        label: "Frage",
        help: "",
        required: false,
        options: [],
        // Vorbelegungen der spaeter hinzugekommenen Spalten. Sie stehen hier
        // und nicht in jedem Aufruf, damit ein weiteres Feld nur EINE Stelle
        // kostet -- die Tests sollen die Regel pruefen, nicht das Schema.
        allowOther: false,
        minValue: null,
        maxValue: null,
        ...partial
    } satisfies SurveyFieldEntry;
}

const WEEKDAYS = [
    { value: "samstag", label: "Samstag" },
    { value: "sonntag", label: "Sonntag" }
];

describe("validateAnswers", () => {
    it("nimmt eine vollständig gültige Abgabe an", () => {
        const text = field({ type: "text", required: true });
        const long = field({ type: "longtext" });
        const single = field({ type: "single", options: WEEKDAYS, required: true });
        const multi = field({ type: "multi", options: WEEKDAYS });
        const yesno = field({ type: "boolean", required: true });

        const errors = validateAnswers(
            [text, long, single, multi, yesno],
            [
                { fieldId: text.id, value: "Anna" },
                { fieldId: long.id, value: "Mehrere\nZeilen" },
                { fieldId: single.id, value: "samstag" },
                { fieldId: multi.id, values: ["samstag", "sonntag"] },
                { fieldId: yesno.id, value: "ja" }
            ]
        );

        expect(errors).toBeNull();
    });

    it("beanstandet ein leeres Pflichtfeld", () => {
        const text = field({ type: "text", required: true });
        const errors = validateAnswers([text], []);

        expect(errors).not.toBeNull();
        expect(errors?.[text.id]).toBeTruthy();
    });

    it("wertet ein Pflichtfeld aus lauter Leerzeichen als leer", () => {
        const text = field({ type: "text", required: true });
        const errors = validateAnswers([text], [{ fieldId: text.id, value: "   \n  " }]);

        expect(errors?.[text.id]).toBeTruthy();
    });

    it("lässt ein freiwilliges Feld leer durchgehen", () => {
        const text = field({ type: "text" });
        expect(validateAnswers([text], [{ fieldId: text.id, value: "" }])).toBeNull();
    });

    it("weist zwei Werte auf einer Einfachauswahl ab", () => {
        const single = field({ type: "single", options: WEEKDAYS });

        const errors = validateAnswers(
            [single],
            [{ fieldId: single.id, values: ["samstag", "sonntag"] }]
        );

        expect(errors?.[single.id]).toBeTruthy();
    });

    it("weist einen unbekannten Wert einer Einfachauswahl ab", () => {
        const single = field({ type: "single", options: WEEKDAYS });
        const errors = validateAnswers([single], [{ fieldId: single.id, value: "montag" }]);

        expect(errors?.[single.id]).toBeTruthy();
    });

    it("weist einen unbekannten Wert in einer Mehrfachauswahl ab", () => {
        const multi = field({ type: "multi", options: WEEKDAYS });

        const errors = validateAnswers(
            [multi],
            [{ fieldId: multi.id, values: ["samstag", "montag"] }]
        );

        expect(errors?.[multi.id]).toBeTruthy();
    });

    it("lässt eine Mehrfachauswahl mit allen bekannten Werten zu", () => {
        const multi = field({ type: "multi", options: WEEKDAYS, required: true });

        expect(
            validateAnswers([multi], [{ fieldId: multi.id, values: ["sonntag"] }])
        ).toBeNull();
    });

    it("weist „vielleicht“ bei einer Ja/Nein-Frage ab", () => {
        const yesno = field({ type: "boolean" });
        const errors = validateAnswers([yesno], [{ fieldId: yesno.id, value: "vielleicht" }]);

        expect(errors?.[yesno.id]).toBeTruthy();
    });

    it("nimmt bei Ja/Nein genau „ja“ und „nein“ an", () => {
        const yesno = field({ type: "boolean" });

        expect(validateAnswers([yesno], [{ fieldId: yesno.id, value: "ja" }])).toBeNull();
        expect(validateAnswers([yesno], [{ fieldId: yesno.id, value: "nein" }])).toBeNull();
    });

    it("weist einen Text über 500 Zeichen ab, statt ihn zu kürzen", () => {
        const text = field({ type: "text" });

        expect(
            validateAnswers([text], [{ fieldId: text.id, value: "x".repeat(500) }])
        ).toBeNull();

        const errors = validateAnswers([text], [{ fieldId: text.id, value: "x".repeat(501) }]);
        expect(errors?.[text.id]).toBeTruthy();
    });

    it("weist einen Langtext über 5000 Zeichen ab", () => {
        const long = field({ type: "longtext" });

        expect(
            validateAnswers([long], [{ fieldId: long.id, value: "x".repeat(5000) }])
        ).toBeNull();

        const errors = validateAnswers([long], [{ fieldId: long.id, value: "x".repeat(5001) }]);
        expect(errors?.[long.id]).toBeTruthy();
    });

    it("übergeht eine unbekannte Feldkennung still", () => {
        // Ein Formular, das offen lag, während jemand ein Feld gelöscht hat,
        // muss sich trotzdem absenden lassen.
        const text = field({ type: "text" });

        const errors = validateAnswers(
            [text],
            [
                { fieldId: text.id, value: "Anna" },
                { fieldId: id(), value: "gelöschtes Feld" }
            ]
        );

        expect(errors).toBeNull();
    });

    it("meldet mehrere Felder auf einmal", () => {
        const a = field({ type: "text", required: true });
        const b = field({ type: "boolean", required: true });

        const errors = validateAnswers([a, b], []);

        expect(Object.keys(errors ?? {})).toHaveLength(2);
    });

    it("nimmt eine leere Feldliste an", () => {
        expect(validateAnswers([], [{ fieldId: id(), value: "egal" }])).toBeNull();
    });
});
