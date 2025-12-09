import {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    SMTP_FROM
} from "$env/static/private";

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

export async function sendEmail({ to, subject, html, text, replyTo, attachments, from }: EmailOptions) {
    const nodemailer: any = await import("nodemailer");

    // Transporter bauen
    const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT),
        secure: Number(SMTP_PORT) === 465,
        auth: {
            user: SMTP_USER,
            pass: SMTP_PASS
        }
    });

    // E-Mail senden
    return transporter.sendMail({
        from: from || SMTP_FROM,
        to,
        subject,
        html,
        text,
        replyTo,
        attachments
    });
}
