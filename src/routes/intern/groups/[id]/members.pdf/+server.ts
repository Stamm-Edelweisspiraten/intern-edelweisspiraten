import { error } from "@sveltejs/kit";
import { hasPermission } from "$lib/server/permissionService";
import { getGroup } from "$lib/server/groupService";
import { getMembersByGroup } from "$lib/server/memberService";
import { createGroupMembersPdf } from "$lib/server/pdf/groupMembersPdf";

export async function GET({ params, locals }) {
    if (!hasPermission(locals.permissions ?? [], "groups.view")) {
        throw error(403, "Keine Berechtigung");
    }

    const group = await getGroup(params.id);
    if (!group) {
        throw error(404, "Gruppe nicht gefunden");
    }

    const members = await getMembersByGroup(params.id);

    const pdfBuffer = await createGroupMembersPdf({
        group,
        members
    });

    return new Response(pdfBuffer, {
        headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="gruppe-${group.name}-mitglieder.pdf"`
        }
    });
}
