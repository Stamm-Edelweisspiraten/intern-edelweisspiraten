import { z } from "zod";
import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/api/handle";
import { notFound, unprocessable } from "$lib/server/api/respond";
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

    try {
        const result = await renderPdf(template.name, input);

        return new Response(new Uint8Array(result.buffer), {
            headers: {
                "content-type": "application/pdf",
                "content-disposition": `attachment; filename="${result.filename}"`,
                "content-length": String(result.buffer.byteLength),
                "cache-control": "no-store"
            }
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
