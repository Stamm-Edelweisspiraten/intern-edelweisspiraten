import crypto from "node:crypto";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { env } from "$env/dynamic/private";

/**
 * Zwei-Faktor-Authentifizierung per TOTP (Authenticator-App).
 *
 * Das Secret wird verschluesselt abgelegt, damit ein reiner Lesezugriff auf
 * die Datenbank nicht ausreicht, um gueltige Codes zu erzeugen.
 */

const ISSUER = "Edelweisspiraten Intern";
const PERIOD = 30;
const DIGITS = 6;
/** Toleranz von einem Zeitfenster in beide Richtungen. */
const WINDOW = 1;

// ---------------------------------------------------------------------------
// Verschluesselung des Secrets
// ---------------------------------------------------------------------------

function encryptionKey(): Buffer {
    const raw = env.MFA_ENC_KEY;
    if (!raw) {
        throw new Error(
            "MFA_ENC_KEY ist nicht konfiguriert. Erzeuge einen Schluessel mit: openssl rand -base64 32"
        );
    }
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) {
        throw new Error("MFA_ENC_KEY muss 32 Bytes (base64-kodiert) lang sein.");
    }
    return key;
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
    if (parts.length !== 3) throw new Error("Ungültiges MFA-Secret");

    const [iv, data, tag] = parts.map((p) => Buffer.from(p, "base64url"));
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

// ---------------------------------------------------------------------------
// Einrichtung und Pruefung
// ---------------------------------------------------------------------------

export interface TotpEnrolment {
    /** Verschluesselt, so wie es gespeichert wird. */
    encryptedSecret: string;
    /** Zur manuellen Eingabe in der App. */
    secretBase32: string;
    /** otpauth://-URI. */
    uri: string;
    /** QR-Code als data:-URI. */
    qrDataUrl: string;
}

export async function createEnrolment(accountLabel: string): Promise<TotpEnrolment> {
    const secret = new OTPAuth.Secret({ size: 20 });
    const totp = buildTotp(secret.base32, accountLabel);
    const uri = totp.toString();

    return {
        encryptedSecret: encryptSecret(secret.base32),
        secretBase32: secret.base32,
        uri,
        qrDataUrl: await QRCode.toDataURL(uri, { margin: 1, width: 240 })
    };
}

function buildTotp(secretBase32: string, accountLabel: string): OTPAuth.TOTP {
    return new OTPAuth.TOTP({
        issuer: ISSUER,
        label: accountLabel,
        algorithm: "SHA1",
        digits: DIGITS,
        period: PERIOD,
        secret: OTPAuth.Secret.fromBase32(secretBase32)
    });
}

/**
 * Prueft einen Code. Gibt bei Erfolg den verwendeten Zeitschritt zurueck,
 * damit der Aufrufer ihn speichern und eine Wiederverwendung desselben Codes
 * innerhalb seiner Gueltigkeit verhindern kann.
 */
export function verifyToken(
    encryptedSecret: string,
    token: string,
    accountLabel: string
): { valid: boolean; counter?: number } {
    const cleaned = token.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(cleaned)) return { valid: false };

    let secretBase32: string;
    try {
        secretBase32 = decryptSecret(encryptedSecret);
    } catch {
        return { valid: false };
    }

    const delta = buildTotp(secretBase32, accountLabel).validate({
        token: cleaned,
        window: WINDOW
    });

    if (delta === null) return { valid: false };

    const counter = Math.floor(Date.now() / 1000 / PERIOD) + delta;
    return { valid: true, counter };
}

// ---------------------------------------------------------------------------
// Wiederherstellungscodes
// ---------------------------------------------------------------------------

const RECOVERY_CODE_COUNT = 10;

/** Erzeugt Codes im Format xxxxx-xxxxx. Nur der Hash wird gespeichert. */
export function generateRecoveryCodes(): { plain: string[]; hashed: string[] } {
    const plain: string[] = [];
    for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
        const raw = crypto.randomBytes(5).toString("hex");
        plain.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
    }
    return { plain, hashed: plain.map(hashRecoveryCode) };
}

export function hashRecoveryCode(code: string): string {
    return crypto
        .createHash("sha256")
        .update(code.replace(/[\s-]/g, "").toLowerCase())
        .digest("hex");
}

/**
 * Prueft einen Wiederherstellungscode. Bei Erfolg wird die verbleibende
 * Liste ohne den verbrauchten Code zurueckgegeben -- jeder Code gilt genau
 * einmal.
 */
export function consumeRecoveryCode(
    hashedCodes: string[],
    code: string
): { valid: boolean; remaining: string[] } {
    const candidate = Buffer.from(hashRecoveryCode(code));
    const index = hashedCodes.findIndex((stored) => {
        const buffer = Buffer.from(stored ?? "");
        // timingSafeEqual wirft bei unterschiedlicher Laenge -- ein
        // beschaedigter Eintrag darf die Pruefung nicht abbrechen lassen.
        if (buffer.length !== candidate.length) return false;
        return crypto.timingSafeEqual(buffer, candidate);
    });

    if (index === -1) return { valid: false, remaining: hashedCodes };

    const remaining = hashedCodes.filter((_, i) => i !== index);
    return { valid: true, remaining };
}
