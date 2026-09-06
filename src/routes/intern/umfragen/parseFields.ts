import type { SurveyFieldInput } from "$lib/server/surveyService";
import { isFieldType } from "$lib/surveys/fields";

/**
 * Die Gegenseite zu `FieldEditor.svelte`.
 *
 * Der Editor steht an zwei Stellen (`/intern/umfragen/neu` und
 * `/intern/umfragen/[id]/fragen`), also stehen auch die Feldnamen genau
 * einmal hier. Liefe das Einlesen zweimal, fiele ein vergessenes
 * `fieldId_<n>` erst dann auf, wenn `setSurveyFields` eine bearbeitete
 * Umfrage mit Antworten abweist -- und der Fehler stünde an einer Stelle, an
 * der niemand ihn sucht.
 *
 * Es ist bewusst KEIN `+page.server.ts` und keine `$lib`-Datei: die Namen
 * gehören zu diesem Editor und zu sonst nichts.
 */

/** Mehr Fragen nimmt kein Formular an -- der Zähler kommt vom Browser. */
export const MAX_FIELDS = 200;

/** Eine ganze Zahl aus dem Formular; ein leeres Feld bleibt leer. */
function numberOrNull(raw: string): number | null {
    const value = raw.trim();
    if (!value) return null;

    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Liest die Zeilen des Fragen-Editors aus einem Formular.
 *
 * Die Zuordnung läuft über die Position: `label_3` gehört zu `type_3`, und
 * die beiden gleich langen Listen `optionValues_3`/`optionLabels_3` gehören
 * paarweise zusammen. Genau deshalb schickt der Editor auch für eine leere
 * Optionszeile beide Felder.
 *
 * `fieldId_<n>` ist der wichtigste Wert: mit ihm ist die Frage dieselbe wie
 * vorher, ohne ihn wäre sie gelöscht und neu angelegt. Leere Beschriftungen
 * bleiben stehen -- `setSurveyFields` verwirft sie, und die Reservezeilen des
 * Editors sollen dort keine Sonderbehandlung brauchen.
 */
export function parseFieldRows(form: FormData): SurveyFieldInput[] {
    const count = Math.min(Number(form.get("fieldCount") ?? 0) || 0, MAX_FIELDS);
    const fields: SurveyFieldInput[] = [];

    for (let index = 0; index < count; index += 1) {
        const type = String(form.get(`type_${index}`) ?? "");
        if (!isFieldType(type)) continue;

        const id = String(form.get(`fieldId_${index}`) ?? "").trim();
        const labels = form.getAll(`optionLabels_${index}`).map(String);
        const values = form.getAll(`optionValues_${index}`).map(String);

        fields.push({
            // `undefined` statt "" -- der Dienst prüft auf eine gültige UUID.
            id: id || undefined,
            type,
            label: String(form.get(`label_${index}`) ?? ""),
            help: String(form.get(`help_${index}`) ?? ""),
            required: form.get(`required_${index}`) === "on",
            allowOther: form.get(`allowOther_${index}`) === "on",
            minValue: numberOrNull(String(form.get(`minValue_${index}`) ?? "")),
            maxValue: numberOrNull(String(form.get(`maxValue_${index}`) ?? "")),
            options: labels.map((label, position) => ({
                value: values[position] ?? "",
                label
            }))
        });
    }

    return fields;
}
