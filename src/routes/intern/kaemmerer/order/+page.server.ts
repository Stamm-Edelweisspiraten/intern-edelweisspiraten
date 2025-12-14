import type { PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { getAccessibleMembersForUser, listOrdersForMembers } from "$lib/server/kaemmererService";

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "kaemmerer.access");

    const members = await getAccessibleMembersForUser(event.locals.user);
    const memberIds = members.map((m) => m.id);
    const orders = await listOrdersForMembers(memberIds);

    return { orders, members };
};
