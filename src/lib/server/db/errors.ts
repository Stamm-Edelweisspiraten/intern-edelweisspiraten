/**
 * Fehlercodes von PostgreSQL erkennen.
 *
 * **Warum das nicht trivial ist:** postgres.js wirft einen `PostgresError`
 * mit `code` direkt am Objekt. Sobald die Abfrage aber ueber den
 * Abfragebauer von Drizzle laeuft -- also praktisch ueberall in diesem
 * Projekt --, verpackt Drizzle ihn in einen `DrizzleQueryError` und haengt
 * das Original an `cause`. Am aeusseren Fehler steht dann kein `code` mehr.
 *
 * Sechs Dienste hatten deshalb dieselbe wirkungslose Pruefung stehen:
 *
 *     if ((err as { code?: string })?.code === "23505") { ... }
 *
 * `code` war immer `undefined`, der Zweig lief nie, und aus einer doppelten
 * E-Mail-Adresse wurde ein 500er statt der Meldung "existiert bereits".
 * Aufgefallen ist es erst in der Abnahme im Browser.
 *
 * Darum wird die `cause`-Kette hier abgelaufen statt nur das oberste Objekt
 * angesehen -- und zwar an genau einer Stelle.
 */

/** Eindeutiger Index verletzt. */
export const UNIQUE_VIOLATION = "23505";

/** Fremdschluessel verletzt -- der Zielsatz fehlt oder haengt noch. */
export const FOREIGN_KEY_VIOLATION = "23503";

/**
 * CHECK-Bedingung verletzt. Die Trigger der Buchungspruefung melden sich
 * ebenfalls damit (siehe drizzle/0001_balanced_entries.sql).
 */
export const CHECK_VIOLATION = "23514";

/** NOT NULL verletzt. */
export const NOT_NULL_VIOLATION = "23502";

/**
 * Der Fehlercode aus einem Fehler, egal wie tief er verpackt ist.
 *
 * Die Tiefe ist begrenzt: eine `cause`, die auf sich selbst zeigt, wuerde
 * sonst eine Endlosschleife ergeben.
 */
export function postgresErrorCode(err: unknown): string | undefined {
    let current: unknown = err;

    for (let depth = 0; depth < 8; depth++) {
        if (!current || typeof current !== "object") return undefined;

        const code = (current as { code?: unknown }).code;
        if (typeof code === "string" && code.length > 0) return code;

        current = (current as { cause?: unknown }).cause;
    }

    return undefined;
}

/**
 * Alle Meldungen der Fehlerkette, verkettet.
 *
 * Dasselbe Problem wie beim Fehlercode: `DrizzleQueryError.message` lautet
 * "Failed query: insert into ...". Der Text, den ein Trigger mit
 * `RAISE EXCEPTION` gesetzt hat -- etwa "Buchungssatz ... ist nicht
 * ausgeglichen" --, steht ausschliesslich an `cause`. Wer nur die aeussere
 * Meldung durchsucht, findet ihn nie und zeigt dem Kassenwart statt der
 * genauen Ursache einen allgemeinen Satz.
 */
export function errorMessageChain(err: unknown): string {
    const teile: string[] = [];
    let current: unknown = err;

    for (let depth = 0; depth < 8; depth++) {
        if (!current || typeof current !== "object") break;

        const message = (current as { message?: unknown }).message;
        if (typeof message === "string") teile.push(message);

        current = (current as { cause?: unknown }).cause;
    }

    return teile.join(" | ");
}

/** true, wenn ein eindeutiger Index die Anlage verhindert hat. */
export function isUniqueViolation(err: unknown): boolean {
    return postgresErrorCode(err) === UNIQUE_VIOLATION;
}

/** true, wenn ein Fremdschluessel im Weg stand. */
export function isForeignKeyViolation(err: unknown): boolean {
    return postgresErrorCode(err) === FOREIGN_KEY_VIOLATION;
}

/** true, wenn eine CHECK-Bedingung oder ein Trigger abgelehnt hat. */
export function isCheckViolation(err: unknown): boolean {
    return postgresErrorCode(err) === CHECK_VIOLATION;
}

/**
 * Der Name des verletzten Constraints, sofern PostgreSQL ihn mitschickt.
 *
 * Nuetzlich, wenn eine Tabelle mehrere eindeutige Indizes hat und die Meldung
 * sagen soll, WELCHE Angabe schon vergeben ist.
 */
export function violatedConstraint(err: unknown): string | undefined {
    let current: unknown = err;

    for (let depth = 0; depth < 8; depth++) {
        if (!current || typeof current !== "object") return undefined;

        const record = current as { constraint_name?: unknown; constraint?: unknown; cause?: unknown };
        const name = record.constraint_name ?? record.constraint;
        if (typeof name === "string" && name.length > 0) return name;

        current = record.cause;
    }

    return undefined;
}
