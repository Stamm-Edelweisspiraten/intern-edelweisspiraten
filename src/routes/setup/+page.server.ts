import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { hasAnyActiveUser } from "$lib/server/auth/bootstrap";
import { checkPasswordPolicy, MIN_PASSWORD_LENGTH } from "$lib/server/auth/password";
import { createUser, normalizeEmail } from "$lib/server/userService";
import { ensureDefaultRoles, getRoleByKey, SYSTEM_ROLE_KEYS } from "$lib/server/roleService";
import { createSession } from "$lib/server/auth/session";

/**
 * Ersteinrichtung: legt den ersten Zugang mit Administrationsrechten an.
 *
 * Erreichbar ausschliesslich, solange ueberhaupt kein anmeldefaehiger Zugang
 * existiert. Danach antwortet die Route dauerhaft mit 404 -- ohne diese
 * Sperre waere sie eine offene Tuer.
 */

export const load: PageServerLoad = async () => {
    if (await hasAnyActiveUser()) {
        throw error(404, "Nicht gefunden");
    }
    return { minPasswordLength: MIN_PASSWORD_LENGTH };
};

export const actions: Actions = {
    default: async ({ request, cookies, getClientAddress }) => {
        if (await hasAnyActiveUser()) {
            throw error(404, "Nicht gefunden");
        }

        const form = await request.formData();
        const name = String(form.get("name") ?? "").trim();
        const email = normalizeEmail(String(form.get("email") ?? ""));
        const password = String(form.get("password") ?? "");
        const passwordRepeat = String(form.get("passwordRepeat") ?? "");

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

        await ensureDefaultRoles();
        const adminRole = await getRoleByKey(SYSTEM_ROLE_KEYS.admin);
        if (!adminRole?._id) {
            return fail(500, { error: "Die Administrationsrolle konnte nicht angelegt werden.", ...values });
        }

        const result = await createUser({
            name,
            email,
            password,
            roleIds: [adminRole._id],
            status: "active"
        });

        if (!result.ok || !result.user?._id) {
            return fail(400, { error: result.error ?? "Der Zugang konnte nicht angelegt werden.", ...values });
        }

        // Direkt anmelden; die Einrichtung von 2FA folgt im Profil.
        await createSession(cookies, {
            userId: result.user._id,
            ip: getClientAddress(),
            userAgent: request.headers.get("user-agent"),
            mfaSatisfied: true
        });

        throw redirect(303, "/intern/profil/sicherheit?hinweis=ersteinrichtung");
    }
};
