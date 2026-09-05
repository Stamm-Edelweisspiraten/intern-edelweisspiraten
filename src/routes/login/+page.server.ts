import { fail, redirect } from "@sveltejs/kit";
import { ObjectId } from "mongodb";
import type { Actions, PageServerLoad } from "./$types";
import { users } from "$lib/server/db/collections";
import { normalizeEmail } from "$lib/server/userService";
import { verifyDummy, verifyPassword } from "$lib/server/auth/password";
import { createSession } from "$lib/server/auth/session";
import {
    clearRateLimit,
    RATE_LIMITS,
    rateLimitKey,
    registerFailure,
    checkRateLimit
} from "$lib/server/auth/rateLimit";
import { lockoutDuration } from "$lib/server/auth/rateLimit";
import { hasAnyActiveUser } from "$lib/server/auth/bootstrap";

/**
 * Anmeldung gegen die eigene Datenbank.
 *
 * Vorher fuehrte /login lediglich auf einen externen Anbieter weiter; ein
 * Passwortfeld gab es in der gesamten Anwendung nur im Registrierungsformular.
 */

/** Einheitliche Meldung, damit nicht ablesbar ist, ob es das Konto gibt. */
const GENERIC_ERROR = "E-Mail-Adresse oder Passwort ist falsch.";

export const load: PageServerLoad = async ({ url }) => {
    return {
        // Solange kein Zugang existiert, wird auf die Ersteinrichtung hingewiesen.
        needsSetup: !(await hasAnyActiveUser()),
        redirectTo: sanitizeRedirect(url.searchParams.get("weiter")),
        notice: url.searchParams.get("hinweis")
    };
};

export const actions: Actions = {
    default: async ({ request, cookies, getClientAddress, url }) => {
        const form = await request.formData();
        const email = normalizeEmail(String(form.get("email") ?? ""));
        const password = String(form.get("password") ?? "");
        const redirectTo = sanitizeRedirect(String(form.get("redirectTo") ?? ""));

        if (!email || !password) {
            return fail(400, { error: "Bitte E-Mail-Adresse und Passwort eingeben.", email });
        }

        const ip = getClientAddress();
        const ipKey = rateLimitKey.ip(ip);

        // Vorabpruefung pro IP-Adresse, bevor ueberhaupt gerechnet wird.
        const ipCheck = await checkRateLimit(ipKey, RATE_LIMITS.loginPerIp);
        if (!ipCheck.allowed) {
            return fail(429, {
                error: `Zu viele Anmeldeversuche. Bitte in ${Math.ceil(ipCheck.retryAfterSeconds / 60)} Minuten erneut versuchen.`,
                email
            });
        }

        const user = await users().findOne({ email });

        if (!user) {
            // Vergleichsberechnung, damit die Antwortzeit nichts verraet.
            await verifyDummy(password);
            await registerFailure(ipKey, RATE_LIMITS.loginPerIp);
            return fail(400, { error: GENERIC_ERROR, email });
        }

        if (user.lockedUntil && user.lockedUntil > new Date()) {
            const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
            return fail(429, {
                error: `Das Konto ist vorübergehend gesperrt. Bitte in ${minutes} Minuten erneut versuchen.`,
                email
            });
        }

        if (user.status === "disabled") {
            return fail(403, {
                error: "Dieser Zugang wurde deaktiviert. Bitte wende dich an die Administration.",
                email
            });
        }

        if (!user.passwordHash) {
            return fail(400, {
                error:
                    "Für diesen Zugang wurde noch kein Passwort vergeben. Bitte nutze „Passwort vergessen“, um eines festzulegen.",
                email
            });
        }

        const valid = await verifyPassword(user.passwordHash, password);

        if (!valid) {
            await registerFailure(ipKey, RATE_LIMITS.loginPerIp);
            await registerFailedLogin(user._id!, (user.failedLoginAttempts ?? 0) + 1);
            return fail(400, { error: GENERIC_ERROR, email });
        }

        // Erfolgreich: Zaehler zuruecksetzen.
        await users().updateOne(
            { _id: user._id },
            {
                $set: {
                    failedLoginAttempts: 0,
                    lockedUntil: null,
                    lastLoginAt: new Date()
                }
            }
        );
        await clearRateLimit(ipKey);

        const mfaRequired = user.mfa?.enabled === true;

        await createSession(cookies, {
            userId: user._id!,
            ip,
            userAgent: request.headers.get("user-agent"),
            mfaSatisfied: !mfaRequired
        });

        if (mfaRequired) {
            const target = redirectTo ? `?weiter=${encodeURIComponent(redirectTo)}` : "";
            throw redirect(303, `/login/2fa${target}`);
        }

        throw redirect(303, redirectTo || "/intern/dashboard");
    }
};

async function registerFailedLogin(userId: ObjectId, attempts: number): Promise<void> {
    const duration = lockoutDuration(attempts);
    await users().updateOne(
        { _id: userId },
        {
            $set: {
                failedLoginAttempts: attempts,
                lockedUntil: duration > 0 ? new Date(Date.now() + duration) : null
            }
        }
    );
}

/** Nur anwendungsinterne Ziele zulassen, keine offene Weiterleitung. */
function sanitizeRedirect(value: string | null): string {
    if (!value) return "";
    if (!value.startsWith("/") || value.startsWith("//")) return "";
    return value;
}
