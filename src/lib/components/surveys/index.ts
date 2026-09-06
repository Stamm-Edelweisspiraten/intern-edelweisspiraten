/**
 * Die Ausfüllansicht einer Umfrage -- eine Feldlogik für zwei Stellen.
 *
 * Benutzt wird sie von der internen Detailseite `/intern/umfragen/[id]` (mit
 * Anmeldung, bei Mitglieder-Umfragen mehrere Blöcke) und von der öffentlichen
 * Seite `/umfrage/[token]` (ohne Anmeldung, ein Block). Beide Stellen liefern
 * dieselben Feldbeschreibungen und lesen dieselben Formularfeldnamen aus.
 *
 * Deshalb liegen die Typen HIER und nicht im `surveyService`: die Komponenten
 * dürfen nichts aus `$lib/server` importieren, sonst zöge der SvelteKit-
 * Bauschritt den Datenbankzweig in das Browser-Bündel und bräche ab. Die
 * Routen bauen ihre Server-Daten auf diese Form um; die Ansicht selbst kennt
 * weder Datenbank noch Sitzung.
 */

import type { SurveyFieldType } from "$lib/surveys/fields";

export { default as SurveyForm } from "./SurveyForm.svelte";
export { default as SurveyField } from "./SurveyField.svelte";

/** Eine Frage, so wie das Formular sie braucht -- ohne Datenbankspalten. */
export interface SurveyFormField {
    id: string;
    type: SurveyFieldType;
    label: string;
    help: string;
    required: boolean;
    options: { value: string; label: string }[];
    allowOther: boolean;
    minValue: number | null;
    maxValue: number | null;
}

/** Soll das Formular nach einem Namen fragen -- und wenn ja, verbindlich? */
export type SurveyNameMode = "required" | "optional" | "none";

/**
 * Der Name eines Eingabefelds im Formular.
 *
 * Die Routen lesen genau diese Namen aus `request.formData()`. Wer sie ändert,
 * ändert sie an drei Stellen gleichzeitig -- deshalb stehen sie hier einmal.
 */
export function surveyFieldName(fieldId: string, prefix = "f_"): string {
    return `${prefix}${fieldId}`;
}

/** Der Freitext zur Auswahl „Sonstiges“ eines Felds. */
export function surveyOtherName(fieldId: string, prefix = "f_"): string {
    return `${prefix}${fieldId}__other`;
}

/** Das Namensfeld der öffentlichen Ansicht. */
export const SURVEY_NAME_FIELD = "publicName";

/** Schlüssel, unter dem ein Fehler zum Namensfeld erwartet wird. */
export const SURVEY_NAME_ERROR = "__name";
