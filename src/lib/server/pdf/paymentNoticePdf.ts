import PDFDocument from "pdfkit";

interface Options {
    subject: string;
    message: string;
    year: number;
    breakdown: { label: string; amount: number }[];
    total: number;
    iban?: string;
    bic?: string;
    accountHolder?: string;
}

export async function createPaymentNoticePdf(opts: Options) {
    const doc = new PDFDocument({
        size: "A4",
        margin: 60,
        bufferPages: true
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    const endPromise = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

    const formatEuro = (val: number) => `${(val || 0).toFixed(2)} €`;

    // Sender
    doc.font("Helvetica").fontSize(10).fillColor("#111827").text("Stamm Edelweisspiraten", 60, 60);
    doc.text("Interner Bereich", 60, 74);

    // Empfänger neutral
    const receiverY = 120;
    doc.font("Helvetica-Bold").fontSize(12).text("An alle Mitglieder", 60, receiverY);
    doc.font("Helvetica").fontSize(12).text("Stamm Edelweisspiraten", 60, receiverY + 16);
    doc.text("Bremen", 60, receiverY + 32);

    let y = receiverY + 80;

    // Titel + Betreff
    doc.font("Helvetica-Bold").fontSize(20).fillColor("#111827").text(`Jahresbeitrag ${opts.year}`, 60, y, {
        width: doc.page.width - 120,
        align: "left"
    });
    y += 30;

    doc.font("Helvetica").fontSize(12).fillColor("#374151").text(opts.subject || "", 60, y, {
        width: doc.page.width - 120,
        align: "left"
    });

    y = doc.y + 20;

    // Nachricht
    const msg = opts.message?.trim() || "Bitte begleiche deinen Jahresbeitrag. Vielen Dank!";
    doc.font("Helvetica").fontSize(12).fillColor("#111827").text(msg, 60, y, {
        width: doc.page.width - 120,
        align: "left",
        lineGap: 6
    });
    y = doc.y + 20;

    // Aufschlüsselung + Gesamt in Card
    const startX = 60;
    const cardWidth = doc.page.width - 120;
    const headerHeight = 26;
    const rowHeight = 24;
    doc.roundedRect(startX, y, cardWidth, headerHeight + opts.breakdown.length * rowHeight + 10, 10).stroke("#e5e7eb");
    doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .fillColor("#111827")
        .text("Aufschluesselung", startX + 12, y + 7);

    y += headerHeight;
    const labelWidth = cardWidth * 0.6;
    const amountWidth = cardWidth * 0.4;

    opts.breakdown.forEach((l) => {
        doc.font("Helvetica").fontSize(11).fillColor("#111827").text(l.label, startX + 12, y + 6, { width: labelWidth - 24 });
        doc.text(formatEuro(l.amount), startX + labelWidth, y + 6, { width: amountWidth - 24, align: "right" });

        doc.moveTo(startX, y + rowHeight - 2).lineTo(startX + cardWidth, y + rowHeight - 2).strokeColor("#f1f5f9").lineWidth(1).stroke();

        y += rowHeight;
        doc.y = y;
    });

    doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor("#111827")
        .text("Gesamt", startX + 12, y + 6, { width: labelWidth - 24 });
    doc.text(formatEuro(opts.total), startX + labelWidth, y + 6, { width: amountWidth - 24, align: "right" });

    y += rowHeight + 16;

    // Bankverbindung Card
    const bankBoxHeight = 96;
    doc.roundedRect(startX, y, cardWidth, bankBoxHeight, 10).fillAndStroke("#f8fafc", "#e5e7eb");
    doc.fillColor("#111827").font("Helvetica-Bold").fontSize(12).text("Bankverbindung", startX + 12, y + 10);

    doc.font("Helvetica").fontSize(11).fillColor("#111827");
    doc.text(`Kontoinhaber: ${opts.accountHolder || "-"}`, startX + 12, y + 30);
    doc.text(`IBAN: ${opts.iban || "-"}`, startX + 12, y + 48);
    doc.text(`BIC: ${opts.bic || "-"}`, startX + 12, y + 66);

    y = y + bankBoxHeight + 12;
    doc.fontSize(10).fillColor("#6b7280").text("Hinweis: Neutrale Version ohne Anschrift. Dieses Schreiben wurde automatisch generiert.", startX, y, {
        width: cardWidth,
        align: "left"
    });

    doc.end();
    return endPromise;
}
