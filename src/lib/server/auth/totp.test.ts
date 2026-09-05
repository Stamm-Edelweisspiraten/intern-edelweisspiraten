import { describe, expect, it } from "vitest";
import * as OTPAuth from "otpauth";
import {
    consumeRecoveryCode,
    createEnrolment,
    decryptSecret,
    encryptSecret,
    generateRecoveryCodes,
    hashRecoveryCode,
    verifyToken
} from "./totp";

const LABEL = "test@example.org";

/** Erzeugt den gerade gültigen Code zu einem Base32-Secret. */
function currentToken(secretBase32: string, offsetPeriods = 0): string {
    const totp = new OTPAuth.TOTP({
        issuer: "Edelweisspiraten Intern",
        label: LABEL,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secretBase32)
    });
    return totp.generate({ timestamp: Date.now() + offsetPeriods * 30_000 });
}

describe("Secret-Verschlüsselung", () => {
    it("verschlüsselt und entschlüsselt verlustfrei", () => {
        const secret = "JBSWY3DPEHPK3PXP";
        expect(decryptSecret(encryptSecret(secret))).toBe(secret);
    });

    it("erzeugt bei jedem Aufruf einen anderen Chiffretext", () => {
        const secret = "JBSWY3DPEHPK3PXP";
        expect(encryptSecret(secret)).not.toBe(encryptSecret(secret));
    });

    it("legt das Secret nicht im Klartext ab", () => {
        const secret = "JBSWY3DPEHPK3PXP";
        expect(encryptSecret(secret)).not.toContain(secret);
    });

    it("erkennt Manipulation am Chiffretext", () => {
        const encrypted = encryptSecret("JBSWY3DPEHPK3PXP");
        const [iv, data, tag] = encrypted.split(".");
        const tampered = `${iv}.${data.slice(0, -2)}AA.${tag}`;
        expect(() => decryptSecret(tampered)).toThrow();
    });

    it("weist unvollständige Werte ab", () => {
        expect(() => decryptSecret("nur.zwei")).toThrow();
    });
});

describe("createEnrolment", () => {
    it("liefert Secret, URI und QR-Code", async () => {
        const enrolment = await createEnrolment(LABEL);

        expect(enrolment.secretBase32).toMatch(/^[A-Z2-7]+$/);
        expect(enrolment.uri).toContain("otpauth://totp/");
        expect(enrolment.uri).toContain("Edelweisspiraten");
        expect(enrolment.qrDataUrl.startsWith("data:image/png;base64,")).toBe(true);
        expect(decryptSecret(enrolment.encryptedSecret)).toBe(enrolment.secretBase32);
    });
});

describe("verifyToken", () => {
    it("akzeptiert den aktuell gültigen Code", async () => {
        const { encryptedSecret, secretBase32 } = await createEnrolment(LABEL);
        const result = verifyToken(encryptedSecret, currentToken(secretBase32), LABEL);

        expect(result.valid).toBe(true);
        expect(typeof result.counter).toBe("number");
    });

    it("akzeptiert das direkt benachbarte Zeitfenster", async () => {
        const { encryptedSecret, secretBase32 } = await createEnrolment(LABEL);

        expect(verifyToken(encryptedSecret, currentToken(secretBase32, -1), LABEL).valid).toBe(true);
        expect(verifyToken(encryptedSecret, currentToken(secretBase32, 1), LABEL).valid).toBe(true);
    });

    it("lehnt weiter entfernte Zeitfenster ab", async () => {
        const { encryptedSecret, secretBase32 } = await createEnrolment(LABEL);
        expect(verifyToken(encryptedSecret, currentToken(secretBase32, 5), LABEL).valid).toBe(false);
    });

    it("lehnt einen falschen Code ab", async () => {
        const { encryptedSecret, secretBase32 } = await createEnrolment(LABEL);
        const wrong = currentToken(secretBase32) === "000000" ? "111111" : "000000";
        expect(verifyToken(encryptedSecret, wrong, LABEL).valid).toBe(false);
    });

    it("lehnt falsch geformte Eingaben ab", async () => {
        const { encryptedSecret } = await createEnrolment(LABEL);

        for (const input of ["", "12345", "1234567", "abcdef", "12 34 56 78"]) {
            expect(verifyToken(encryptedSecret, input, LABEL).valid).toBe(false);
        }
    });

    it("toleriert Leerzeichen in der Eingabe", async () => {
        const { encryptedSecret, secretBase32 } = await createEnrolment(LABEL);
        const token = currentToken(secretBase32);
        const spaced = `${token.slice(0, 3)} ${token.slice(3)}`;
        expect(verifyToken(encryptedSecret, spaced, LABEL).valid).toBe(true);
    });

    it("wirft nicht bei beschädigtem Secret", () => {
        expect(verifyToken("kaputt", "123456", LABEL).valid).toBe(false);
    });
});

describe("Wiederherstellungscodes", () => {
    it("erzeugt zehn Codes im lesbaren Format", () => {
        const { plain, hashed } = generateRecoveryCodes();

        expect(plain).toHaveLength(10);
        expect(hashed).toHaveLength(10);
        for (const code of plain) {
            expect(code).toMatch(/^[0-9a-f]{5}-[0-9a-f]{5}$/);
        }
    });

    it("speichert die Codes nur gehasht", () => {
        const { plain, hashed } = generateRecoveryCodes();
        expect(hashed).not.toContain(plain[0]);
        expect(hashed[0]).toBe(hashRecoveryCode(plain[0]));
    });

    it("erzeugt ausschließlich verschiedene Codes", () => {
        const { plain } = generateRecoveryCodes();
        expect(new Set(plain).size).toBe(10);
    });

    it("verbraucht einen Code genau einmal", () => {
        const { plain, hashed } = generateRecoveryCodes();

        const first = consumeRecoveryCode(hashed, plain[0]);
        expect(first.valid).toBe(true);
        expect(first.remaining).toHaveLength(9);

        // Derselbe Code darf kein zweites Mal funktionieren.
        expect(consumeRecoveryCode(first.remaining, plain[0]).valid).toBe(false);
    });

    it("ignoriert Bindestriche und Groß-/Kleinschreibung", () => {
        const { plain, hashed } = generateRecoveryCodes();
        const messy = plain[3].replace("-", "").toUpperCase();
        expect(consumeRecoveryCode(hashed, messy).valid).toBe(true);
    });

    it("lehnt unbekannte Codes ab", () => {
        const { hashed } = generateRecoveryCodes();
        const result = consumeRecoveryCode(hashed, "aaaaa-bbbbb");
        expect(result.valid).toBe(false);
        expect(result.remaining).toHaveLength(10);
    });

    it("wirft nicht bei beschädigten Einträgen unterschiedlicher Länge", () => {
        // timingSafeEqual wirft bei ungleicher Länge -- das darf die Prüfung
        // nicht abbrechen lassen.
        const { plain, hashed } = generateRecoveryCodes();
        const withGarbage = ["zu-kurz", ...hashed];
        expect(consumeRecoveryCode(withGarbage, plain[0]).valid).toBe(true);
    });
});
