import { hash, verify } from "@node-rs/argon2";
import crypto from "node:crypto";

/**
 * Passwort-Hashing mit Argon2id.
 *
 * Bisher gab es im gesamten Projekt kein Passwortfeld und kein Hashing --
 * Passwoerter lagen ausschliesslich beim externen Anbieter, und createUser
 * hat das erzeugte Passwort im Klartext an den Aufrufer zurueckgegeben.
 *
 * Die Implementierung ist bewusst hinter dieser schmalen Schnittstelle
 * gekapselt, damit der Algorithmus austauschbar bleibt.
 */

// OWASP-Empfehlung fuer Argon2id.
const OPTIONS = {
    // 2 = Argon2id. Der Aufzaehlungstyp der Bibliothek ist ein ambient const
    // enum und laesst sich mit verbatimModuleSyntax nicht importieren.
    algorithm: 2,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1
} as const;

export async function hashPassword(password: string): Promise<string> {
    return hash(password, OPTIONS);
}

export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
    if (!storedHash) return false;
    try {
        return await verify(storedHash, password);
    } catch {
        // Beschaedigter oder fremdformatiger Hash gilt als nicht passend.
        return false;
    }
}

/**
 * Fuehrt eine Vergleichsberechnung gegen einen festen Hash aus, wenn kein
 * Benutzer gefunden wurde. Ohne das waere an der Antwortzeit ablesbar, ob
 * eine E-Mail-Adresse im System existiert.
 */
let dummyHash: Promise<string> | null = null;

export async function verifyDummy(password: string): Promise<void> {
    // Der Vergleichshash wird einmalig echt erzeugt; ein fest einkodierter
    // Wert wuerde beim Verifizieren nur eine Exception werfen und damit
    // gerade nicht die gewuenschte Laufzeit erzeugen.
    dummyHash ??= hash(crypto.randomBytes(32).toString("hex"), OPTIONS);
    try {
        await verify(await dummyHash, password);
    } catch {
        // Ergebnis ist bedeutungslos, es geht nur um die Laufzeit.
    }
}

/**
 * Passwortrichtlinie nach NIST: Laenge zaehlt, erzwungene Sonderzeichen
 * nicht. Geprueft wird zusaetzlich gegen offensichtlich schwache Werte und
 * gegen den lokalen Teil der eigenen E-Mail-Adresse.
 */
export const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 256;

const WEAK_PASSWORDS = new Set([
    "passwort", "password", "passwort123", "password123", "qwertzuiop", "qwertyuiop",
    "123456789012", "1234567890", "edelweiss", "edelweisspiraten", "pfadfinder",
    "willkommen", "geheim123", "administrator", "passwort1234", "letmein12345"
]);

export interface PasswordCheck {
    ok: boolean;
    error?: string;
}

export function checkPasswordPolicy(password: string, email?: string): PasswordCheck {
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
        return {
            ok: false,
            error: `Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`
        };
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
        return { ok: false, error: "Das Passwort ist zu lang (maximal 256 Zeichen)." };
    }

    const normalized = password.toLowerCase();
    if (WEAK_PASSWORDS.has(normalized)) {
        return { ok: false, error: "Dieses Passwort ist zu leicht zu erraten." };
    }

    const localPart = email?.split("@")[0]?.toLowerCase();
    if (localPart && localPart.length >= 4 && normalized.includes(localPart)) {
        return { ok: false, error: "Das Passwort darf nicht die eigene E-Mail-Adresse enthalten." };
    }

    // Reine Wiederholungen wie "aaaaaaaaaaaa" oder "abcabcabcabc".
    if (/^(.{1,4})\1+$/.test(password)) {
        return { ok: false, error: "Das Passwort besteht nur aus einer Wiederholung." };
    }

    return { ok: true };
}

/** Erzeugt ein zufaelliges Passwort, etwa fuer Einladungen. */
export function generatePassword(length = 20): string {
    const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = crypto.randomBytes(length);
    let result = "";
    for (let i = 0; i < length; i++) {
        result += alphabet[bytes[i] % alphabet.length];
    }
    return result;
}
