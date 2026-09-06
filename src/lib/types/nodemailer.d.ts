/**
 * Schlanke Typdeklaration fuer nodemailer.
 *
 * Vorher stand hier eine einzige Zeile (`declare module "nodemailer";`).
 * Damit war das gesamte Modul `any`: ein Tippfehler in einer Option, ein
 * vergessenes `await` oder ein falscher Feldname fielen erst zur Laufzeit
 * auf -- und im Versand faellt so etwas erst auf, wenn eine Mail nicht
 * ankommt.
 *
 * Bewusst nur das, was dieses Projekt wirklich benutzt. Die Bibliothek
 * vollstaendig nachzubauen waere Pflegeaufwand ohne Nutzen; wer eine weitere
 * Option braucht, traegt sie hier nach.
 */
declare module "nodemailer" {
    /** Anmeldung am Postausgang; entfaellt, wenn kein Benutzer hinterlegt ist. */
    export interface SmtpAuth {
        user: string;
        pass: string;
    }

    export interface SmtpTransportOptions {
        host: string;
        port: number;
        /**
         * true -- die Verbindung ist von Beginn an verschluesselt (Port 465).
         * false -- Klartext; mit requireTLS wird auf STARTTLS hochgestuft.
         */
        secure?: boolean;
        /** Bricht ab, wenn der Server kein STARTTLS anbietet. */
        requireTLS?: boolean;
        auth?: SmtpAuth;
        /**
         * Haelt Verbindungen offen und verteilt mehrere Nachrichten darauf.
         * Ohne das oeffnet jeder Versand eine eigene SMTP-Verbindung.
         */
        pool?: boolean;
        maxConnections?: number;
        maxMessages?: number;
        /** Millisekunden bis zum Abbruch des Verbindungsaufbaus. */
        connectionTimeout?: number;
        greetingTimeout?: number;
        socketTimeout?: number;
        tls?: {
            rejectUnauthorized?: boolean;
            servername?: string;
        };
    }

    export interface Attachment {
        filename?: string;
        content: Buffer;
        contentType?: string;
    }

    export interface MailOptions {
        from?: string;
        to: string;
        subject: string;
        text?: string;
        html?: string;
        replyTo?: string;
        attachments?: Attachment[];
    }

    export interface SentMessageInfo {
        messageId: string;
        accepted: string[];
        rejected: string[];
        response: string;
    }

    export interface Transporter {
        sendMail(options: MailOptions): Promise<SentMessageInfo>;
        /** Prueft Erreichbarkeit und Anmeldung, ohne etwas zu senden. */
        verify(): Promise<true>;
        /** Gibt offene Verbindungen frei. */
        close(): void;
    }

    export function createTransport(options: SmtpTransportOptions): Transporter;

    const nodemailer: {
        createTransport: typeof createTransport;
    };

    export default nodemailer;
}
