import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireGroupsWithPermission } from "$lib/server/permissionGuard";
import { getEvent, mayManageEvent } from "$lib/server/eventService";
import { deliverPdf } from "$lib/server/pdf/deliver";

/**
 * Teilnehmerliste eines Termins.
 *
 * Verlangt `events.manage`: die Liste zeigt, wer abgesagt hat, und das geht
 * nicht jeden an, der den Termin sehen darf. Das Recht gilt stammesweit ODER
 * fuer einzelne Gruppen -- deshalb dieselbe zweistufige Pruefung wie in den
 * schreibenden Aktionen, sonst bekaeme eine Meutenfuehrung die Schaltflaeche
 * angezeigt und dahinter einen 403.
 */
export const GET: RequestHandler = async (event) => {
    const scope = requireGroupsWithPermission(event, "events.manage");
    if (!(await mayManageEvent(event.params.id, scope))) {
        throw error(403, "Keine Berechtigung");
    }

    const entry = await getEvent(event.params.id, {}, { manageAll: true });
    if (!entry) throw error(404, "Termin nicht gefunden");

    // Ohne Rueckmeldung gibt es keine Teilnehmerliste.
    if (!entry.responsesEnabled) {
        throw error(404, "Für diesen Termin werden keine Rückmeldungen erfasst.");
    }

    return deliverPdf(
        "event-attendees",
        { eventId: entry.id },
        { filename: `teilnehmer-${entry.title}.pdf` }
    );
};
