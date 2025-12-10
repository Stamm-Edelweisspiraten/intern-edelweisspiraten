import type { PageServerLoad } from "./$types";
import { error, redirect } from "@sveltejs/kit";
import { getMember, getMemberLogs } from "$lib/server/memberService";
import { hasPermission } from "$lib/server/permissionService";

export const load: PageServerLoad = async ({ params, locals }) => {
    if (!hasPermission(locals.permissions ?? [], "members.view")) {
        throw error(403, "Keine Berechtigung");
    }

    const id = params.id;
    const member = await getMember(id);
    if (!member) {
        throw redirect(303, "/intern/members");
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
