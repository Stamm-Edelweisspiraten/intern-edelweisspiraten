import { error } from "@sveltejs/kit";
import { PdfNotFoundError, renderPdf } from "./registry";

/**
 * Ein PDF als Antwort einer /intern-Route.
 *
 * Die drei bequemen Adressen unter /intern (Einladung, Gruppenliste,
 * Beitragsbescheid) bleiben erhalten, benutzen aber dieselbe Registry wie die
 * REST-API. Vorher rief jede ihren Erzeuger direkt auf und baute die Antwort
 * selbst zusammen -- mit unterschiedlichen Kopfzeilen.
 *
 * `inline`, nicht `attachment`: im Browser soll sich das Dokument in der
 * Vorschau öffnen. Die API liefert dieselben PDFs als `attachment`, weil dort
 * ein Fremdsystem sie speichert.
 */
export async function deliverPdf(
    template: string,
    input: unknown,
    options: { filename?: string } = {}
): Promise<Response> {
    try {
        const result = await renderPdf(template, input);
        const filename = options.filename ?? result.filename;

        return new Response(new Uint8Array(result.buffer), {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `inline; filename="${filename.replace(/["\\\r\n]/g, "")}"`,
                "Content-Length": String(result.buffer.byteLength),
                // Mitgliederdaten gehoeren nicht in einen Zwischenspeicher.
                "Cache-Control": "private, no-store"
            }
        });
    } catch (err) {
        if (err instanceof PdfNotFoundError) throw error(404, err.message);
        throw err;
    }
}
