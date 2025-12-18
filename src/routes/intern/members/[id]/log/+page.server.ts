import type { PageServerLoad } from "./$types";
import { error, redirect } from "@sveltejs/kit";
import { getMember, getMemberLogs } from "$lib/server/memberService";
import { hasPermission, getLeaderGroupIdsForUser } from "$lib/server/permissionService";

export const load: PageServerLoad = async ({ params, locals }) => {
    const perms = locals.permissions ?? [];
    const canAll = hasPermission(perms, "members.view");
    const canGroup = hasPermission(perms, "groupleader.members.view") || hasPermission(perms, "groupleader.members.log");
    if (!canAll && !canGroup) {
        throw error(403, "Keine Berechtigung");
    }

    const id = params.id;
    const member = await getMember(id);
    if (!member) {
        throw redirect(303, "/intern/members");
    }

    if (!canAll) {
        const allowed = await getLeaderGroupIdsForUser(locals.user);
        const allowedMatch = (member.groups ?? []).some((g: any) => allowed.includes(g?.toString()));
        if (!allowedMatch) throw error(403, "Keine Berechtigung");
    }

    const logs = await getMemberLogs(id);

    return {
        member: {
            id,
            firstname: member.firstname,
            lastname: member.lastname,
            fahrtenname: member.fahrtenname ?? "",
            updatedAt: member.updatedAt ?? null,
            updatedBy: member.updatedBy ?? null
        },
        logs
    };
};
