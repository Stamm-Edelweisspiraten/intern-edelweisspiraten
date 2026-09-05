/**
 * Ersatz fuer $env/dynamic/private in den Unit-Tests.
 *
 * Die Werte aus der echten Umgebung ueberlagern die Vorgaben. Damit koennen
 * einzelne Tests gegen laufende Dienste pruefen (Datenbank, Objektspeicher),
 * ohne dass die uebrigen Tests eine Umgebung brauchen -- sie ueberspringen
 * sich selbst, wenn die noetigen Werte fehlen.
 */
const defaults: Record<string, string | undefined> = {
    // Fester Testschluessel (32 Byte base64) fuer die Verschluesselung.
    MFA_ENC_KEY: "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=",
    SESSION_SECRET: "test-secret"
};

export const env: Record<string, string | undefined> = { ...defaults, ...process.env };
