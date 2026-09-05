/**
 * Gemeinsame Formatierungs-Helfer.
 *
 * Ersetzt die bisher pro Seite kopierten Varianten von formatDate und der
 * Altersberechnung, die sich in Randfaellen unterschiedlich verhalten haben.
 */

function toDate(value: string | number | Date | null | undefined): Date | null {
    if (value === null || value === undefined || value === "") return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

/** Datum als TT.MM.JJJJ; ungueltige Werte werden zum Platzhalter. */
export function formatDate(
    value: string | number | Date | null | undefined,
    fallback = "-"
): string {
    const date = toDate(value);
    if (!date) return fallback;
    return date.toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });
}

/** Datum und Uhrzeit als TT.MM.JJJJ, HH:MM. */
export function formatDateTime(
    value: string | number | Date | null | undefined,
    fallback = "-"
): string {
    const date = toDate(value);
    if (!date) return fallback;
    return date.toLocaleString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

/** Datum im Format fuer <input type="date">. */
export function toDateInputValue(value: string | number | Date | null | undefined): string {
    const date = toDate(value);
    if (!date) return "";
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Alter in vollen Jahren zum Stichtag (Standard: heute).
 * Der Geburtstag zaehlt erst ab dem Tag selbst.
 */
export function calculateAge(
    birthday: string | number | Date | null | undefined,
    reference: Date = new Date()
): number | null {
    const birth = toDate(birthday);
    if (!birth) return null;

    let age = reference.getFullYear() - birth.getFullYear();
    const monthDiff = reference.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && reference.getDate() < birth.getDate())) {
        age -= 1;
    }
    return age < 0 ? null : age;
}

/** Vor- und Nachname zu einem Anzeigenamen zusammensetzen. */
export function fullName(
    person: { firstname?: string | null; lastname?: string | null } | null | undefined,
    fallback = "Unbekannt"
): string {
    const name = `${person?.firstname ?? ""} ${person?.lastname ?? ""}`.trim();
    return name || fallback;
}
