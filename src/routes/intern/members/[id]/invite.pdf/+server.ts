import { error } from "@sveltejs/kit";
import { getMember } from "$lib/server/memberService";
import { createInvitePdf } from "$lib/server/pdf/invitePdf";
import { hasPermission, getLeaderGroupIdsForUser } from "$lib/server/permissionService";

export async function GET({ params, locals }) {
    const perms = locals.permissions ?? [];
    const canAll = hasPermission(perms, "members.view");
    const canGroup = hasPermission(perms, "groupleader.members.view") || hasPermission(perms, "groupleader.members.invitepdf");
    if (!canAll && !canGroup) throw error(403, "Keine Berechtigung");

    const memberId = params.id;

    const member = await getMember(memberId);
    if (!member) {
        throw error(404, "Mitglied nicht gefunden");
    }

    if (!canAll) {
        const allowed = await getLeaderGroupIdsForUser(locals.user);
        const allowedMatch = (member.groups ?? []).some((g: any) => allowed.includes(g?.toString()));
        if (!allowedMatch) throw error(403, "Keine Berechtigung");
    }

    // createInvitePdf nutzt member._id; ein zusaetzliches id-Feld ist unnoetig.
    const pdfBuffer = await createInvitePdf(member as Parameters<typeof createInvitePdf>[0]);

    return new Response(new Uint8Array(pdfBuffer), {
        headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="invite-${memberId}.pdf"`
        }
    });
}
