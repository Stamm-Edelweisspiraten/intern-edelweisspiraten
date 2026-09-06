import { env } from "$env/dynamic/private";
import { decryptSecret, encryptSecret, hasEncryptionKey } from "$lib/server/crypto";
import {
    getOrganizationSettings,
    readSettingRaw,
    writeSettingRaw
} from "$lib/server/settingsService";

/**
 * Zugangsdaten des Postausgangs (SMTP).
 *
 * Drei Quellen, streng in dieser Reihenfolge:
 *
 *   1. Umgebungsvariablen (`SMTP_*`) -- sie gewinnen VOLLSTAENDIG. Ist
 *      `SMTP_HOST` zusammen mit `SMTP_FROM` gesetzt, stammt die gesamte
 *      Einstellung aus der Umgebung; der Adminbereich zeigt die Werte dann
 *      nur noch an und sperrt das Formular. Es wird NICHT feldweise
 *      gemischt: eine halb aus der Umgebung und halb aus der Datenbank
 *      zusammengesetzte Einstellung waere im Fehlerfall nicht mehr
 *      nachvollziehbar.
 *   2. Der Adminbereich (`settings`, Schluessel "smtp").
 *   3. Vorgaben: Port 587, Verschluesselung "starttls", Absendername aus den
 *      Organisationseinstellungen.
 *
 * Begruendung fuer den Vorrang der Umgebung -- dieselbe wie beim
 * Objektspeicher: ein Betrieb ganz ohne Geheimnisse in der Datenbank muss
 * moeglich bleiben, etwa wenn der Postausgang vom Hoster gestellt und ueber
 * die Betriebsumgebung durchgereicht wird.
 *
 * Das Passwort steht in der Datenbank ausschliesslich verschluesselt (siehe
 * $lib/server/crypto). Es verlaesst den Server nie: die Adminseite bekommt
 * nur die Angabe, ob eines hinterlegt ist.
 *
 * Gelesene Umgebungsvariablen:
 *
 *   SMTP_HOST        Rechnername des Postausgangs (Pflicht)
 *   SMTP_FROM        Absenderadresse (Pflicht)
 *   SMTP_PORT        Port, Vorgabe 587
 *   SMTP_USER        Anmeldename; leer heisst: ohne Anmeldung senden
 *   SMTP_PASS        Passwort zum Anmeldenamen
 *   SMTP_ENCRYPTION  "none" | "starttls" | "tls"
 *   SMTP_FROM_NAME   Anzeigename des Absenders
 *   SMTP_REPLY_TO    Antwortadresse
 *
 * `SMTP_ENCRYPTION`, `SMTP_FROM_NAME` und `SMTP_REPLY_TO` sind neu. Fehlt
 * `SMTP_ENCRYPTION`, wird die Verschluesselung aus dem Port abgeleitet
 * (465 heisst "tls", alles andere "starttls") -- damit laufen bestehende
 * Installationen unveraendert weiter.
 */

const SMTP_KEY = "smtp";

export type SmtpEncryption = "none" | "starttls" | "tls";

const ENCRYPTIONS: readonly string[] = ["none", "starttls", "tls"];

export interface SmtpConfig {
    /** Rechnername des Postausgangs, z. B. smtp.example.org. */
    host: string;
    port: number;
    /** Anmeldename; leer heisst: ohne Anmeldung senden. */
    user: string;
    password: string;
    /**
     * "tls"      -- die Verbindung ist von Anfang an verschluesselt (Port 465)
     * "starttls" -- Klartext, der sofort auf TLS hochgestuft wird (Port 587)
     * "none"     -- unverschluesselt; nur fuer einen Relay im eigenen Netz
     */
    encryption: SmtpEncryption;
    fromEmail: string;
    /** Anzeigename des Absenders; leer heisst: nur die Adresse. */
    fromName: string;
    /** Antwortadresse, wenn sie von der Absenderadresse abweicht. */
    replyTo: string;
}

/** Was die Oberflaeche sehen darf -- ohne das Passwort. */
export interface SmtpConfigView extends Omit<SmtpConfig, "password"> {
    /** true, wenn ein Passwort hinterlegt ist. */
    hasPassword: boolean;
    /** true, wenn die Werte aus der Umgebung stammen und nicht aenderbar sind. */
    fromEnv: boolean;
    /** true, wenn Rechnername und Absenderadresse vollstaendig sind. */
    configured: boolean;
}

const DEFAULT_PORT = 587;

const EMPTY: SmtpConfig = {
    host: "",
    port: DEFAULT_PORT,
    user: "",
    password: "",
    encryption: "starttls",
    fromEmail: "",
    fromName: "",
    replyTo: ""
};

/**
 * true, wenn die Umgebung den Postausgang vorgibt.
 *
 * Es zaehlen nur die beiden Pflichtangaben. Ein allein gesetztes
 * `SMTP_FROM_NAME` darf den Adminbereich nicht sperren.
 */
export function smtpFromEnv(): boolean {
    return Boolean(env.SMTP_HOST && env.SMTP_FROM);
}

function toPort(value: unknown, fallback = DEFAULT_PORT): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 && parsed <= 65535 ? Math.trunc(parsed) : fallback;
}

/**
 * Verschluesselung aus einem Rohwert, ersatzweise aus dem Port.
 *
 * Port 465 ist der historische Port fuer eine von Beginn an verschluesselte
 * Verbindung; alles andere spricht Klartext und stuft mit STARTTLS hoch.
 * Diese Ableitung haelt bestehende Installationen am Laufen, die nur
 * SMTP_HOST/SMTP_PORT kennen.
 */
export function resolveEncryption(raw: unknown, port: number): SmtpEncryption {
    if (typeof raw === "string" && ENCRYPTIONS.includes(raw)) return raw as SmtpEncryption;
    return port === 465 ? "tls" : "starttls";
}

function text(value: unknown, fallback = ""): string {
    return typeof value === "string" ? value : fallback;
}

async function organizationName(): Promise<string> {
    try {
        const organization = await getOrganizationSettings();
        return organization.name ?? "";
    } catch (err) {
        // Der Absendername ist Beiwerk. Steht die Datenbank nicht bereit,
        // wird ohne Namen gesendet statt gar nicht.
        console.error("Organisationsname fuer den Absender nicht lesbar:", err);
        return "";
    }
}

async function fromEnvironment(): Promise<SmtpConfig> {
    const port = toPort(env.SMTP_PORT);

    return {
        host: env.SMTP_HOST ?? "",
        port,
        user: env.SMTP_USER ?? "",
        password: env.SMTP_PASS ?? "",
        encryption: resolveEncryption(env.SMTP_ENCRYPTION, port),
        fromEmail: env.SMTP_FROM ?? "",
        fromName: env.SMTP_FROM_NAME || (await organizationName()),
        replyTo: env.SMTP_REPLY_TO ?? ""
    };
}

/**
 * Die vollstaendige Einstellung samt entschluesseltem Passwort. Nur fuer den
 * Server -- niemals an eine Seite weitergeben.
 */
export async function getSmtpConfig(): Promise<SmtpConfig> {
    if (smtpFromEnv()) return fromEnvironment();

    const stored = await readSettingRaw(SMTP_KEY);
    if (!stored) return { ...EMPTY, fromName: await organizationName() };

    let password = "";
    const encrypted = text(stored.password);

    if (encrypted) {
        try {
            password = decryptSecret(encrypted);
        } catch (err) {
            // Ein falscher oder gewechselter Schluessel darf nicht die ganze
            // Anwendung anhalten: der Versand scheitert dann mit einer
            // verstaendlichen Meldung, statt bei jedem Zugriff zu werfen.
            console.error("SMTP-Passwort nicht lesbar:", err);
        }
    }

    const port = toPort(stored.port);

    return {
        host: text(stored.host),
        port,
        user: text(stored.user),
        password,
        encryption: resolveEncryption(stored.encryption, port),
        fromEmail: text(stored.fromEmail),
        fromName: text(stored.fromName) || (await organizationName()),
        replyTo: text(stored.replyTo)
    };
}

/** true, wenn genug hinterlegt ist, um wirklich zu senden. */
export function isConfigured(config: SmtpConfig): boolean {
    return Boolean(config.host && config.fromEmail);
}

/** Fassung fuer die Oberflaeche: ohne Passwort. */
export async function getSmtpConfigView(): Promise<SmtpConfigView> {
    const config = await getSmtpConfig();
    const { password, ...rest } = config;

    return {
        ...rest,
        hasPassword: Boolean(password),
        fromEnv: smtpFromEnv(),
        configured: isConfigured(config)
    };
}

export interface SmtpConfigInput extends Omit<SmtpConfig, "password"> {
    /**
     * Leer lassen heisst: das hinterlegte Passwort behalten. So muss es beim
     * Aendern des Ports nicht erneut eingetippt werden -- und es steht nicht
     * im Formular, wo es der Browser speichern wuerde.
     */
    password?: string;
}

export async function saveSmtpConfig(
    input: SmtpConfigInput,
    updatedBy: string
): Promise<{ ok: boolean; error?: string }> {
    if (smtpFromEnv()) {
        return {
            ok: false,
            error: "Der Postausgang wird über die Umgebungsvariablen SMTP_* vorgegeben und kann hier nicht geändert werden."
        };
    }

    const password = (input.password ?? "").trim();

    if (password && !hasEncryptionKey()) {
        return {
            ok: false,
            error: "Ohne APP_ENC_KEY kann das Passwort nicht verschlüsselt abgelegt werden."
        };
    }

    const host = input.host.trim();
    const fromEmail = input.fromEmail.trim();

    if (!host) {
        return { ok: false, error: "Ohne Servernamen lässt sich keine Verbindung aufbauen." };
    }

    if (!fromEmail) {
        return { ok: false, error: "Ohne Absenderadresse nimmt kein Server die Nachricht an." };
    }

    const previous = await readSettingRaw(SMTP_KEY);
    const encrypted = password ? encryptSecret(password) : text(previous?.password);
    const port = toPort(input.port);

    await writeSettingRaw(
        SMTP_KEY,
        {
            host,
            port,
            user: input.user.trim(),
            password: encrypted,
            encryption: resolveEncryption(input.encryption, port),
            fromEmail,
            fromName: input.fromName.trim(),
            replyTo: input.replyTo.trim()
        },
        updatedBy
    );

    return { ok: true };
}

/** Entfernt den hinterlegten Zugang wieder; der Versand ruht dann. */
export async function clearSmtpConfig(updatedBy: string): Promise<void> {
    await writeSettingRaw(SMTP_KEY, {}, updatedBy);
}
