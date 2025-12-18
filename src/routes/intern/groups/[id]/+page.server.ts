import type { PageServerLoad } from "./$types";
import { getGroup } from "$lib/server/groupService";
import { getMembersByGroup } from "$lib/server/memberService";
import { error } from "@sveltejs/kit";
import { hasPermission, getLeaderGroupIdsForUser } from "$lib/server/permissionService";

export const load: PageServerLoad = async ({ params, locals }) => {
    const perms = locals.permissions ?? [];
    const canAll = hasPermission(perms, "groups.view");
    const canGroup = hasPermission(perms, "groupleader.groups.view");
    if (!canAll && !canGroup) {
        throw error(403, "Keine Berechtigung");
    }

    const group = await getGroup(params.id);
    if (!group) {
        throw error(404, "Gruppe nicht gefunden");
    }

    if (!canAll) {
        const allowed = await getLeaderGroupIdsForUser(locals.user);
        if (!allowed.includes(group.id)) {
            throw error(403, "Keine Berechtigung");
        }
    }

    const members = await getMembersByGroup(params.id);

    return {
        group,
        members: members.map((m: any) => ({
            id: m._id.toString(),
            firstname: m.firstname,
            lastname: m.lastname,
            emails: m.emails ?? []
        }))
    };
};
