import { getMember } from "$lib/server/memberService";
import { fail, redirect } from "@sveltejs/kit";

export const load = async ({ params, cookies }) => {

    const memberId = params.id;

    const verified = cookies.get(`join_verified_${memberId}`);
    const created = cookies.get("join_created_user");

    // Schutz 1: Invite-Code muss vorher validiert sein oder frisch erstellt
    if (!verified && !created) {
        throw redirect(303, `/join/${memberId}`);
    }

    // Schutz 2: Entweder eingeloggt ODER gerade neu registriert
    const session = cookies.get("session");

    if (!session && !created) {
        // Wenn nicht eingeloggt -> Login starten + member vermerken
        cookies.set("join_link_member", memberId, { path: "/" });
        throw redirect(303, "/login");
    }

    // Nach Erfolg die Flags löschen
    if (created) {
        cookies.delete("join_created_user", { path: "/" });
    }
    if (verified) {
        cookies.delete(`join_verified_${memberId}`, { path: "/" });
    }

    const member = await getMember(memberId);
    if (!member) return fail(404, { error: "Mitglied nicht gefunden" });

    const { _id, ...safeMember } = member;

    return {
        member: safeMember
    };
};
