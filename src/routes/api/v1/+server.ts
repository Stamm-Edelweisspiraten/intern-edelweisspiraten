import type { RequestHandler } from "./$types";
import { json } from "$lib/server/api/respond";

/**
 * Selbstauskunft der Schnittstelle.
 *
 * Oeffentlich erreichbar, damit ein Fremdsystem pruefen kann, ob es die
 * richtige Adresse hat, ohne dafuer schon ein Token zu brauchen.
 */
export const GET: RequestHandler = async (event) => {
    return json({
        name: "Internes Portal – REST-API",
        version: "1",
        documentation: `${event.url.origin}/api/v1/openapi.json`,
        authentication: {
            scheme: "Bearer",
            description:
                "Token unter /intern/admin/api-tokens erzeugen und als Kopfzeile senden: Authorization: Bearer ep_…"
        },
        conventions: {
            money: "Alle Beträge sind ganzzahlige Cents.",
            dates: "ISO 8601 (JJJJ-MM-TT).",
            pagination: "?page= und ?per_page=, Antwort mit data und meta.",
            errors: "Problem Details nach RFC 9457 (application/problem+json)."
        }
    });
};
