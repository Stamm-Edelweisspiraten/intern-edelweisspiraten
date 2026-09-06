import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getMember } from "$lib/server/memberService";
import { requirePermissionForAnyGroup } from "$lib/server/permissionGuard";
import { deliverPdf } from "$lib/server/pdf/deliver";

/**
 * Einladungsschreiben eines Mitglieds.
 *
 * Erzeugt wird es über die zentrale Vorlagenliste
 * ($lib/server/pdf/registry) -- dieselbe, die auch
 * `POST /api/v1/pdf/invite` bedient. Diese Adresse bleibt als bequemer Weg
 * aus der Mitgliederliste heraus.
 */
export const GET: RequestHandler = async (event) => {
    const member = await getMember(event.params.id);
    if (!member) throw error(404, "Mitglied nicht gefunden");

    requirePermissionForAnyGroup(event, "members.view", member.groups);

    // Ohne PUBLIC_APP_URL zaehlt der Ursprung dieser Anfrage -- sonst traegt
    // der QR-Code eine Adresse, die es in dieser Installation nicht gibt.
    return deliverPdf(
        "invite",
        { memberId: member.id, baseUrl: event.url.origin },
        { filename: `einladung-${member.lastname || member.id}.pdf` }
    );
};
