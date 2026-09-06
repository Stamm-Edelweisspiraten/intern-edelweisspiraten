import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import {
    checkPasswordPolicy,
    hashPassword,
    MIN_PASSWORD_LENGTH,
    verifyPassword
} from "$lib/server/auth/password";
import {
    consumeRecoveryCode,
    createEnrolment,
    generateRecoveryCodes,
    verifyToken
} from "$lib/server/auth/totp";
import {
    listSessionsForUser,
    readSession,
    revokeAllForUser,
    revokeSessionById,
    rotateToken,
    SESSION_COOKIE
} from "$lib/server/auth/session";
import {
    confirmMfa,
    disableMfa,
    getUser,
    startMfaEnrolment,
    updatePasswordHash
} from "$lib/server/userService";
import { getOrganizationSettings } from "$lib/server/settingsService";
import { formatDateTime } from "$lib/format";

/** Eigene Sicherheitseinstellungen: Passwort, Zwei-Faktor, Geräte. */

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw error(401, "Nicht angemeldet");

    const [user, sessions] = await Promise.all([
        getUser(locals.user.id),
        listSessionsForUser(locals.user.id)
    ]);

    return {
        minPasswordLength: MIN_PASSWORD_LENGTH,
        mfaEnabled: user?.mfaEnabled === true,
        mfaRequired: locals.user.requireMfa,
        recoveryCodesLeft: user?.mfaRecoveryCodes?.length ?? 0,
        notice: url.searchParams.get("hinweis"),
        mfaHint: url.searchParams.get("mfa"),
        sessions: sessions.map((session) => ({
            id: session.id,
            device: session.device ?? "Unbekanntes Gerät",
            ip: session.ip ?? "-",
            lastSeenAt: formatDateTime(session.lastSeenAt),
            createdAt: formatDateTime(session.createdAt),
            isCurrent: session.id === locals.session?.id
        }))
    };
};

export const actions: Actions = {
    changePassword: async ({ request, locals, cookies }) => {
        if (!locals.user) throw error(401, "Nicht angemeldet");

        const form = await request.formData();
        const current = String(form.get("current") ?? "");
        const next = String(form.get("password") ?? "");
        const repeat = String(form.get("passwordRepeat") ?? "");

        const user = await getUser(locals.user.id);
        if (!user) throw error(404, "Benutzer nicht gefunden");

        if (!(await verifyPassword(user.passwordHash, current))) {
            return fail(400, { error: "Das aktuelle Passwort ist nicht korrekt." });
        }
        if (next !== repeat) {
            return fail(400, { error: "Die beiden neuen Passwörter stimmen nicht überein." });
        }

        const policy = checkPasswordPolicy(next, user.email);
        if (!policy.ok) return fail(400, { error: policy.error });

        await updatePasswordHash(user.id, await hashPassword(next));

        // Alle anderen Anmeldungen beenden, die eigene erhalten.
        const session = await readSession(cookies.get(SESSION_COOKIE));
        if (session) {
            await revokeAllForUser(user.id, session.tokenHash);
            await rotateToken(session, cookies);
        }

        return { success: "Das Passwort wurde geändert. Alle anderen Geräte wurden abgemeldet." };
    },

    /** Schritt 1 der Einrichtung: Secret erzeugen und QR-Code anzeigen. */
    startMfa: async ({ locals }) => {
        if (!locals.user) throw error(401, "Nicht angemeldet");

        // Der Aussteller erscheint in der Authenticator-App und kommt aus den
        // Organisationseinstellungen -- vorher stand dort bei jedem Stamm
        // derselbe fest verdrahtete Name.
        const organization = await getOrganizationSettings();
        const enrolment = await createEnrolment(locals.user.email, organization.name);
        await startMfaEnrolment(locals.user.id, enrolment.encryptedSecret);

        return {
            enrolment: {
                qrDataUrl: enrolment.qrDataUrl,
                secretBase32: enrolment.secretBase32
            }
        };
    },

    /** Schritt 2: Code bestätigen, danach Wiederherstellungscodes zeigen. */
    confirmMfa: async ({ request, locals }) => {
        if (!locals.user) throw error(401, "Nicht angemeldet");

        const form = await request.formData();
        const code = String(form.get("code") ?? "");

        const user = await getUser(locals.user.id);
        if (!user?.mfaSecret) {
            return fail(400, { error: "Die Einrichtung wurde noch nicht gestartet." });
        }

        if (!verifyToken(user.mfaSecret, code, user.email).valid) {
            return fail(400, { error: "Der Code ist nicht gültig. Bitte erneut versuchen." });
        }

        const { plain, hashed } = generateRecoveryCodes();
        await confirmMfa(user.id, hashed);

        return {
            success: "Die Zwei-Faktor-Authentifizierung ist aktiv.",
            recoveryCodes: plain
        };
    },

    /** Abschalten erfordert Passwort UND gültigen Code. */
    disableMfa: async ({ request, locals }) => {
        if (!locals.user) throw error(401, "Nicht angemeldet");
        if (locals.user.requireMfa) {
            return fail(403, {
                error: "Für deine Rolle ist die Zwei-Faktor-Authentifizierung verpflichtend."
            });
        }

        const form = await request.formData();
        const password = String(form.get("password") ?? "");
        const code = String(form.get("code") ?? "");

        const user = await getUser(locals.user.id);
        if (!user) throw error(404, "Benutzer nicht gefunden");

        if (!(await verifyPassword(user.passwordHash, password))) {
            return fail(400, { error: "Das Passwort ist nicht korrekt." });
        }

        const byToken = user.mfaSecret
            ? verifyToken(user.mfaSecret, code, user.email).valid
            : false;
        const byRecovery =
            !byToken && consumeRecoveryCode(user.mfaRecoveryCodes ?? [], code).valid;

        if (!byToken && !byRecovery) {
            return fail(400, { error: "Der Code ist nicht gültig." });
        }

        await disableMfa(user.id);

        return { success: "Die Zwei-Faktor-Authentifizierung wurde deaktiviert." };
    },

    revokeSession: async ({ request, locals }) => {
        if (!locals.user) throw error(401, "Nicht angemeldet");

        const form = await request.formData();
        const sessionId = String(form.get("sessionId") ?? "");

        if (sessionId === locals.session?.id) {
            return fail(400, {
                error: "Die aktuelle Sitzung kann hier nicht beendet werden. Nutze dafür „Abmelden“."
            });
        }

        await revokeSessionById(sessionId, locals.user.id);
        return { success: "Die Sitzung wurde beendet." };
    },

    revokeOthers: async ({ locals, cookies }) => {
        if (!locals.user) throw error(401, "Nicht angemeldet");

        const session = await readSession(cookies.get(SESSION_COOKIE));
        const count = await revokeAllForUser(locals.user.id, session?.tokenHash);

        return { success: `${count} andere Sitzungen wurden beendet.` };
    }
};
