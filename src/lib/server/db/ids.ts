const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ersetzt ObjectId.isValid().
 *
 * Ohne diese Pruefung wirft PostgreSQL bei einer unpassenden Kennung aus der
 * URL einen Typfehler (22P02), statt dass die Abfrage sauber "nicht gefunden"
 * liefert. Jede Funktion, die eine Kennung von aussen entgegennimmt, prueft
 * deshalb zuerst hiermit.
 */
export function isUuid(value: string | null | undefined): value is string {
    return typeof value === "string" && UUID_PATTERN.test(value);
}

/** Filtert eine Liste auf gueltige Kennungen -- fuer inArray()-Abfragen. */
export function onlyUuids(values: readonly (string | null | undefined)[]): string[] {
    return values.filter(isUuid);
}
