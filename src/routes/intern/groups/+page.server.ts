import type { PageServerLoad } from "./$types";
import { getAllGroups } from "$lib/server/groupService";
import { requirePermission } from "$lib/server/permissionGuard";

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "groups.view");

    const groups = await getAllGroups();

    return { groups };
};
