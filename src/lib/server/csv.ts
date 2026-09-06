/**
 * CSV-Erzeugung an einer Stelle.
 *
 * Die Escaping-Regeln standen vorher wortgleich in
 * `finance/reports/export.csv` und `finance/fiscal-years/[id]/export.csv`.
 * Zwei Kopien derselben Regel gehen frueher oder spaeter auseinander -- hier
 * steht sie einmal.
 *
 * Konventionen des Projekts, absichtlich nicht das RFC-4180-Komma:
 *
 *  - **Semikolon** als Trenner. Excel in deutscher Einstellung liest ein Komma
 *    nicht als Spaltentrenner, sondern als Dezimalzeichen.
 *  - **BOM** voran, sonst zeigt Excel Umlaute falsch an.
 *  - **CRLF** als Zeilenende.
 */

export const CSV_SEPARATOR = ";";

/** Byte Order Mark. Excel braucht sie, um UTF-8 zu erkennen. */
const BOM = "﻿";

/**
 * Zellen, die als Formel gelesen werden koennten, bekommen ein
 * vorangestelltes Apostroph.
 *
 * Ohne das wird aus einem Mitgliedsnamen wie `=cmd|' /c calc'!A1` in Excel
 * eine ausgefuehrte Formel. Die Mitgliederfelder sind Freitext, der Fall ist
 * also real und nicht theoretisch.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | null | undefined): string {
    let text = String(value ?? "");

    if (FORMULA_START.test(text)) text = `'${text}`;

    // Anfuehrungszeichen verdoppeln; alles einbetten, was den Trenner enthaelt.
    if (/[";\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;

    return text;
}

export function csvRow(cells: (string | number | null | undefined)[]): string {
    return cells.map(csvCell).join(CSV_SEPARATOR);
}

/** Vollstaendiges Dokument aus Zeilen: BOM, CRLF, abschliessender Umbruch. */
export function csvDocument(rows: (string | number | null | undefined)[][]): string {
    return BOM + rows.map(csvRow).join("\r\n") + "\r\n";
}
