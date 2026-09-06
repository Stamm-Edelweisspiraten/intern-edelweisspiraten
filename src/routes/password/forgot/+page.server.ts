import { fail } from "@sveltejs/kit";
import type { Actions } from "./$types";
import { env } from "$env/dynamic/private";
import { getUserByEmail, normalizeEmail } from "$lib/server/userService";
import { emailHash, issueToken } from "$lib/server/auth/passwordReset";
import { RATE_LIMITS, rateLimitKey, registerFailure, checkRateLimit } from "$lib/server/auth/rateLimit";
import { sendEmail } from "$lib/server/emailService";
import { passwordResetTemplate } from "$lib/server/emailTemplates/passwordReset";
import { getOrganizationSettings } from "$lib/server/settingsService";

/**
 * Anforderung eines Links zum Zuruecksetzen des Passworts.
 *
 * Die Antwort ist immer identisch, unabhaengig davon, ob die Adresse
 * existiert -- sonst waere die Seite ein Verzeichnis gueltiger Adressen.
 */

const CONFIRMATION =
    "Wenn ein Zugang mit dieser E-Mail-Adresse existiert, wurde eine Nachricht mit dem weiteren Vorgehen verschickt.";

export const actions: Actions = {
    default: async ({ request, getClientAddress, url }) => {
        const form = await request.formData();
        const email = normalizeEmail(String(form.get("email") ?? ""));

        if (!email.includes("@")) {
            return fail(400, { error: "Bitte eine gültige E-Mail-Adresse angeben." });
        }

        const ipKey = rateLimitKey.ip(`reset:${getClientAddress()}`);
        const mailKey = rateLimitKey.reset(emailHash(email));

        const ipCheck = await checkRateLimit(ipKey, RATE_LIMITS.passwordResetPerIp);
        const mailCheck = await checkRateLimit(mailKey, RATE_LIMITS.passwordResetPerEmail);

        if (!ipCheck.allowed || !mailCheck.allowed) {
            // Auch hier keine unterschiedliche Aussage nach aussen.
            return { success: true, message: CONFIRMATION };
        }

        await registerFailure(ipKey, RATE_LIMITS.passwordResetPerIp);
        await registerFailure(mailKey, RATE_LIMITS.passwordResetPerEmail);

        const user = await getUserByEmail(email);

        if (user && user.status !== "disabled") {
            try {
                const { token } = await issueToken(user.id, "reset");
                const base = env.PUBLIC_APP_URL || url.origin;
                const link = `${base}/password/reset/${token}`;

                const organization = await getOrganizationSettings();

                await sendEmail({
                    to: user.email,
                    subject: `Passwort zurücksetzen – ${organization.name}`,
                    html: passwordResetTemplate(user.name, link, 2, organization.name)
                });
            } catch (err) {
                // Der Versand darf nach aussen nichts verraten, muss aber
                // fuer den Betrieb sichtbar sein.
                console.error("Passwort-Mail konnte nicht versendet werden:", err);
            }
        }

        return { success: true, message: CONFIRMATION };
    }
};
