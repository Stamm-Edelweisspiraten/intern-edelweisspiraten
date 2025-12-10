import type { Actions, PageServerLoad } from "./$types";
import { getMember } from "$lib/server/memberService";
import { fail, redirect, error } from "@sveltejs/kit";
import { createSignedSession } from "$lib/server/session";

const JOIN_COOKIE_AGE = 60 * 30; // 30 Minuten

export const load: PageServerLoad = async ({ params }) => {
    const id = params.id;

    const member = await getMember(id);
    if (!member) {
        return fail(404, { error: "Mitglied nicht gefunden" });
    }

    // SERIALISIERUNG ERFORDERLICH
    const normalized = {
        id,
        firstname: member.firstname,
        lastname: member.lastname,
        fahrtenname: member.fahrtenname ?? "",
        birthday: member.birthday,
        address: member.address,
        stand: member.stand,
        status: member.status,
        groups: member.groups ?? [],
        entryDate: member.entryDate,
        emails: member.emails ?? [],
        numbers: member.numbers ?? [],
        inviteCode: member.inviteCode ?? null
    };

    return { member: normalized };
};

export const actions: Actions = {
    default: async ({ request, params, cookies }) => {
        const form = await request.formData();
        const code = form.get("code")?.toString() ?? "";
        const memberId = params.id;

        const member = await getMember(memberId);
        if (!member) {
            return fail(404, { error: "Mitglied nicht gefunden" });
        }

        if (!member.inviteCode || member.inviteCode !== code) {
            return fail(400, { error: "Ungültiger Einladungscode" });
        }

        const signed = createSignedSession(
            { memberId, type: "invite" },
            JOIN_COOKIE_AGE
        );

        cookies.set(`join_verified_${memberId}`, signed, {
            path: "/",
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            maxAge: JOIN_COOKIE_AGE
        });

        throw redirect(303, `/join/${memberId}/register`);
    }
};
