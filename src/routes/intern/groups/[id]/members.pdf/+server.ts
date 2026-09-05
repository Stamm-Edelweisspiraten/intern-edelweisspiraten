import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getGroup } from "$lib/server/groupService";
import { requirePermissionForGroup } from "$lib/server/permissionGuard";
import { deliverPdf } from "$lib/server/pdf/deliver";

/**
 * Mitgliederliste einer Gruppe.
 *
 * Erzeugt über die zentrale Vorlagenliste; dieselbe Vorlage bedient
 * `POST /api/v1/pdf/group-members`.
 */
export const GET: RequestHandler = async (event) => {
    const group = await getGroup(event.params.id);
    if (!group) throw error(404, "Gruppe nicht gefunden");

    requirePermissionForGroup(event, "groups.view", group.id);

    return deliverPdf(
        "group-members",
        { groupId: group.id },
        { filename: `gruppe-${group.name}-mitglieder.pdf` }
    );
};
