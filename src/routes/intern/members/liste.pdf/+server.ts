import type { RequestHandler } from "./$types";
import { requireGroupsWithPermission } from "$lib/server/permissionGuard";
import { deliverPdf } from "$lib/server/pdf/deliver";

/**
 * Mitgliederliste als PDF.
 *
 * Nimmt dieselben Filter auf, die auf `/intern/members` gesetzt sind, damit
 * die ausgedruckte Liste zeigt, was auf dem Bildschirm steht:
 *
 *   ?gruppe=<kennung>   nur diese Gruppe
 *   ?status=aktiv       nur Mitglieder mit diesem Status
 *   ?kontakt=1          mit E-Mail und Telefon, dafür quer
 *
 * Ohne Gruppenangabe entscheidet die Zuständigkeit: Wer `members.view` nur
 * für einzelne Gruppen hat, bekommt auch nur deren Mitglieder aufs Blatt —
 * die Registry würde sonst den ganzen Stamm drucken.
 */
export const GET: RequestHandler = async (event) => {
    const allowed = requireGroupsWithPermission(event, "members.view");

    const requested = event.url.searchParams.get("gruppe");
    const status = event.url.searchParams.get("status");
    const withContact = event.url.searchParams.get("kontakt") === "1";

    let groupIds: string[] | undefined;

    if (requested) {
        // Eine fremde Gruppe im Adressfeld darf nicht mehr zeigen als die Seite.
        groupIds = allowed === null || allowed.includes(requested) ? [requested] : [];
    } else if (allowed !== null) {
        groupIds = allowed;
    }

    return deliverPdf(
        "member-list",
        {
            ...(groupIds ? { groupIds } : {}),
            ...(status ? { status } : {}),
            includeContact: withContact
        },
        { filename: "mitgliederliste.pdf" }
    );
};
