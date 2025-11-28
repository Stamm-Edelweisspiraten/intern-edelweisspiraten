import { getMember } from "$lib/server/memberService";
import { fail } from "@sveltejs/kit";

export const load = async ({ params }) => {
    const member = await getMember(params.id);

    if (!member) {
        return fail(404, { error: "Mitglied nicht gefunden" });
    }

    const { _id, ...safeMember } = member;

    return {
        member: safeMember
    };
};
