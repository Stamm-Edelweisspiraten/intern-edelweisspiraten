import { fail, redirect } from "@sveltejs/kit";
import { ObjectId } from "mongodb";
import type { Actions, PageServerLoad } from "./$types";
import { users } from "$lib/server/db/collections";
import { consumeRecoveryCode, verifyToken } from "$lib/server/auth/totp";
import { markMfaSatisfied, readSession, revokeSession, SESSION_COOKIE } from "$lib/server/auth/session";
import { RATE_LIMITS, rateLimitKey, registerFailure, clearRateLimit } from "$lib/server/auth/rateLimit";

/** Zweiter Schritt der Anmeldung: Code aus der Authenticator-App. */

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw redirect(302, "/login");
    if (locals.session?.mfaSatisfied) throw redirect(302, "/intern/dashboard");

    return {
        email: locals.user.email,
        redirectTo: sanitizeRedirect(url.searchParams.get("weiter"))
    };
};

export const actions: Actions = {
    verify: async ({ request, cookies, locals }) => {
        if (!locals.user || !locals.session) throw redirect(302, "/login");

        const form = await request.formData();
        const code = String(form.get("code") ?? "").trim();
        const redirectTo = sanitizeRedirect(String(form.get("redirectTo") ?? ""));

        if (!code) {
            return fail(400, { error: "Bitte den Code aus deiner Authenticator-App eingeben." });
        }

        const limitKey = rateLimitKey.mfa(locals.session.id);
        const attempt = await registerFailure(limitKey, RATE_LIMITS.mfa);
        if (!attempt.allowed && attempt.remaining === 0) {
            // Nach zu vielen Fehlversuchen wird die halbfertige Sitzung beendet.
            await revokeSession(cookies.get(SESSION_COOKIE), cookies);
            await clearRateLimit(limitKey);
            throw redirect(303, "/login?hinweis=zu-viele-versuche");
        }

        const user = await users().findOne({ _id: new ObjectId(locals.user.id) });
        if (!user?.mfa?.enabled || !user.mfa.secret) {
            throw redirect(302, "/intern/dashboard");
        }

        // Zuerst als TOTP prüfen, sonst als Wiederherstellungscode.
        const totp = verifyToken(user.mfa.secret, code, user.email);
        let accepted = totp.valid;

        if (!accepted && code.includes("-")) {
            const recovery = consumeRecoveryCode(user.mfa.recoveryCodes ?? [], code);
            if (recovery.valid) {
                accepted = true;
                await users().updateOne(
                    { _id: user._id },
                    { $set: { "mfa.recoveryCodes": recovery.remaining } }
                );
            }
        }

        if (!accepted) {
            return fail(400, {
                error: `Der Code ist nicht gültig. Noch ${attempt.remaining} Versuche.`
            });
        }

        const session = await readSession(cookies.get(SESSION_COOKIE));
        if (!session) throw redirect(302, "/login");

        await markMfaSatisfied(session, cookies);
        await clearRateLimit(limitKey);

        throw redirect(303, redirectTo || "/intern/dashboard");
    },

    abbrechen: async ({ cookies }) => {
        await revokeSession(cookies.get(SESSION_COOKIE), cookies);
        throw redirect(303, "/login");
    }
};

function sanitizeRedirect(value: string | null): string {
    if (!value) return "";
    if (!value.startsWith("/") || value.startsWith("//")) return "";
    return value;
}
