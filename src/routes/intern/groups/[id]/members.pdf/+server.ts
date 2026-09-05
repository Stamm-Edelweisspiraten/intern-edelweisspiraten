import { error } from "@sveltejs/kit";
import { hasPermission, getLeaderGroupIdsForUser } from "$lib/server/permissionService";
import { getGroup } from "$lib/server/groupService";
import { getMembersByGroup } from "$lib/server/memberService";
import { createGroupMembersPdf } from "$lib/server/pdf/groupMembersPdf";

export async function GET({ params, locals }) {
    const perms = locals.permissions ?? [];
    const canAll = hasPermission(perms, "groups.view");
    const canGroup = hasPermission(perms, "groupleader.groups.view") || hasPermission(perms, "groupleader.groups.memberspdf");
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

    const members = (await getMembersByGroup(params.id)) as unknown as Parameters<typeof createGroupMembersPdf>[0]["members"];

    const pdfBuffer = await createGroupMembersPdf({
        group,
        members
    });

    return new Response(new Uint8Array(pdfBuffer), {
        headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="gruppe-${group.name}-mitglieder.pdf"`
        }
    });
}
