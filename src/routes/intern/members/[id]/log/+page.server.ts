import type { PageServerLoad } from "./$types";
import { redirect } from "@sveltejs/kit";
import { getMember, getMemberLogs } from "$lib/server/memberService";
import { requirePermissionForAnyGroup } from "$lib/server/permissionGuard";

export const load: PageServerLoad = async (event) => {
    const id = event.params.id;
    const member = await getMember(id);
    if (!member) {
        throw redirect(303, "/intern/members");
    }

    requirePermissionForAnyGroup(event, "members.view", member.groups);

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
