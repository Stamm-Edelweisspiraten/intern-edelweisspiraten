import PDFDocument from "pdfkit";
import type { Member } from "$lib/server/memberService";
import type { Group } from "$lib/server/groupService";

interface Options {
    group: Group;
    members: Member[];
}

export async function createGroupMembersPdf({ group, members }: Options) {
    const doc = new PDFDocument({
        size: "A4",
        layout: "landscape",
        margin: 40,
        bufferPages: true
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));

    const endPromise = new Promise<Buffer>((resolve) =>
        doc.on("end", () => resolve(Buffer.concat(chunks)))
    );

    // Header
    doc
        .font("Helvetica-Bold")
        .fontSize(20)
        .text(`Gruppenübersicht: ${group.name}`, { align: "left" });

    doc
        .font("Helvetica")
        .fontSize(12)
        .fillColor("#374151")
        .moveDown(0.4)
        .text(`Typ: ${group.type ?? "-"}`)
        .text(`Treffen: ${group.meeting_time ?? "k.A."}`)
        .text(`Beschreibung: ${group.description || "Keine Beschreibung"}`);

    doc.moveDown(0.8);

    // Table setup
    const totalWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const tableWidth = Math.min(totalWidth, 720);
    const startX = doc.page.margins.left + (totalWidth - tableWidth) / 2;
    let y = doc.y;
    const colWidths = [tableWidth * 0.2, tableWidth * 0.3, tableWidth * 0.25, tableWidth * 0.25];
    const headers = ["Name", "Adresse", "E-Mail(s)", "Telefon"];

    const drawCell = (text: string, colIdx: number, opts: { header?: boolean }) => {
        const x = startX + colWidths.slice(0, colIdx).reduce((a, b) => a + b, 0);
        const width = colWidths[colIdx];
        const isHeader = opts.header ?? false;
        if (isHeader) {
            doc.rect(x, y, width, 24).stroke("#cbd5e1");
            doc.fillColor("#111827").font("Helvetica-Bold").fontSize(11).text(text, x + 6, y + 6, { width: width - 12 });
            doc.fillColor("#111827").font("Helvetica").fontSize(10);
        } else {
            doc.rect(x, y, width, 28).stroke("#e5e7eb");
            doc.text(text || "-", x + 6, y + 8, { width: width - 12 });
        }
    };

    // Header row
    headers.forEach((h, idx) => drawCell(h, idx, { header: true }));
    y += 24;

    members.forEach((m) => {
        const fullname = `${m.firstname ?? ""} ${m.lastname ?? ""}`.trim() || "Unbekannt";
        const displayName = m.fahrtenname ? `${fullname} (${m.fahrtenname})` : fullname;
        const addr = m.address
            ? `${m.address.street ?? ""}, ${m.address.zip ?? ""} ${m.address.city ?? ""}`.trim()
            : "-";
        const emails = Array.isArray(m.emails) && m.emails.length > 0
            ? m.emails.map((e: any) => e.email).filter(Boolean).join(", ")
            : "-";
        const phones = Array.isArray(m.numbers) && m.numbers.length > 0
            ? m.numbers
                .map((n: any) => `${n.label}: ${n.number}${n.label ? `` : ""}`)
                .join("\n")
            : "-";

        // Adjust height for multi-line phones
        const rowHeight = Math.max(30, phones.includes("\n") ? 44 : 30);
        colWidths.forEach((_, idx) => {
            doc.rect(startX + colWidths.slice(0, idx).reduce((a, b) => a + b, 0), y, colWidths[idx], rowHeight).stroke("#e5e7eb");
        });

        doc.text(displayName, startX + 6, y + 8, { width: colWidths[0] - 12 });
        doc.text(addr, startX + colWidths[0] + 6, y + 8, { width: colWidths[1] - 12 });
        doc.text(emails, startX + colWidths[0] + colWidths[1] + 6, y + 8, { width: colWidths[2] - 12 });
        doc.text(phones, startX + colWidths[0] + colWidths[1] + colWidths[2] + 6, y + 8, { width: colWidths[3] - 12 });

        y += rowHeight;

        if (y > doc.page.height - doc.page.margins.bottom - 60) {
            doc.addPage({ size: "A4", layout: "landscape", margin: 40 });
            const totalW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
            const tableW = Math.min(totalW, 720);
            const newStartX = doc.page.margins.left + (totalW - tableW) / 2;
            y = doc.page.margins.top;
            headers.forEach((h, idx) => drawCell(h, idx, { header: true }));
            y += 24;
        }
    });

    // Footer page numbers
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        doc
            .font("Helvetica")
            .fontSize(9)
            .fillColor("#6b7280")
            .text(`Seite ${i + 1} / ${pageCount}`, doc.page.width - doc.page.margins.right - 70, doc.page.height - doc.page.margins.bottom - 12, {
                width: 70,
                align: "right"
            });
    }

    doc.end();
    return endPromise;
}
