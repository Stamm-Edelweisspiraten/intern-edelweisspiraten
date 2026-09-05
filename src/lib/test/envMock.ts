/** Ersatz fuer $env/dynamic/private in den Unit-Tests. */
export const env: Record<string, string | undefined> = {
    // Fester Testschluessel (32 Byte base64) fuer die MFA-Verschluesselung.
    MFA_ENC_KEY: "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=",
    SESSION_SECRET: "test-secret",
    MONGODB_URI: "",
    MONGODB_DB: "intern-test"
};
