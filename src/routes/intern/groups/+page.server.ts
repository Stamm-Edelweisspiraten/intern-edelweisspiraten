import type { PageServerLoad } from "./$types";
import { getAllGroups } from "$lib/server/groupService";
import { hasPermission, getLeaderGroupIdsForUser } from "$lib/server/permissionService";
import { error } from "@sveltejs/kit";

export const load: PageServerLoad = async (event) => {
    const perms = event.locals.permissions ?? [];
    const canAll = hasPermission(perms, "groups.view");
    const canGroup = hasPermission(perms, "groups.group.view");
    if (!canAll && !canGroup) throw error(403, "Keine Berechtigung");

    const groupsAll = await getAllGroups();

    if (canAll) {
        return { groups: groupsAll };
    }

    const allowed = await getLeaderGroupIdsForUser(event.locals.user);
    const groups = groupsAll.filter((g) => allowed.includes(g.id));

    return { groups };
};
