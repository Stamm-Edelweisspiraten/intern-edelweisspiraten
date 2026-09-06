/**
 * Geldbetraege werden projektweit als ganzzahlige Cents gefuehrt.
 *
 * Vorher lagen Betraege als Float in Euro in der Datenbank, was bei jeder
 * Summenbildung Rundungsfehler erzeugt hat (0.1 + 0.2 !== 0.3) und beim
 * Aufteilen einer Bestellung Cents verschwinden liess.
 */
export type Cents = number;

/** Formatiert Cents als deutschen Betrag, z.B. 1234 -> "12,34 EUR". */
export function formatEuro(cents: Cents, options: { withUnit?: boolean } = {}): string {
    const { withUnit = true } = options;
    const safe = Number.isFinite(cents) ? Math.round(cents) : 0;
    const negative = safe < 0;
    const abs = Math.abs(safe);
    const euros = Math.floor(abs / 100);
    const rest = abs % 100;
    const body = `${negative ? "-" : ""}${euros.toLocaleString("de-DE")},${String(rest).padStart(2, "0")}`;
    return withUnit ? `${body} EUR` : body;
}

/**
 * Liest eine Benutzereingabe als Cents ein. Akzeptiert "12,34", "12.34",
 * "1.234,56" und "12". Gibt bei ungueltiger Eingabe null zurueck, damit der
 * Aufrufer einen Formularfehler melden kann statt still 0 zu buchen.
 */
export function parseEuro(input: string | number | null | undefined): Cents | null {
    if (input === null || input === undefined) return null;
    if (typeof input === "number") {
        if (!Number.isFinite(input)) return null;
        return Math.round(input * 100);
    }

    const raw = input.trim();
    if (!raw) return null;

    // Tausenderpunkte nur entfernen, wenn zusaetzlich ein Dezimalkomma vorkommt.
    const normalized = raw.includes(",")
        ? raw.replace(/\./g, "").replace(",", ".")
        : raw;

    if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;

    const value = Number(normalized);
    if (!Number.isFinite(value)) return null;

    return Math.round(value * 100);
}

/**
 * Verteilt einen Betrag moeglichst gleichmaessig auf n Empfaenger.
 * Der Rest wird auf die vorderen Empfaenger verteilt, damit die Summe der
 * Anteile exakt dem Ausgangsbetrag entspricht (10,00 EUR auf 3 -> 3,34/3,33/3,33).
 */
export function splitEvenly(total: Cents, parts: number): Cents[] {
    if (!Number.isInteger(parts) || parts <= 0) return [];

    const amount = Math.round(total);
    const negative = amount < 0;
    const abs = Math.abs(amount);

    const base = Math.floor(abs / parts);
    const remainder = abs - base * parts;

    return Array.from({ length: parts }, (_, index) => {
        const share = base + (index < remainder ? 1 : 0);
        return negative ? -share : share;
    });
}

/** Summiert Cent-Betraege ohne Float-Drift. */
export function sumCents(values: Iterable<Cents>): Cents {
    let total = 0;
    for (const value of values) {
        total += Number.isFinite(value) ? Math.round(value) : 0;
    }
    return total;
}
