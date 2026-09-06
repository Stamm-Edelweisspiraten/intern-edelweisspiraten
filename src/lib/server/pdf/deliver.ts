import { error } from "@sveltejs/kit";
import { downloadHeaders } from "$lib/server/http/download";
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

        // Kopfzeilen ueber den gemeinsamen Helfer: er filtert den Dateinamen,
        // haengt die RFC-5987-Fassung fuer Umlaute an und setzt nosniff. Die
        // Regel stand hier vorher als eigene Zeile -- an drei Stellen im
        // Projekt unterschiedlich streng.
        return new Response(new Uint8Array(result.buffer), {
            headers: downloadHeaders({
                contentType: "application/pdf",
                filename,
                length: result.buffer.byteLength
            })
        });
    } catch (err) {
        if (err instanceof PdfNotFoundError) throw error(404, err.message);
        throw err;
    }
}
