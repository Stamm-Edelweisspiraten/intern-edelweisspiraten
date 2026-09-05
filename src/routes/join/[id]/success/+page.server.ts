import { error, redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { getMember } from "$lib/server/memberService";
import { verifySignedToken, INVITE_PURPOSE } from "$lib/server/signedToken";

/** Bestaetigungsseite nach erfolgreicher Registrierung. */
export const load: PageServerLoad = async ({ params, cookies }) => {
    const memberId = params.id;

    const created = cookies.get("join_created_user") === "1";
    const verified = verifySignedToken(cookies.get(`join_verified_${memberId}`), INVITE_PURPOSE);

    if (!created && !verified) {
        throw redirect(303, `/join/${memberId}`);
    }

    // Einmalige Flags aufraeumen.
    cookies.delete("join_created_user", { path: "/" });
    cookies.delete(`join_verified_${memberId}`, { path: "/" });

    const member = await getMember(memberId);
    if (!member) throw error(404, "Mitglied nicht gefunden");

    // Bewusst minimal -- vorher wurde das komplette Mitgliedsdokument
    // ausgeliefert.
    return {
        member: {
            firstname: member.firstname,
            lastname: member.lastname
        }
    };
};
