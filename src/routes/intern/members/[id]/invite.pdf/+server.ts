import { error } from "@sveltejs/kit";
import { getMember } from "$lib/server/memberService";
import { createInvitePdf } from "$lib/server/pdf/invitePdf";

export async function GET({ params }) {
    const memberId = params.id;

    const member = await getMember(memberId);
    if (!member) {
        throw error(404, "Mitglied nicht gefunden");
    }

    const pdfBuffer = await createInvitePdf({
        ...member,
        id: memberId
    });

    return new Response(pdfBuffer, {
        headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="invite-${memberId}.pdf"`
        }
    });
}
