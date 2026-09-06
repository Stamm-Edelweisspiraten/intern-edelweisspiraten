import type { Transporter } from "nodemailer";
import { getSmtpConfig, isConfigured, type SmtpConfig } from "$lib/server/email/settings";

/**
 * Versand von E-Mails.
 *
 * Die Zugangsdaten kommen aus $lib/server/email/settings -- entweder aus der
 * Umgebung (`SMTP_*`) oder aus dem Adminbereich. Dieses Modul kennt die
 * Herkunft nicht; es baut nur den Transport und uebersetzt Fehler.
 *
 * Drei Dinge, die vorher fehlten:
 *
 *   1. Der Transport wird zwischengespeichert und haelt seine Verbindungen
 *      offen (`pool`). Der Massenversand unter /intern/email sendet in einer
 *      Schleife seriell -- vorher entstand dabei je Empfaenger eine neue
 *      SMTP-Verbindung samt Anmeldung.
 *   2. Die Verschluesselung wird nicht mehr aus dem Port geraten, sondern
 *      steht in der Einstellung. Ein Server auf Port 587, der von Beginn an
 *      TLS spricht, war vorher nicht erreichbar.
 *   3. Ist nichts eingerichtet, scheitert der Versand sofort mit einer
 *      deutschen Meldung statt mit einem rohen ECONNREFUSED aus dem Treiber.
 *
 * Die Signatur von sendEmail() ist bewusst unveraendert geblieben: sie hat
 * vier Aufrufer (Einladung, Passwort zuruecksetzen an zwei Stellen und den
 * Massenversand).
 */

export interface EmailOptions {
    to: string;
    subject: string;
    html?: string;
    text?: string;
    from?: string;
    replyTo?: string;
    attachments?: {
        filename?: string;
        content: Buffer;
        contentType?: string;
    }[];
}

/**
 * Kein Postausgang eingerichtet.
 *
 * Eigene Klasse, damit Aufrufer den Einrichtungsfehler von einem echten
 * Verbindungsproblem unterscheiden koennen -- das eine behebt ein
 * Administrator im Portal, das andere liegt beim Anbieter.
 */
export class SmtpNotConfiguredError extends Error {
    constructor(
        message = "Es ist kein Postausgang eingerichtet. Ein Administrator hinterlegt ihn unter Verwaltung, E-Mail."
    ) {
        super(message);
        this.name = "SmtpNotConfiguredError";
    }
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

/**
 * Der Transport wird zwischengespeichert, aber an die Einstellung gebunden:
 * aendert sie sich im Adminbereich, entsteht beim naechsten Versand ein
 * neuer. Vgl. resetStorageClient() beim Objektspeicher.
 */
let cached: { signature: string; transporter: Transporter } | null = null;

function signatureOf(config: SmtpConfig): string {
    return [
        config.host,
        String(config.port),
        config.encryption,
        config.user,
        // Nicht das Passwort selbst, nur seine Laenge -- es soll nirgends
        // versehentlich in einen Log geraten.
        String(config.password.length)
    ].join("|");
}

async function transportFor(config: SmtpConfig): Promise<Transporter> {
    const signature = signatureOf(config);
    if (cached?.signature === signature) return cached.transporter;

    cached?.transporter.close();
    cached = null;

    const { createTransport } = await import("nodemailer");

    const transporter = createTransport({
        host: config.host,
        port: config.port,
        // "tls" heisst: die Verbindung ist von Beginn an verschluesselt.
        secure: config.encryption === "tls",
        // "starttls" heisst: Klartext, der sofort hochgestuft wird -- und der
        // abbricht, wenn der Server das nicht anbietet.
        requireTLS: config.encryption === "starttls",
        // Ein leerer Benutzername ist keine Anmeldung. Vorher wurde er
        // durchgereicht, was manche Server mit EAUTH quittieren.
        auth: config.user ? { user: config.user, pass: config.password } : undefined,
        pool: true,
        maxConnections: 3,
        maxMessages: 50,
        // Ohne Fristen haengt der Verbindungstest im Adminbereich bis zum
        // Zeitablauf des Browsers.
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000
    });

    cached = { signature, transporter };
    return transporter;
}

/** Verwirft den zwischengespeicherten Transport -- nach einer Aenderung. */
export function resetMailTransport(): void {
    cached?.transporter.close();
    cached = null;
}

async function requireConfig(): Promise<SmtpConfig> {
    const config = await getSmtpConfig();
    if (!isConfigured(config)) throw new SmtpNotConfiguredError();
    return config;
}

/** Absender als `"Name" <adresse>`, sofern ein Name hinterlegt ist. */
function formatSender(config: SmtpConfig): string {
    // Anfuehrungszeichen im Namen wuerden den Kopfzeilenwert zerlegen.
    const name = config.fromName.replace(/["\\]/g, "").trim();
    return name ? `"${name}" <${config.fromEmail}>` : config.fromEmail;
}

// ---------------------------------------------------------------------------
// Versand
// ---------------------------------------------------------------------------

export async function sendEmail({
    to,
    subject,
    html,
    text,
    replyTo,
    attachments,
    from
}: EmailOptions) {
    const config = await requireConfig();
    const transporter = await transportFor(config);

    return transporter.sendMail({
        // Ein Aufrufer, der einen Absender mitgibt, hat einen Grund dafuer --
        // der Massenversand setzt die Adresse des Verfassers ein.
        from: from || formatSender(config),
        to,
        subject,
        html,
        text,
        replyTo: replyTo || config.replyTo || undefined,
        attachments
    });
}

/** Prueft Erreichbarkeit und Anmeldung, ohne etwas zu senden. */
export async function verifySmtp(): Promise<{ ok: boolean; error?: string }> {
    try {
        const config = await requireConfig();
        const transporter = await transportFor(config);
        await transporter.verify();
        return { ok: true };
    } catch (err) {
        return { ok: false, error: describeSmtpError(err) };
    }
}

/** Schickt eine kurze Nachricht an eine Adresse -- zum Nachweis im Betrieb. */
export async function sendTestMail(to: string): Promise<{ ok: boolean; error?: string }> {
    const address = to.trim();
    if (!address) return { ok: false, error: "Ohne Empfängeradresse gibt es nichts zu senden." };

    try {
        await sendEmail({
            to: address,
            subject: "Testnachricht aus dem internen Portal",
            text:
                "Diese Nachricht bestätigt, dass der Postausgang des internen Portals funktioniert.\n\n" +
                "Sie wurde über die Seite Verwaltung, E-Mail ausgelöst. Eine Antwort ist nicht nötig.",
            html:
                "<p>Diese Nachricht bestätigt, dass der Postausgang des internen Portals funktioniert.</p>" +
                "<p>Sie wurde über die Seite <strong>Verwaltung, E-Mail</strong> ausgelöst. Eine Antwort ist nicht nötig.</p>"
        });
        return { ok: true };
    } catch (err) {
        return { ok: false, error: describeSmtpError(err) };
    }
}

// ---------------------------------------------------------------------------
// Fehler
// ---------------------------------------------------------------------------

/**
 * Uebersetzt einen Treiberfehler in einen ganzen deutschen Satz.
 *
 * Die Adminseite benutzt dieselbe Uebersetzung. Ein "ECONNREFUSED
 * 127.0.0.1:587" im Formular sagt einem Stammesfuehrer nichts; die Meldung
 * soll den naechsten Schritt nennen.
 */
export function describeSmtpError(err: unknown): string {
    if (err instanceof SmtpNotConfiguredError) return err.message;

    const error = err as { code?: unknown; message?: unknown } | null;
    const code = typeof error?.code === "string" ? error.code : "";
    const message = typeof error?.message === "string" ? error.message : "";

    // Zertifikatsfehler melden sich je nach Fassung als eigener Code oder als
    // Grund innerhalb eines ESOCKET.
    const certificate =
        /DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE/;

    if (certificate.test(code) || certificate.test(message)) {
        return "Das Zertifikat des Servers ließ sich nicht prüfen. Es ist selbst ausgestellt oder die ausstellende Stelle ist nicht bekannt.";
    }

    switch (code) {
        case "ECONNREFUSED":
            return "Der Server hat die Verbindung abgelehnt. Prüfe Servername und Port.";
        case "ENOTFOUND":
        case "EAI_AGAIN":
            return "Der Servername ließ sich nicht auflösen. Prüfe die Schreibweise des Servernamens.";
        case "ETIMEDOUT":
        case "ECONNECTION":
            return "Der Server hat nicht rechtzeitig geantwortet. Möglicherweise blockiert eine Firewall den Port.";
        case "EAUTH":
            return "Die Anmeldung wurde abgelehnt. Prüfe Benutzername und Passwort.";
        case "ESOCKET":
            return "Die Verbindung ist abgebrochen. Meist passt die gewählte Verschlüsselung nicht zum Port: 465 erwartet SSL/TLS, 587 erwartet STARTTLS.";
        case "EENVELOPE":
            return "Der Server hat Absender oder Empfänger abgelehnt. Prüfe die Absenderadresse.";
        case "EMESSAGE":
            return "Der Server hat die Nachricht selbst abgelehnt.";
        default:
            return message
                ? `Der Versand ist fehlgeschlagen: ${message}`
                : "Der Versand ist aus einem unbekannten Grund fehlgeschlagen.";
    }
}
