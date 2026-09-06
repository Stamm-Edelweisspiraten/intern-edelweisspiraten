import crypto from "node:crypto";

/**
 * AES-256-GCM, ohne jeden Bezug zu SvelteKit.
 *
 * Der Schlüssel kommt als Parameter herein statt aus der Umgebung. Das ist
 * der ganze Zweck dieser Trennung: die Skripte unter `scripts/` laufen
 * außerhalb von Vite und können `$env/dynamic/private` nicht auflösen. Sie
 * brauchen dieselbe Verschlüsselung wie die Anwendung — die Zugangsdaten des
 * Objektspeichers werden von `npm run storage:setup` geschrieben und von der
 * Anwendung gelesen. Zwei Umsetzungen desselben Formats wären der sichere
 * Weg, sie auseinanderlaufen zu lassen.
 *
 * Format: `iv.daten.tag`, alle drei base64url. Der Authentifizierungstag
 * macht eine Veränderung erkennbar — ein manipulierter Wert lässt sich nicht
 * entschlüsseln, statt stillschweigend Unsinn zu liefern.
 */

/** Prüft und dekodiert einen Schlüssel aus seiner base64-Form. */
export function parseKey(raw: string | undefined | null): Buffer {
    if (!raw) {
        throw new Error(
            "Kein Verschluesselungsschluessel gesetzt. Erzeugen mit: openssl rand -base64 32"
        );
    }

    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) {
        throw new Error("Der Verschluesselungsschluessel muss 32 Bytes (base64) lang sein.");
    }

    return key;
}

export function encryptWithKey(key: Buffer, secret: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [
        iv.toString("base64url"),
        encrypted.toString("base64url"),
        tag.toString("base64url")
    ].join(".");
}

export function decryptWithKey(key: Buffer, payload: string): string {
    const parts = payload.split(".");
    if (parts.length !== 3) throw new Error("Ungültiges Geheimnis");

    const [iv, data, tag] = parts.map((part) => Buffer.from(part, "base64url"));
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
