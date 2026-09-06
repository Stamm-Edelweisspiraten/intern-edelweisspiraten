import { error, fail, redirect } from "@sveltejs/kit";
import { dev } from "$app/environment";
import type { Actions, PageServerLoad } from "./$types";
import { getMember } from "$lib/server/memberService";
import { createUser, normalizeEmail } from "$lib/server/userService";
import { verifySignedToken, INVITE_PURPOSE } from "$lib/server/signedToken";
import { checkPasswordPolicy, MIN_PASSWORD_LENGTH } from "$lib/server/auth/password";
import { SYSTEM_ROLE_KEYS } from "$lib/server/roleService";
import { calculateAge } from "$lib/format";

/**
 * Zweiter Schritt der Selbstregistrierung: Zugang anlegen.
 *
 * Vorher standen hier die Kennungen der Gruppen des externen Anbieters fest
 * im Quelltext; es gab keine Pruefung auf eine bereits vergebene E-Mail-
 * Adresse und keine serverseitige Passwortpruefung.
 */

const JOIN_COOKIE_AGE = 30 * 60;

function requireVerifiedInvite(cookies: Parameters<PageServerLoad>[0]["cookies"], memberId: string) {
    const payload = verifySignedToken(cookies.get(`join_verified_${memberId}`), INVITE_PURPOSE);
    if (!payload || payload.memberId !== memberId) {
        throw redirect(303, `/join/${memberId}`);
    }
}

export const load: PageServerLoad = async ({ params, cookies }) => {
    requireVerifiedInvite(cookies, params.id);

    const member = await getMember(params.id);
    if (!member) throw error(404, "Einladung nicht gefunden");

    const age = calculateAge(member.birthday);

    return {
        member: {
            id: params.id,
            firstname: member.firstname,
            lastname: member.lastname
        },
        // Ab 18 ist nur ein eigenständiger Zugang sinnvoll.
        isAdult: age !== null && age >= 18,
        minPasswordLength: MIN_PASSWORD_LENGTH
    };
};

export const actions: Actions = {
    default: async ({ request, params, cookies }) => {
        const memberId = params.id;
        requireVerifiedInvite(cookies, memberId);

        const member = await getMember(memberId);
        if (!member) throw error(404, "Einladung nicht gefunden");

        const form = await request.formData();
        const name = String(form.get("name") ?? "").trim();
        const email = normalizeEmail(String(form.get("email") ?? ""));
        const password = String(form.get("password") ?? "");
        const passwordRepeat = String(form.get("password2") ?? "");
        const requestedType = String(form.get("accountType") ?? "parent");

        const values = { name, email };

        if (!name) return fail(400, { error: "Bitte einen Namen angeben.", ...values });
        if (!email.includes("@")) {
            return fail(400, { error: "Bitte eine gültige E-Mail-Adresse angeben.", ...values });
        }
        if (password !== passwordRepeat) {
            return fail(400, { error: "Die beiden Passwörter stimmen nicht überein.", ...values });
        }

        const policy = checkPasswordPolicy(password, email);
        if (!policy.ok) return fail(400, { error: policy.error, ...values });

        const age = calculateAge(member.birthday);
        const type = age !== null && age >= 18 ? "parent" : requestedType === "child" ? "child" : "parent";
        const roleKey = type === "child" ? SYSTEM_ROLE_KEYS.member : SYSTEM_ROLE_KEYS.parent;

        const result = await createUser({
            name,
            email,
            type,
            password,
            roleKeys: [roleKey],
            memberIds: [memberId],
            status: "active"
        });

        if (!result.ok) {
            // Deckt insbesondere die bereits vergebene E-Mail-Adresse ab,
            // die bisher zu einem doppelten Datensatz gefuehrt hat.
            return fail(400, { error: result.error, ...values });
        }

        cookies.set("join_created_user", "1", {
            path: "/",
            httpOnly: true,
            sameSite: "lax",
            secure: !dev,
            maxAge: JOIN_COOKIE_AGE
        });

        throw redirect(303, `/join/${memberId}/success`);
    }
};
