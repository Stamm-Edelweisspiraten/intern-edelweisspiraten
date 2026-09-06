import { z } from "zod";
import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/api/handle";
import { notFound, unprocessable } from "$lib/server/api/respond";
import { downloadHeaders } from "$lib/server/http/download";
import { getTemplate, PdfNotFoundError, renderPdf } from "$lib/server/pdf/registry";

/**
 * Ein PDF erzeugen.
 *
 * POST, nicht GET: die Eingabe kann eine Liste von Gruppen oder einen
 * mehrzeiligen Text enthalten, und beides gehört nicht in eine Adresszeile,
 * wo es in jedem Zugriffsprotokoll landet.
 *
 * Die benötigte Berechtigung steht auf der Vorlage -- eine Stelle statt
 * dreier verschiedener Prüfmuster in den Routen.
 */
export const POST: RequestHandler = async (event) => {
    const template = getTemplate(event.params.template);
    if (!template) return notFound("Die angeforderte Vorlage");

    const denied = requireScope(event, template.permission);
    if (denied) return denied;

    let input: unknown = {};

    // Ein leerer Rumpf ist erlaubt: manche Vorlagen brauchen keine Angaben.
    const raw = await event.request.text();
    if (raw.trim()) {
        try {
            input = JSON.parse(raw);
        } catch {
            return unprocessable("Der Rumpf der Anfrage ist kein gültiges JSON.");
        }
    }

    /*
     * Basis-Adresse nachtragen, wenn der Aufrufer keine mitschickt.
     *
     * Die Einladungsvorlage baut daraus den QR-Code und den Beitrittslink.
     * Ohne diese Zeile blieb der Link relativ, sobald PUBLIC_APP_URL nicht
     * gesetzt war -- ein Fremdsystem konnte das gar nicht wissen. Ein
     * ausdruecklich uebergebener Wert hat weiterhin Vorrang.
     */
    if (input && typeof input === "object" && !Array.isArray(input)) {
        const record = input as Record<string, unknown>;
        if (record.baseUrl === undefined) record.baseUrl = event.url.origin;
    }

    try {
        const result = await renderPdf(template.name, input);

        // Die API liefert bewusst als attachment: dort speichert ein
        // Fremdsystem die Datei, waehrend die /intern-Adressen sie im Browser
        // anzeigen. Kopfzeilen ueber den gemeinsamen Helfer, damit der
        // Dateiname gefiltert ist und nosniff mitkommt.
        return new Response(new Uint8Array(result.buffer), {
            headers: downloadHeaders({
                contentType: "application/pdf",
                filename: result.filename,
                length: result.buffer.byteLength,
                forceDownload: true,
                cacheControl: "no-store"
            })
        });
    } catch (err) {
        if (err instanceof z.ZodError) {
            const errors: Record<string, string[]> = {};
            for (const issue of err.issues) {
                const key = issue.path.join(".") || "_";
                errors[key] = [...(errors[key] ?? []), issue.message];
            }
            return unprocessable("Die Angaben sind unvollständig oder ungültig.", errors);
        }

        if (err instanceof PdfNotFoundError) {
            return notFound(err.message.replace(/\.$/, ""));
        }

        throw err;
    }
};
