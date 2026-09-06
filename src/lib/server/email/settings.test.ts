import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "$env/dynamic/private";

/**
 * Tests der SMTP-Einstellung -- ohne Datenbank.
 *
 * `$env/dynamic/private` ist in vitest.config.ts auf src/lib/test/envMock.ts
 * gemappt. Dieses Modul reicht process.env durch, exportiert aber ein
 * gewoehnliches Objekt: die Tests setzen ihre Werte direkt darauf, statt
 * process.env zu veraendern (das der Mock nur einmal beim Laden liest).
 *
 * Der Zugriff auf `settings` wird ersetzt, damit kein Postgres noetig ist.
 * Die Verschluesselung laeuft echt: envMock bringt einen festen MFA_ENC_KEY
 * mit, sonst waere die Pruefung "leeres Feld behaelt das Passwort" wertlos.
 */

const state = vi.hoisted(() => ({ stored: null as Record<string, unknown> | null }));

vi.mock("$lib/server/settingsService", () => ({
    readSettingRaw: vi.fn(async () => state.stored),
    writeSettingRaw: vi.fn(async (_key: string, value: Record<string, unknown>) => {
        state.stored = value;
    }),
    getOrganizationSettings: vi.fn(async () => ({ name: "Stamm Musterstadt" }))
}));

const {
    getSmtpConfig,
    getSmtpConfigView,
    isConfigured,
    resolveEncryption,
    saveSmtpConfig,
    smtpFromEnv
} = await import("./settings");

const SMTP_KEYS = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FROM",
    "SMTP_ENCRYPTION",
    "SMTP_FROM_NAME",
    "SMTP_REPLY_TO"
];

beforeEach(() => {
    state.stored = null;
    for (const key of SMTP_KEYS) delete env[key];
});

describe("Vorrang der Umgebung", () => {
    it("greift erst, wenn beide Pflichtangaben gesetzt sind", () => {
        expect(smtpFromEnv()).toBe(false);

        env.SMTP_HOST = "smtp.example.org";
        expect(smtpFromEnv()).toBe(false);

        env.SMTP_FROM = "portal@example.org";
        expect(smtpFromEnv()).toBe(true);
    });

    it("laesst einen einzelnen optionalen Wert die Seite nicht sperren", () => {
        env.SMTP_FROM_NAME = "Stamm Musterstadt";
        env.SMTP_REPLY_TO = "vorstand@example.org";
        expect(smtpFromEnv()).toBe(false);
    });

    it("uebergeht die Einstellung aus dem Adminbereich vollstaendig", async () => {
        state.stored = {
            host: "datenbank.example.org",
            port: 2525,
            user: "aus-der-datenbank",
            fromEmail: "datenbank@example.org"
        };

        env.SMTP_HOST = "umgebung.example.org";
        env.SMTP_FROM = "umgebung@example.org";
        env.SMTP_USER = "aus-der-umgebung";

        const config = await getSmtpConfig();

        expect(config.host).toBe("umgebung.example.org");
        expect(config.fromEmail).toBe("umgebung@example.org");
        expect(config.user).toBe("aus-der-umgebung");
        // Nichts wird feldweise gemischt.
        expect(config.port).toBe(587);
    });

    it("verweigert das Speichern mit deutscher Begruendung", async () => {
        env.SMTP_HOST = "umgebung.example.org";
        env.SMTP_FROM = "umgebung@example.org";

        const result = await saveSmtpConfig(
            {
                host: "neu.example.org",
                port: 587,
                user: "",
                password: "geheim",
                encryption: "starttls",
                fromEmail: "neu@example.org",
                fromName: "",
                replyTo: ""
            },
            "test@example.org"
        );

        expect(result.ok).toBe(false);
        expect(result.error).toContain("Umgebungsvariablen");
        // Nichts geschrieben.
        expect(state.stored).toBeNull();
    });
});

describe("Verschluesselung", () => {
    it("leitet aus dem Port ab, wenn nichts hinterlegt ist", () => {
        expect(resolveEncryption(undefined, 465)).toBe("tls");
        expect(resolveEncryption(undefined, 587)).toBe("starttls");
        expect(resolveEncryption(undefined, 25)).toBe("starttls");
        expect(resolveEncryption("unsinn", 465)).toBe("tls");
    });

    it("nimmt einen gueltigen Wert unveraendert", () => {
        expect(resolveEncryption("none", 465)).toBe("none");
        expect(resolveEncryption("starttls", 465)).toBe("starttls");
        expect(resolveEncryption("tls", 587)).toBe("tls");
    });

    it("laesst bestehende Installationen ohne SMTP_ENCRYPTION weiterlaufen", async () => {
        env.SMTP_HOST = "smtp.example.org";
        env.SMTP_FROM = "portal@example.org";
        env.SMTP_PORT = "465";

        expect((await getSmtpConfig()).encryption).toBe("tls");

        env.SMTP_PORT = "587";
        expect((await getSmtpConfig()).encryption).toBe("starttls");

        env.SMTP_ENCRYPTION = "none";
        expect((await getSmtpConfig()).encryption).toBe("none");
    });

    it("faellt bei einem unsinnigen Port auf 587 und STARTTLS zurueck", async () => {
        env.SMTP_HOST = "smtp.example.org";
        env.SMTP_FROM = "portal@example.org";
        env.SMTP_PORT = "keine-zahl";

        const config = await getSmtpConfig();
        expect(config.port).toBe(587);
        expect(config.encryption).toBe("starttls");
    });
});

describe("Passwort", () => {
    const base = {
        host: "smtp.example.org",
        port: 587,
        user: "portal",
        encryption: "starttls" as const,
        fromEmail: "portal@example.org",
        fromName: "Stamm Musterstadt",
        replyTo: ""
    };

    it("wird verschluesselt abgelegt und wieder entschluesselt", async () => {
        const result = await saveSmtpConfig({ ...base, password: "geheim" }, "test@example.org");

        expect(result.ok).toBe(true);
        expect(state.stored?.password).not.toBe("geheim");
        expect(String(state.stored?.password)).not.toContain("geheim");
        expect((await getSmtpConfig()).password).toBe("geheim");
    });

    it("bleibt erhalten, wenn das Feld leer bleibt", async () => {
        await saveSmtpConfig({ ...base, password: "geheim" }, "test@example.org");
        const encrypted = state.stored?.password;

        await saveSmtpConfig({ ...base, port: 465, password: "" }, "test@example.org");

        expect(state.stored?.password).toBe(encrypted);
        expect(state.stored?.port).toBe(465);

        const config = await getSmtpConfig();
        expect(config.password).toBe("geheim");
        expect(config.port).toBe(465);
    });

    it("degradiert bei unlesbarem Geheimnis, statt zu werfen", async () => {
        const logged = vi.spyOn(console, "error").mockImplementation(() => {});
        state.stored = { ...base, password: "kein-gueltiger-schluesseltext" };

        const config = await getSmtpConfig();

        expect(config.password).toBe("");
        expect(config.host).toBe("smtp.example.org");
        expect(logged).toHaveBeenCalled();
        logged.mockRestore();
    });
});

describe("getSmtpConfigView", () => {
    it("gibt das Passwort niemals heraus", async () => {
        await saveSmtpConfig(
            {
                host: "smtp.example.org",
                port: 587,
                user: "portal",
                password: "geheim",
                encryption: "starttls",
                fromEmail: "portal@example.org",
                fromName: "",
                replyTo: ""
            },
            "test@example.org"
        );

        const view = await getSmtpConfigView();

        expect(Object.keys(view)).not.toContain("password");
        expect(JSON.stringify(view)).not.toContain("geheim");
        expect(view.hasPassword).toBe(true);
        expect(view.fromEnv).toBe(false);
        expect(view.configured).toBe(true);
    });

    it("meldet hasPassword false, solange keines hinterlegt ist", async () => {
        const view = await getSmtpConfigView();
        expect(view.hasPassword).toBe(false);
        expect(view.configured).toBe(false);
    });

    it("uebernimmt den Organisationsnamen als Absendernamen", async () => {
        const view = await getSmtpConfigView();
        expect(view.fromName).toBe("Stamm Musterstadt");
    });
});

describe("configured", () => {
    const full = {
        host: "smtp.example.org",
        port: 587,
        user: "",
        password: "",
        encryption: "starttls" as const,
        fromEmail: "portal@example.org",
        fromName: "",
        replyTo: ""
    };

    it("verlangt Server und Absenderadresse", () => {
        expect(isConfigured(full)).toBe(true);
        expect(isConfigured({ ...full, host: "" })).toBe(false);
        expect(isConfigured({ ...full, fromEmail: "" })).toBe(false);
    });

    it("verlangt kein Passwort -- ein Relay ohne Anmeldung ist gueltig", () => {
        expect(isConfigured({ ...full, user: "", password: "" })).toBe(true);
    });
});
