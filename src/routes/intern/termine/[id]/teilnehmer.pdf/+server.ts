import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { getEvent } from "$lib/server/eventService";
import { deliverPdf } from "$lib/server/pdf/deliver";

/**
 * Teilnehmerliste eines Termins.
 *
 * Verlangt `events.manage`: die Liste zeigt, wer abgesagt hat, und das geht
 * nicht jeden an, der den Termin sehen darf.
 */
export const GET: RequestHandler = async (event) => {
    requirePermission(event, "events.manage");

    const entry = await getEvent(event.params.id, {}, { manageAll: true });
    if (!entry) throw error(404, "Termin nicht gefunden");

    return deliverPdf(
        "event-attendees",
        { eventId: entry.id },
        { filename: `teilnehmer-${entry.title}.pdf` }
    );
};
