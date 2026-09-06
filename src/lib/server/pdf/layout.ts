import PDFDocument from "pdfkit";
import { readFile } from "$lib/server/fileStore";
import { getOrganizationSettings } from "$lib/server/settingsService";

/**
 * Gemeinsames Gerüst für alle PDFs.
 *
 * Die drei vorhandenen Erzeuger bauten Kopf, Fußzeile und Tabellen **jeder
 * für sich** -- mit eigenen Farben, eigenen Spaltenbreiten und ohne
 * Seitenumbruch in der Tabelle. Hier steht das einmal: Kopf mit Organisation
 * und Logo, Fußzeile mit Seitenzahl, eine Tabellenfunktion, die umbricht.
 *
 * pdfkit schreibt in einen Strom; erst `finish()` liefert den Puffer.
 */

/** Farben, abgeglichen mit den Design-Tokens des Portals. */
export const PDF_COLORS = {
    text: "#111827",
    muted: "#4b5563",
    subtle: "#6b7280",
    line: "#e5e7eb",
    lineStrong: "#cbd5e1",
    headerFill: "#f3f4f6",
    zebra: "#f9fafb",
    danger: "#b91c1c",
    success: "#15803d"
} as const;

export const PDF_FONTS = {
    regular: "Helvetica",
    bold: "Helvetica-Bold",
    italic: "Helvetica-Oblique"
} as const;

export interface DocumentOptions {
    title: string;
    subtitle?: string;
    landscape?: boolean;
    /** Zeile unten links, z.B. "Stand: 05.09.2026". */
    footnote?: string;
}

export interface Organization {
    name: string;
    city: string;
    logo: Buffer | null;
}

/**
 * Lädt Name und Logo einmal.
 *
 * Das Logo kann inzwischen im Objektspeicher liegen -- `readFile` kümmert
 * sich darum. Fehlt es oder ist es unlesbar, bleibt der Kopf ohne Bild statt
 * das ganze PDF scheitern zu lassen: ein Beitragsbescheid ohne Logo ist immer
 * noch ein Beitragsbescheid.
 */
export async function loadOrganization(): Promise<Organization> {
    const settings = await getOrganizationSettings();

    let logo: Buffer | null = null;
    if (settings.logoFileId) {
        try {
            const file = await readFile(settings.logoFileId);
            // pdfkit versteht PNG und JPEG; alles andere würde werfen.
            if (file && /^image\/(png|jpe?g)$/.test(file.contentType)) {
                logo = file.content;
            }
        } catch (err) {
            console.warn("Logo konnte nicht geladen werden:", err);
        }
    }

    return { name: settings.name, city: settings.city, logo };
}

export interface PdfBuilder {
    doc: PDFKit.PDFDocument;
    organization: Organization;
    /** Innenrand links. */
    left: number;
    /** Nutzbare Breite zwischen den Rändern. */
    width: number;
    heading(text: string, options?: { size?: number; spaceAfter?: number }): void;
    paragraph(text: string, options?: { size?: number; color?: string }): void;
    keyValues(entries: { label: string; value: string }[]): void;
    table(spec: TableSpec): void;
    /** Fußzeilen setzen und den Puffer liefern. */
    finish(): Promise<Buffer>;
}

export interface TableColumn {
    header: string;
    /** Anteil an der Gesamtbreite; die Anteile werden normiert. */
    width: number;
    align?: "left" | "right" | "center";
}

export interface TableSpec {
    columns: TableColumn[];
    rows: string[][];
    /** Fett gesetzte Schlusszeile, z.B. eine Summe. */
    total?: string[];
    /** Text, wenn keine Zeilen vorhanden sind. */
    empty?: string;
}

const MARGIN = 48;
const FOOTER_SPACE = 46;

/**
 * Erzeugt ein Dokument mit Kopf und liefert die Bausteine.
 *
 * `bufferPages` ist nötig, damit die Fußzeile am Ende auf ALLE Seiten
 * geschrieben werden kann -- die Gesamtzahl steht erst dann fest.
 */
export async function createDocument(options: DocumentOptions): Promise<PdfBuilder> {
    const organization = await loadOrganization();

    const doc = new PDFDocument({
        size: "A4",
        layout: options.landscape ? "landscape" : "portrait",
        margin: MARGIN,
        bufferPages: true,
        info: {
            Title: options.title,
            Author: organization.name,
            Creator: "Internes Portal"
        }
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve) =>
        doc.on("end", () => resolve(Buffer.concat(chunks)))
    );

    const left = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    drawHeader(doc, organization, options, left, width);

    const builder: PdfBuilder = {
        doc,
        organization,
        left,
        width,

        heading(text, headingOptions = {}) {
            doc
                .font(PDF_FONTS.bold)
                .fontSize(headingOptions.size ?? 14)
                .fillColor(PDF_COLORS.text)
                .text(text, left, doc.y, { width });
            doc.moveDown(headingOptions.spaceAfter ?? 0.4);
        },

        paragraph(text, paragraphOptions = {}) {
            doc
                .font(PDF_FONTS.regular)
                .fontSize(paragraphOptions.size ?? 10)
                .fillColor(paragraphOptions.color ?? PDF_COLORS.text)
                .text(text, left, doc.y, { width });
            doc.moveDown(0.5);
        },

        keyValues(entries) {
            const labelWidth = 130;

            for (const entry of entries) {
                const y = doc.y;
                doc
                    .font(PDF_FONTS.regular)
                    .fontSize(10)
                    .fillColor(PDF_COLORS.subtle)
                    .text(entry.label, left, y, { width: labelWidth });
                doc
                    .font(PDF_FONTS.regular)
                    .fontSize(10)
                    .fillColor(PDF_COLORS.text)
                    .text(entry.value || "–", left + labelWidth, y, {
                        width: width - labelWidth
                    });
                doc.moveDown(0.2);
            }

            doc.moveDown(0.4);
        },

        table(spec) {
            drawTable(doc, spec, left, width);
        },

        async finish() {
            drawFooters(doc, organization, options);
            doc.end();
            return done;
        }
    };

    return builder;
}

function drawHeader(
    doc: PDFKit.PDFDocument,
    organization: Organization,
    options: DocumentOptions,
    left: number,
    width: number
): void {
    const top = doc.page.margins.top;
    let textLeft = left;

    if (organization.logo) {
        try {
            doc.image(organization.logo, left, top, { fit: [46, 46] });
            textLeft = left + 58;
        } catch (err) {
            // Ein kaputtes Bild darf das Dokument nicht verhindern.
            console.warn("Logo konnte nicht eingebettet werden:", err);
        }
    }

    doc
        .font(PDF_FONTS.bold)
        .fontSize(11)
        .fillColor(PDF_COLORS.muted)
        .text(organization.name, textLeft, top, { width: width - (textLeft - left) });

    if (organization.city) {
        doc
            .font(PDF_FONTS.regular)
            .fontSize(9)
            .fillColor(PDF_COLORS.subtle)
            .text(organization.city, textLeft, doc.y);
    }

    const lineY = Math.max(doc.y, top + 46) + 8;
    doc.moveTo(left, lineY).lineTo(left + width, lineY).lineWidth(0.5)
        .strokeColor(PDF_COLORS.lineStrong).stroke();

    doc.y = lineY + 16;

    doc
        .font(PDF_FONTS.bold)
        .fontSize(18)
        .fillColor(PDF_COLORS.text)
        .text(options.title, left, doc.y, { width });

    if (options.subtitle) {
        doc
            .font(PDF_FONTS.regular)
            .fontSize(11)
            .fillColor(PDF_COLORS.muted)
            .text(options.subtitle, left, doc.y + 2, { width });
    }

    doc.moveDown(1);
}

/**
 * Tabelle mit Seitenumbruch.
 *
 * Die bisherigen Erzeuger schrieben über den Seitenrand hinaus, sobald mehr
 * Zeilen anfielen als auf eine Seite passen -- bei einer Gruppe mit dreißig
 * Mitgliedern fehlte der Rest schlicht. Hier wird umgebrochen und der
 * Tabellenkopf auf der neuen Seite wiederholt.
 */
function drawTable(
    doc: PDFKit.PDFDocument,
    spec: TableSpec,
    left: number,
    width: number
): void {
    if (spec.rows.length === 0 && !spec.total) {
        doc
            .font(PDF_FONTS.italic)
            .fontSize(10)
            .fillColor(PDF_COLORS.subtle)
            .text(spec.empty ?? "Keine Einträge.", left, doc.y, { width });
        doc.moveDown(0.8);
        return;
    }

    const totalShare = spec.columns.reduce((sum, column) => sum + column.width, 0) || 1;
    const widths = spec.columns.map((column) => (column.width / totalShare) * width);

    const padding = 5;
    const headerHeight = 22;

    /** Die Höhe einer Zeile richtet sich nach der längsten Zelle. */
    const rowHeight = (cells: string[]): number => {
        let height = 18;
        cells.forEach((cell, index) => {
            const needed =
                doc
                    .font(PDF_FONTS.regular)
                    .fontSize(9)
                    .heightOfString(cell || "–", { width: widths[index] - padding * 2 }) +
                10;
            if (needed > height) height = needed;
        });
        return height;
    };

    const bottom = doc.page.height - doc.page.margins.bottom - FOOTER_SPACE;

    const drawHeaderRow = () => {
        const y = doc.y;
        doc.rect(left, y, width, headerHeight).fill(PDF_COLORS.headerFill);

        let x = left;
        spec.columns.forEach((column, index) => {
            doc
                .font(PDF_FONTS.bold)
                .fontSize(9)
                .fillColor(PDF_COLORS.text)
                .text(column.header, x + padding, y + 6, {
                    width: widths[index] - padding * 2,
                    align: column.align ?? "left",
                    lineBreak: false
                });
            x += widths[index];
        });

        doc.y = y + headerHeight;
    };

    drawHeaderRow();

    spec.rows.forEach((cells, rowIndex) => {
        const height = rowHeight(cells);

        if (doc.y + height > bottom) {
            doc.addPage();
            drawHeaderRow();
        }

        const y = doc.y;

        // Zebrastreifen: bei zwanzig Zeilen hilft es der Spur des Auges.
        if (rowIndex % 2 === 1) {
            doc.rect(left, y, width, height).fill(PDF_COLORS.zebra);
        }

        let x = left;
        cells.forEach((cell, index) => {
            doc
                .font(PDF_FONTS.regular)
                .fontSize(9)
                .fillColor(PDF_COLORS.text)
                .text(cell || "–", x + padding, y + 5, {
                    width: widths[index] - padding * 2,
                    align: spec.columns[index]?.align ?? "left"
                });
            x += widths[index];
        });

        doc
            .moveTo(left, y + height)
            .lineTo(left + width, y + height)
            .lineWidth(0.5)
            .strokeColor(PDF_COLORS.line)
            .stroke();

        doc.y = y + height;
    });

    if (spec.total) {
        const height = rowHeight(spec.total);

        if (doc.y + height > bottom) {
            doc.addPage();
            drawHeaderRow();
        }

        const y = doc.y;
        doc.rect(left, y, width, height).fill(PDF_COLORS.headerFill);

        let x = left;
        spec.total.forEach((cell, index) => {
            doc
                .font(PDF_FONTS.bold)
                .fontSize(9)
                .fillColor(PDF_COLORS.text)
                .text(cell || "", x + padding, y + 5, {
                    width: widths[index] - padding * 2,
                    align: spec.columns[index]?.align ?? "left"
                });
            x += widths[index];
        });

        doc.y = y + height;
    }

    doc.moveDown(1);
}

/**
 * Fußzeile auf jede Seite.
 *
 * Erst am Ende möglich: „Seite 2 von 5“ setzt voraus, dass die 5 feststeht.
 * Deshalb `bufferPages` und dieser Durchlauf über alle Seiten.
 */
function drawFooters(
    doc: PDFKit.PDFDocument,
    organization: Organization,
    options: DocumentOptions
): void {
    const range = doc.bufferedPageRange();

    for (let index = 0; index < range.count; index += 1) {
        doc.switchToPage(range.start + index);

        const left = doc.page.margins.left;
        const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const y = doc.page.height - doc.page.margins.bottom - 24;

        doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.5)
            .strokeColor(PDF_COLORS.line).stroke();

        const note = options.footnote ?? organization.name;

        doc
            .font(PDF_FONTS.regular)
            .fontSize(8)
            .fillColor(PDF_COLORS.subtle)
            .text(note, left, y + 6, { width: width * 0.7, lineBreak: false });

        doc.text(`Seite ${index + 1} von ${range.count}`, left + width * 0.7, y + 6, {
            width: width * 0.3,
            align: "right",
            lineBreak: false
        });
    }
}

/** Datum im deutschen Format, für Kopfzeilen und Fußnoten. */
export function formatPdfDate(value: Date | string = new Date()): string {
    const date = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });
}
