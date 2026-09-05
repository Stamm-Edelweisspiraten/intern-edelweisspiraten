import type { PageServerLoad } from "./$types";
import { getGroup } from "$lib/server/groupService";
import { getMembersByGroup } from "$lib/server/memberService";
import { error } from "@sveltejs/kit";
import { requirePermissionForGroup } from "$lib/server/permissionGuard";

export const load: PageServerLoad = async (event) => {
    const group = await getGroup(event.params.id);
    if (!group) {
        throw error(404, "Gruppe nicht gefunden");
    }

    requirePermissionForGroup(event, "groups.view", group.id);

    const members = await getMembersByGroup(event.params.id);

    return {
        group,
        members: members.map((m) => ({
            id: m.id,
            firstname: m.firstname,
            lastname: m.lastname,
            emails: m.emails
        }))
    };
};
