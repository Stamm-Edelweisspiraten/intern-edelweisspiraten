import crypto from "node:crypto";
import { env } from "$env/dynamic/private";

/**
 * Verschlüsselung von Geheimnissen, die in der Datenbank stehen.
 *
 * Lag vorher in `auth/totp.ts` und war damit an die Zwei-Faktor-Einrichtung
 * gebunden. Inzwischen gibt es einen zweiten Nutzer: der geheime Schlüssel
 * des Objektspeichers steht in `settings` und darf dort ebenso wenig im
 * Klartext liegen wie ein TOTP-Secret. Beide benutzen jetzt dieselbe Stelle,
 * denselben Schlüssel und dasselbe Format.
 *
 * AES-256-GCM mit zufälligem 12-Byte-IV. Das Ergebnis ist eine Zeichenkette
 * aus drei base64url-Teilen: `iv.daten.tag`. Der Authentifizierungstag macht
 * eine Veränderung des Datensatzes erkennbar -- ein manipulierter Wert lässt
 * sich nicht entschlüsseln, statt stillschweigend Unsinn zu liefern.
 */

/**
 * Der Schlüssel kommt aus der Umgebung, nicht aus der Datenbank -- sonst
 * läge er neben dem, was er schützt.
 *
 * Der Name `MFA_ENC_KEY` bleibt aus Gründen der Abwärtskompatibilität: eine
 * Umbenennung würde bei jedem bestehenden Betrieb sämtliche hinterlegten
 * Zwei-Faktor-Secrets unlesbar machen. `APP_ENC_KEY` wird zusätzlich
 * akzeptiert und hat Vorrang, damit neue Installationen den passenderen
 * Namen verwenden können.
 */
function encryptionKey(): Buffer {
    const raw = env.APP_ENC_KEY || env.MFA_ENC_KEY;
    if (!raw) {
        throw new Error(
            "APP_ENC_KEY ist nicht konfiguriert. Erzeuge einen Schluessel mit: openssl rand -base64 32"
        );
    }
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) {
        throw new Error("APP_ENC_KEY muss 32 Bytes (base64-kodiert) lang sein.");
    }
    return key;
}

/** true, wenn ein Schlüssel hinterlegt ist -- ohne ihn zu benutzen. */
export function hasEncryptionKey(): boolean {
    try {
        encryptionKey();
        return true;
    } catch {
        return false;
    }
}

export function encryptSecret(secret: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString("base64url")}.${encrypted.toString("base64url")}.${tag.toString("base64url")}`;
}

export function decryptSecret(payload: string): string {
    const parts = payload.split(".");
    if (parts.length !== 3) throw new Error("Ungültiges Geheimnis");

    const [iv, data, tag] = parts.map((p) => Buffer.from(p, "base64url"));
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
