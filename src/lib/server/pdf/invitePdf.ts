import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import type { Member } from "../memberService";
import { env } from "$env/dynamic/private";

/**
 * Einladungsschreiben mit QR-Code.
 *
 * Absender und Fusszeile kommen aus den Organisationseinstellungen --
 * vorher standen Name und Anschrift eines bestimmten Stamms fest im
 * Quelltext.
 */
export interface InvitePdfOrganization {
    name: string;
    city?: string;
}

export interface InvitePdfOptions {
    /**
     * Grundadresse fuer den Beitrittslink. Vorrang hat weiterhin
     * PUBLIC_APP_URL; sonst zaehlt der Ursprung der Anfrage.
     */
    baseUrl?: string;
}

export async function createInvitePdf(
    member: Member,
    organization: InvitePdfOrganization = { name: "Internes Portal" },
    options: InvitePdfOptions = {}
) {
    const doc = new PDFDocument({
        size: "A4",
        margin: 60
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));

    const endPromise = new Promise<Buffer>((resolve) =>
        doc.on("end", () => resolve(Buffer.concat(chunks)))
    );

    /*
     * Vorher war die Produktions-Adresse fest einkodiert -- damit zeigte der
     * QR-Code aus einer Testumgebung immer auf die Produktion. Der zweite
     * Anlauf fiel auf "http://localhost:5173" zurueck, was in einer
     * Installation ohne PUBLIC_APP_URL genauso unbrauchbar ist: der Ausdruck
     * sieht richtig aus, der QR-Code fuehrt aber ins Leere, und es faellt
     * niemandem auf. Deshalb reicht die Route den Ursprung der Anfrage durch.
     */
    const baseUrl = (env.PUBLIC_APP_URL || options.baseUrl || "").replace(/\/+$/, "");
    const joinUrl = `${baseUrl}/join/${member.id}`;
    const baseName = `${member.firstname} ${member.lastname}`;
    const displayName = `${member.firstname} ${member.lastname}${member.fahrtenname ? ` (${member.fahrtenname})` : ""}`;

    const qrPng = await QRCode.toBuffer(joinUrl, {
        margin: 1,
        width: 130 // kleinerer QR für Briefkopf
    });

    // ===============================
    // ABSENDER (oben links)
    // ===============================
    const sender = [organization.name, organization.city].filter(Boolean).join(" · ");

    doc.font("Helvetica")
        .fontSize(10)
        .text(sender, 60, 60);

    // ===============================
    // QR-CODE (oben rechts)
    // ===============================
    const qrX = doc.page.width - 60 - 130;
    const qrY = 60;

    doc.image(qrPng, qrX, qrY, { width: 130 });

    // ===============================
    // EMPFÄNGERFELD (DIN 5008)
    // ===============================
    const receiverY = 120;

    doc
        .fontSize(12)
        .text(baseName, 60, receiverY)
        .text(member.address.street ?? "", 60, receiverY + 15)
        .text(`${member.address.zip ?? ""} ${member.address.city}`, 60, receiverY + 30);

    // großer Abstand zum Inhalt
    let y = receiverY + 90;

    // ===============================
    // TITEL – zentriert
    // ===============================
    doc
        .fontSize(20)
        .font("Helvetica-Bold")
        .text("Einladung zur Registrierung", 60, y, {
            width: doc.page.width - 120,
            align: "center"
        });

    y += 50;

    // ===============================
    // Inhalt
    // ===============================
    doc.font("Helvetica").fontSize(12);

    const textBlock = `
Liebe/r ${displayName},

Sie wurden eingeladen, sich auf der internen Mitgliederplattform von ${organization.name} zu registrieren.

Scannen Sie den QR-Code oben rechts oder geben Sie den folgenden Einladungscode manuell ein.
    `;

    doc.text(textBlock.trim(), 60, y, {
        width: doc.page.width - 120,
        align: "left",
        lineGap: 6
    });

    y = doc.y + 20;

    // ===============================
    // EINLADUNGSCODE – zentriert in Box
    // ===============================
    const boxWidth = 300;
    const boxHeight = 60;
    const boxX = (doc.page.width - boxWidth) / 2;
    const boxY = y;

    doc
        .roundedRect(boxX, boxY, boxWidth, boxHeight, 8)
        .strokeColor("#000")
        .lineWidth(1)
        .stroke();

    doc
        .fontSize(20)
        .text(member.inviteCode ?? "", boxX, boxY + 18, {
            width: boxWidth,
            align: "center"
        });

    y = boxY + boxHeight + 30;

    // ===============================
    // URL – zentriert
    // ===============================
    doc
        .fontSize(12)
        .text(joinUrl, 60, y, {
            width: doc.page.width - 120,
            align: "center"
        });

    y = doc.y + 40;

    // ===============================
    // Mitgliedsdaten
    // ===============================
    doc
        .fontSize(12)
        .text("Ihre Mitgliedsdaten:", 60, y, { width: 200 });

    y += 14;

    doc
        .fontSize(12)
        .text(`Mitglieds-ID:  ${member.id}`, 60, y)
        .text(`Name:         ${displayName}`, 60, y + 15)
        .text(`Adresse:      ${member.address.street}, ${member.address.zip ?? ""} ${member.address.city}`, 60, y + 30)

    // ===============================
    // Fußtext
    // ===============================
    doc.fontSize(10);
    doc.text(organization.name, 60, doc.page.height - 80, {
        width: doc.page.width - 120,
        align: "center"
    });

    doc.end();
    return endPromise;
}
