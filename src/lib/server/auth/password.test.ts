import { describe, expect, it } from "vitest";
import {
    checkPasswordPolicy,
    generatePassword,
    hashPassword,
    MIN_PASSWORD_LENGTH,
    verifyPassword
} from "./password";

describe("hashPassword / verifyPassword", () => {
    it("bestätigt das richtige Passwort", async () => {
        const hash = await hashPassword("ein-sehr-gutes-Passwort");
        expect(await verifyPassword(hash, "ein-sehr-gutes-Passwort")).toBe(true);
    });

    it("lehnt ein falsches Passwort ab", async () => {
        const hash = await hashPassword("ein-sehr-gutes-Passwort");
        expect(await verifyPassword(hash, "ein-anderes-Passwort")).toBe(false);
    });

    it("erzeugt für dasselbe Passwort unterschiedliche Hashes (Salt)", async () => {
        const a = await hashPassword("gleiches-Passwort-123");
        const b = await hashPassword("gleiches-Passwort-123");
        expect(a).not.toBe(b);
        expect(await verifyPassword(a, "gleiches-Passwort-123")).toBe(true);
        expect(await verifyPassword(b, "gleiches-Passwort-123")).toBe(true);
    });

    it("verwendet Argon2id", async () => {
        const hash = await hashPassword("beliebiges-Passwort-42");
        expect(hash.startsWith("$argon2id$")).toBe(true);
    });

    it("wirft nicht bei leerem oder beschädigtem Hash", async () => {
        expect(await verifyPassword("", "irgendwas")).toBe(false);
        expect(await verifyPassword("kein-gueltiger-hash", "irgendwas")).toBe(false);
    });

    it("verarbeitet auch sehr lange Passwörter vollständig", async () => {
        // bcrypt schneidet nach 72 Byte ab, Argon2 nicht: zwei Passwörter mit
        // identischem 72-Byte-Präfix müssen unterscheidbar bleiben.
        const base = "x".repeat(72);
        const hash = await hashPassword(base + "AAA");
        expect(await verifyPassword(hash, base + "BBB")).toBe(false);
        expect(await verifyPassword(hash, base + "AAA")).toBe(true);
    });
});

describe("checkPasswordPolicy", () => {
    it("verlangt die Mindestlänge", () => {
        expect(checkPasswordPolicy("kurz").ok).toBe(false);
        expect(checkPasswordPolicy("a".repeat(MIN_PASSWORD_LENGTH - 1)).ok).toBe(false);
    });

    it("akzeptiert eine ausreichend lange Passphrase ohne Sonderzeichenzwang", () => {
        expect(checkPasswordPolicy("blauer elefant tanzt leise").ok).toBe(true);
    });

    it("lehnt bekannte schwache Passwörter ab", () => {
        expect(checkPasswordPolicy("passwort123").ok).toBe(false);
        expect(checkPasswordPolicy("edelweisspiraten").ok).toBe(false);
    });

    it("lehnt reine Wiederholungen ab", () => {
        expect(checkPasswordPolicy("abcabcabcabcabc").ok).toBe(false);
        expect(checkPasswordPolicy("aaaaaaaaaaaaaaaa").ok).toBe(false);
    });

    it("lehnt Passwörter mit dem eigenen E-Mail-Namen ab", () => {
        expect(checkPasswordPolicy("annamueller-geheim", "annamueller@example.org").ok).toBe(false);
        expect(checkPasswordPolicy("voellig anderes wort", "annamueller@example.org").ok).toBe(true);
    });

    it("lehnt zu lange Eingaben ab", () => {
        expect(checkPasswordPolicy("a".repeat(300)).ok).toBe(false);
    });

    it("liefert immer eine deutsche Fehlermeldung", () => {
        const result = checkPasswordPolicy("kurz");
        expect(result.error).toBeTruthy();
        expect(result.error).toMatch(/Passwort/);
    });
});

describe("generatePassword", () => {
    it("hat die gewünschte Länge und erfüllt die Richtlinie", () => {
        const password = generatePassword(20);
        expect(password).toHaveLength(20);
        expect(checkPasswordPolicy(password).ok).toBe(true);
    });

    it("erzeugt bei jedem Aufruf einen anderen Wert", () => {
        const values = new Set(Array.from({ length: 50 }, () => generatePassword()));
        expect(values.size).toBe(50);
    });

    it("vermeidet leicht verwechselbare Zeichen", () => {
        const joined = Array.from({ length: 40 }, () => generatePassword(30)).join("");
        expect(joined).not.toMatch(/[lIO01]/);
    });
});
