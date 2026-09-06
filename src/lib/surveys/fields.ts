/**
 * Feldtypen einer Umfrage -- geteilt zwischen Server und Oberfläche.
 *
 * Diese Datei importiert bewusst NICHTS aus `$lib/server`: sie wird sowohl
 * vom `surveyService` als auch vom Fragen-Editor im Browser gebraucht. Ein
 * Server-Import würde den ganzen Datenbankzweig in das Client-Bündel ziehen
 * (und der SvelteKit-Bauschritt bräche mit einem Hinweis auf $lib/server ab).
 *
 * Die eigentliche Entscheidung steckt in `makeOptionValues`: eine Option hat
 * einen STABILEN `value` und ein davon getrenntes `label`. Gespeichert wird
 * der `value`; das `label` darf sich jederzeit ändern, ohne die bereits
 * abgegebenen Antworten von ihrer Gruppe zu trennen. Der `value` entsteht
 * genau einmal -- beim Anlegen der Option -- und wird beim Umbenennen des
 * Labels nie neu berechnet. Wer das umdreht und den Wert aus dem Label
 * ableitet, verliert bei jeder Korrektur eines Tippfehlers die Auszählung.
 */

export type SurveyFieldType =
    | "text"
    | "longtext"
    | "single"
    | "multi"
    | "boolean"
    | "number"
    | "date"
    | "email"
    | "phone"
    | "scale"
    | "section";

export interface SurveyFieldTypeInfo {
    /** ASCII, steht so in der Datenbank (`survey_field_type`). */
    key: SurveyFieldType;
    /** Deutsche Beschriftung für die Auswahl im Editor. */
    name: string;
    /** Bootstrap-Symbol, wie überall sonst ohne den Präfix `bi-`. */
    icon: string;
    /** Ein Satz, der die Wahl erklärt -- als Hinweis unter dem Feld. */
    hint: string;
}

export const SURVEY_FIELD_TYPES: readonly SurveyFieldTypeInfo[] = [
    {
        key: "text",
        name: "Text",
        icon: "input-cursor-text",
        hint: "Einzeilige Antwort, höchstens 500 Zeichen."
    },
    {
        key: "longtext",
        name: "Langtext",
        icon: "textarea-resize",
        hint: "Mehrzeilige Antwort, höchstens 5000 Zeichen."
    },
    {
        key: "single",
        name: "Einfachauswahl",
        icon: "ui-radios",
        hint: "Genau eine der vorgegebenen Optionen."
    },
    {
        key: "multi",
        name: "Mehrfachauswahl",
        icon: "ui-checks",
        hint: "Beliebig viele der vorgegebenen Optionen."
    },
    {
        key: "boolean",
        name: "Ja/Nein",
        icon: "toggle-on",
        hint: "Zwei feste Antworten: Ja oder Nein."
    },
    {
        key: "number",
        name: "Zahl",
        icon: "123",
        hint: "Ganze Zahl, wahlweise mit kleinstem und größtem Wert."
    },
    {
        key: "date",
        name: "Datum",
        icon: "calendar-date",
        hint: "Ein Kalendertag über die Datumsauswahl des Geräts."
    },
    {
        key: "email",
        name: "E-Mail",
        icon: "envelope",
        hint: "E-Mail-Adresse; wird auf ihre Form geprüft."
    },
    {
        key: "phone",
        name: "Telefon",
        icon: "telephone",
        hint: "Rufnummer mit Ziffern, Leerzeichen, +, / und -."
    },
    {
        key: "scale",
        name: "Skala",
        icon: "star",
        hint: "Bewertung auf einer Reihe von Zahlen, Vorgabe 1 bis 5."
    },
    {
        key: "section",
        name: "Abschnitt",
        icon: "hr",
        hint: "Keine Frage, sondern eine Zwischenüberschrift zum Gliedern."
    }
];

/**
 * Der Wert der Zeile „Sonstiges" bei `single` und `multi`.
 *
 * Die Unterstriche sind kein Zierrat, sondern der Grund, warum dieser Wert
 * sicher ist: `slugifyOption` erzeugt ausschließlich `[a-z0-9-]`. Ein
 * selbst angelegtes Label kann diesen Schlüssel deshalb NIE treffen, und
 * „Sonstiges" kollidiert nie mit einer echten Option.
 */
export const OTHER_VALUE = "__other__";

/** Vorgabe der Skala, wenn die Frage keine eigenen Grenzen trägt. */
export const DEFAULT_SCALE_MIN = 1;
export const DEFAULT_SCALE_MAX = 5;

/** Weiteste zulässige Skala -- darüber wird die Reihe unbedienbar. */
export const SCALE_LIMIT = 10;

/**
 * Die beiden erlaubten Werte einer Ja/Nein-Frage.
 *
 * Bewusst deutsch und klein geschrieben: sie stehen genauso in der Spalte
 * `survey_answers.value` und sind damit ohne Übersetzungstabelle lesbar.
 */
export const BOOLEAN_VALUES = ["ja", "nein"] as const;

/** Beschriftung der beiden Ja/Nein-Werte für Auswertung und Formular. */
export const BOOLEAN_LABELS: Record<string, string> = { ja: "Ja", nein: "Nein" };

const KEYS = new Set<string>(SURVEY_FIELD_TYPES.map((entry) => entry.key));

/** Bekannter Feldtyp? Prüft Werte aus Formularen, bevor sie in die DB gehen. */
export function isFieldType(value: string | null | undefined): value is SurveyFieldType {
    return typeof value === "string" && KEYS.has(value);
}

/** Deutsche Beschriftung eines Feldtyps. */
export function fieldTypeName(type: SurveyFieldType): string {
    return SURVEY_FIELD_TYPES.find((entry) => entry.key === type)?.name ?? type;
}

/**
 * Braucht dieser Typ eine vom Menschen gepflegte Optionsliste?
 *
 * Nur `single` und `multi`. Der Fragen-Editor blendet danach die
 * Optionszeilen ein, und `setSurveyStatus("published")` weist ein solches
 * Feld ohne Optionen ab -- eine Auswahl ohne Auswahlmöglichkeiten ist eine
 * Sackgasse im Formular.
 */
export function needsOptions(type: SurveyFieldType): boolean {
    return type === "single" || type === "multi";
}

/**
 * Ist die Antwort ein Wert aus einer festen Menge?
 *
 * Absichtlich NICHT dasselbe wie `needsOptions`: `boolean` gehört hier dazu,
 * denn seine beiden Werte stehen fest (`BOOLEAN_VALUES`) und lassen sich
 * genauso auszählen wie eine Auswahl -- der Editor fragt dafür aber keine
 * Optionen ab. Die Auswertung entscheidet an dieser Funktion, ob sie Balken
 * zählt oder Freitext sammelt.
 */
export function isChoiceType(type: SurveyFieldType): boolean {
    return type === "single" || type === "multi" || type === "boolean";
}

/**
 * Erwartet dieses Feld überhaupt eine Antwort?
 *
 * Nur `section` nicht: es ist eine Zwischenüberschrift, kein Eingabefeld.
 * Beim Einsammeln der Formulardaten wird es übersprungen, und `required`
 * bleibt daran wirkungslos -- sonst ließe sich ein Formular mit einer
 * Überschrift als Pflichtfeld nie absenden.
 */
export function expectsAnswer(type: SurveyFieldType): boolean {
    return type !== "section";
}

/** Darf dieser Typ eine Zeile „Sonstiges" mit Freitext tragen? */
export function allowsOther(type: SurveyFieldType): boolean {
    return type === "single" || type === "multi";
}

/** Wertet dieser Typ `min_value`/`max_value` aus? */
export function hasRange(type: SurveyFieldType): boolean {
    return type === "number" || type === "scale";
}

/**
 * Die tatsächliche Spannweite einer Skala.
 *
 * Fehlende oder unsinnige Grenzen fallen auf 1 bis 5 zurück, statt eine leere
 * Reihe zu zeichnen. Nach oben wird bei `SCALE_LIMIT` gedeckelt: eine Skala
 * von 1 bis 200 wäre auf einem Telefon nicht mehr zu treffen.
 */
export function scaleRange(field: {
    minValue?: number | null;
    maxValue?: number | null;
}): { min: number; max: number } {
    const min = Number.isInteger(field.minValue) ? (field.minValue as number) : DEFAULT_SCALE_MIN;
    const max = Number.isInteger(field.maxValue) ? (field.maxValue as number) : DEFAULT_SCALE_MAX;

    if (max <= min) return { min: DEFAULT_SCALE_MIN, max: DEFAULT_SCALE_MAX };
    if (max - min + 1 > SCALE_LIMIT) return { min, max: min + SCALE_LIMIT - 1 };

    return { min, max };
}

/** Die Stufen einer Skala als Liste -- für die Knopfreihe im Formular. */
export function scaleSteps(field: { minValue?: number | null; maxValue?: number | null }): number[] {
    const { min, max } = scaleRange(field);
    return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}

const UMLAUTS: Record<string, string> = {
    "ä": "ae",
    "ö": "oe",
    "ü": "ue",
    "ß": "ss"
};

/**
 * Beschriftung -> stabiler Schlüssel: klein, nur `[a-z0-9-]`.
 *
 * Umlaute werden ausgeschrieben (`ä` -> `ae`), nicht entfernt: aus „Grün“
 * würde sonst „grn“. Übrige Akzente fallen über die Unicode-Zerlegung weg
 * (`café` -> `cafe`). Alles andere wird zu einem Bindestrich, mehrere
 * Bindestriche werden zusammengezogen, an den Enden fallen sie weg.
 *
 * Ein Label ganz ohne verwertbare Zeichen (etwa „???“) ergibt eine leere
 * Zeichenkette -- `makeOptionValues` vergibt dann einen Ersatzschlüssel,
 * denn eine Option ohne Wert ließe sich nicht speichern.
 */
export function slugifyOption(label: string): string {
    return (label ?? "")
        // Erst zusammensetzen: ein getippt zerlegtes „a + ¨“ soll denselben
        // Schlüssel ergeben wie ein „ä“ aus der Zwischenablage.
        .normalize("NFC")
        .toLowerCase()
        .replace(/[äöüß]/g, (char) => UMLAUTS[char] ?? char)
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/** Ersatzschlüssel, wenn aus dem Label kein einziges Zeichen übrig bleibt. */
const FALLBACK_VALUE = "option";

/** Vergibt einen noch freien Wert auf Basis des Labels. */
function uniqueValue(label: string, used: Set<string>): string {
    const base = slugifyOption(label) || FALLBACK_VALUE;

    let value = base;
    let counter = 2;
    while (used.has(value)) {
        value = `${base}-${counter}`;
        counter += 1;
    }

    used.add(value);
    return value;
}

/**
 * Beschriftungen in Optionen mit eindeutigem Wert.
 *
 * Leere Beschriftungen werden VERWORFEN, nicht mit einem Ersatzwert gefüllt:
 * der Fragen-Editor hält immer eine leere Zeile zum Weitertippen bereit, und
 * die soll beim Speichern nicht als Option „option“ auftauchen.
 *
 * Kollisionen bekommen `-2`, `-3`, ... angehängt -- auch dann, wenn die
 * Kollision erst durch das Anhängen entsteht („Ja“, „Ja“, „Ja 2“ ergibt
 * `ja`, `ja-2`, `ja-2-2`). Ein Wert wird nie zweimal vergeben, weil sonst
 * zwei Optionen in der Auswertung zu einer Zeile verschmelzen.
 */
export function makeOptionValues(labels: readonly string[]): { value: string; label: string }[] {
    const used = new Set<string>();
    const result: { value: string; label: string }[] = [];

    for (const raw of labels) {
        const label = (raw ?? "").trim();
        if (!label) continue;
        result.push({ value: uniqueValue(label, used), label });
    }

    return result;
}

/**
 * Optionen beim Speichern zusammenführen: bekannte Werte bleiben stehen, neue
 * Beschriftungen bekommen einen frischen Schlüssel.
 *
 * Genau hier hängt Regel 1 des Schemas. Der Editor schickt zu jeder Zeile den
 * bisherigen `value` mit (leer bei einer neuen Zeile). Wer einen `value`
 * mitbringt, behält ihn -- auch wenn das Label inzwischen ganz anders lautet.
 * Ohne diesen Weg entstünde beim Umbenennen ein neuer Schlüssel, und die
 * bereits abgegebenen Antworten stünden in der Auswertung als „unbekannt“ da.
 */
export function mergeOptionValues(
    rows: readonly { value?: string | null; label: string }[]
): { value: string; label: string }[] {
    const used = new Set<string>();
    const result: { value: string; label: string }[] = [];

    // Erster Durchgang: bestehende Werte belegen ihren Platz, damit ein neuer
    // Eintrag ihn nicht wegschnappt.
    const reserved = new Set<string>();
    for (const row of rows) {
        const existing = (row.value ?? "").trim();
        if (existing && (row.label ?? "").trim()) {
            reserved.add(existing);
            used.add(existing);
        }
    }

    for (const row of rows) {
        const label = (row.label ?? "").trim();
        if (!label) continue;

        const existing = (row.value ?? "").trim();

        /*
         * Ein Wert, den ein manipuliertes Formular zweimal schickt, gilt nur
         * beim ersten Mal -- sonst stünden zwei Optionen unter demselben
         * Schlüssel und verschmölzen in der Auswertung zu einer Zeile.
         */
        if (existing && reserved.delete(existing)) {
            result.push({ value: existing, label });
            continue;
        }

        result.push({ value: uniqueValue(label, used), label });
    }

    return result;
}
