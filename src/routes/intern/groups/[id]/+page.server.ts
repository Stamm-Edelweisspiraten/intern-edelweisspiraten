import type { PageServerLoad } from "./$types";
import { getGroup } from "$lib/server/groupService";
import { getMembersByGroup } from "$lib/server/memberService";
import { error } from "@sveltejs/kit";
import { hasPermission } from "$lib/server/permissionService";

export const load: PageServerLoad = async ({ params, locals }) => {
    const perms = locals.permissions ?? [];
    if (!hasPermission(perms, "groups.view")) {
        throw error(403, "Keine Berechtigung");
    }

    const group = await getGroup(params.id);
    if (!group) {
        throw error(404, "Gruppe nicht gefunden");
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
