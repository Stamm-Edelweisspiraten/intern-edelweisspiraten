import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { consumeToken, lookupToken } from "$lib/server/auth/passwordReset";
import { checkPasswordPolicy, MIN_PASSWORD_LENGTH } from "$lib/server/auth/password";
import { setPassword } from "$lib/server/userService";

/** Vergabe eines neuen Passworts ueber den zugesandten Link. */

export const load: PageServerLoad = async ({ params }) => {
    const lookup = await lookupToken(params.token);

    return {
        valid: lookup.valid,
        name: lookup.user?.name ?? "",
        minPasswordLength: MIN_PASSWORD_LENGTH
    };
};

export const actions: Actions = {
    default: async ({ request, params }) => {
        const form = await request.formData();
        const password = String(form.get("password") ?? "");
        const passwordRepeat = String(form.get("passwordRepeat") ?? "");

        // Token wird bei jedem Versuch neu geprueft, nicht aus dem load
        // uebernommen.
        const lookup = await lookupToken(params.token);
        if (!lookup.valid || !lookup.user?._id || !lookup.tokenHash) {
            return fail(400, {
                error: "Dieser Link ist nicht mehr gültig. Bitte fordere einen neuen an."
            });
        }

        if (password !== passwordRepeat) {
            return fail(400, { error: "Die beiden Passwörter stimmen nicht überein." });
        }

        const policy = checkPasswordPolicy(password, lookup.user.email);
        if (!policy.ok) {
            return fail(400, { error: policy.error });
        }

        // Erst entwerten, dann setzen: so kann derselbe Link nicht zweimal
        // parallel verwendet werden.
        const consumed = await consumeToken(lookup.tokenHash);
        if (!consumed) {
            return fail(400, { error: "Dieser Link wurde bereits verwendet." });
        }

        // setPassword beendet zugleich alle bestehenden Sitzungen.
        await setPassword(lookup.user._id.toString(), password);

        throw redirect(303, "/login?hinweis=passwort-geaendert");
    }
};
