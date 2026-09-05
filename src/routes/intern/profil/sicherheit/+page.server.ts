import { error, fail } from "@sveltejs/kit";
import { ObjectId } from "mongodb";
import type { Actions, PageServerLoad } from "./$types";
import { users } from "$lib/server/db/collections";
import { checkPasswordPolicy, hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "$lib/server/auth/password";
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
import { formatDateTime } from "$lib/format";

/** Eigene Sicherheitseinstellungen: Passwort, Zwei-Faktor, Geräte. */

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw error(401, "Nicht angemeldet");

    const userId = new ObjectId(locals.user.id);
    const [user, sessions] = await Promise.all([
        users().findOne({ _id: userId }),
        listSessionsForUser(userId)
    ]);

    return {
        minPasswordLength: MIN_PASSWORD_LENGTH,
        mfaEnabled: user?.mfa?.enabled === true,
        mfaRequired: locals.user.requireMfa,
        recoveryCodesLeft: user?.mfa?.recoveryCodes?.length ?? 0,
        notice: url.searchParams.get("hinweis"),
        mfaHint: url.searchParams.get("mfa"),
        sessions: sessions.map((session) => ({
            id: session._id!.toString(),
            device: session.device ?? "Unbekanntes Gerät",
            ip: session.ip ?? "-",
            lastSeenAt: formatDateTime(session.lastSeenAt),
            createdAt: formatDateTime(session.createdAt),
            isCurrent: session._id!.toString() === locals.session?.id
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

        const userId = new ObjectId(locals.user.id);
        const user = await users().findOne({ _id: userId });
        if (!user) throw error(404, "Benutzer nicht gefunden");

        if (!(await verifyPassword(user.passwordHash, current))) {
            return fail(400, { error: "Das aktuelle Passwort ist nicht korrekt." });
        }
        if (next !== repeat) {
            return fail(400, { error: "Die beiden neuen Passwörter stimmen nicht überein." });
        }

        const policy = checkPasswordPolicy(next, user.email);
        if (!policy.ok) return fail(400, { error: policy.error });

        await users().updateOne(
            { _id: userId },
            {
                $set: {
                    passwordHash: await hashPassword(next),
                    passwordChangedAt: new Date(),
                    updatedAt: new Date()
                }
            }
        );

        // Alle anderen Anmeldungen beenden, die eigene erhalten.
        const session = await readSession(cookies.get(SESSION_COOKIE));
        if (session) {
            await revokeAllForUser(userId, session.tokenHash);
            await rotateToken(session, cookies);
        }

        return { success: "Das Passwort wurde geändert. Alle anderen Geräte wurden abgemeldet." };
    },

    /** Schritt 1 der Einrichtung: Secret erzeugen und QR-Code anzeigen. */
    startMfa: async ({ locals }) => {
        if (!locals.user) throw error(401, "Nicht angemeldet");

        const enrolment = await createEnrolment(locals.user.email);

        await users().updateOne(
            { _id: new ObjectId(locals.user.id) },
            {
                $set: {
                    mfa: { enabled: false, secret: enrolment.encryptedSecret, recoveryCodes: [] },
                    updatedAt: new Date()
                }
            }
        );

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

        const userId = new ObjectId(locals.user.id);
        const user = await users().findOne({ _id: userId });

        if (!user?.mfa?.secret) {
            return fail(400, { error: "Die Einrichtung wurde noch nicht gestartet." });
        }

        if (!verifyToken(user.mfa.secret, code, user.email).valid) {
            return fail(400, { error: "Der Code ist nicht gültig. Bitte erneut versuchen." });
        }

        const { plain, hashed } = generateRecoveryCodes();

        await users().updateOne(
            { _id: userId },
            {
                $set: {
                    "mfa.enabled": true,
                    "mfa.confirmedAt": new Date(),
                    "mfa.recoveryCodes": hashed,
                    updatedAt: new Date()
                }
            }
        );

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

        const userId = new ObjectId(locals.user.id);
        const user = await users().findOne({ _id: userId });
        if (!user) throw error(404, "Benutzer nicht gefunden");

        if (!(await verifyPassword(user.passwordHash, password))) {
            return fail(400, { error: "Das Passwort ist nicht korrekt." });
        }

        const byToken = user.mfa?.secret
            ? verifyToken(user.mfa.secret, code, user.email).valid
            : false;
        const byRecovery = !byToken && consumeRecoveryCode(user.mfa?.recoveryCodes ?? [], code).valid;

        if (!byToken && !byRecovery) {
            return fail(400, { error: "Der Code ist nicht gültig." });
        }

        await users().updateOne(
            { _id: userId },
            { $set: { mfa: { enabled: false }, updatedAt: new Date() } }
        );

        return { success: "Die Zwei-Faktor-Authentifizierung wurde deaktiviert." };
    },

    revokeSession: async ({ request, locals }) => {
        if (!locals.user) throw error(401, "Nicht angemeldet");

        const form = await request.formData();
        const sessionId = String(form.get("sessionId") ?? "");

        if (sessionId === locals.session?.id) {
            return fail(400, { error: "Die aktuelle Sitzung kann hier nicht beendet werden. Nutze dafür „Abmelden“." });
        }

        await revokeSessionById(sessionId, new ObjectId(locals.user.id));
        return { success: "Die Sitzung wurde beendet." };
    },

    revokeOthers: async ({ locals, cookies }) => {
        if (!locals.user) throw error(401, "Nicht angemeldet");

        const session = await readSession(cookies.get(SESSION_COOKIE));
        const count = await revokeAllForUser(new ObjectId(locals.user.id), session?.tokenHash);

        return { success: `${count} andere Sitzungen wurden beendet.` };
    }
};
