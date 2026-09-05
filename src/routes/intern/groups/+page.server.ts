import type { PageServerLoad } from "./$types";
import { getAllGroups } from "$lib/server/groupService";
import { requireGroupsWithPermission } from "$lib/server/permissionGuard";

/**
 * Die Uebersicht zeigt alle Gruppen des Stammes; geoeffnet werden koennen
 * nur die, fuer die groups.view vorliegt. `allowed === null` heisst
 * stammesweit.
 */
export const load: PageServerLoad = async (event) => {
    const allowed = requireGroupsWithPermission(event, "groups.view");

    const groupsAll = await getAllGroups();
    const allowedGroups = allowed === null ? groupsAll.map((g) => g.id) : allowed;

    return { groups: groupsAll, allowedGroups, canAll: allowed === null };
};
