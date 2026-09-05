import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { getMember } from "$lib/server/memberService";
import { deliverPdf } from "$lib/server/pdf/deliver";

/**
 * Beitragsbescheid eines Mitglieds.
 *
 * Die Beitragssätze kommen aus dem Geschäftsjahr, nicht aus den allgemeinen
 * Einstellungen -- ein Bescheid für ein vergangenes Jahr muss dessen Sätze
 * tragen. Das steckt in der Vorlage `payment-notice`, die auch
 * `POST /api/v1/pdf/payment-notice` bedient.
 */
export const GET: RequestHandler = async (event) => {
    requirePermission(event, "finance.view");

    const member = await getMember(event.params.id);
    if (!member) throw error(404, "Mitglied nicht gefunden");

    // Ohne Jahresangabe das aktive Geschäftsjahr.
    const fiscalYearId = event.url.searchParams.get("jahr") ?? undefined;

    return deliverPdf(
        "payment-notice",
        { memberId: member.id, fiscalYearId },
        { filename: `beitragsbescheid-${member.lastname || member.id}.pdf` }
    );
};
