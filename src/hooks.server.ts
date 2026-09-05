import { redirect, type Handle, type ServerInit } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { resolvePermissions } from "$lib/server/permissionService";
import { matchesPermission } from "$lib/permissions/match";
import { ensureIndexes } from "$lib/server/db/indexes";
import { ensureDefaultRoles } from "$lib/server/roleService";
import { ensureBootstrapAdmin } from "$lib/server/auth/bootstrap";
import { readSession, revokeSession, SESSION_COOKIE, touchSession } from "$lib/server/auth/session";
import { users, roles } from "$lib/server/db/collections";
import { parseTheme, THEME_COOKIE } from "$lib/theme";

/** Einmalig beim Start: Indizes, Systemrollen und ggf. der erste Zugang. */
export const init: ServerInit = async () => {
    await ensureIndexes();
    await ensureDefaultRoles();
    await ensureBootstrapAdmin();
};

/** Routen, die ohne Anmeldung erreichbar sind. */
const PUBLIC_PREFIXES = ["/login", "/join", "/password", "/setup", "/logout"];

/** Auch mit angemeldeter, aber noch nicht per zweitem Faktor bestätigter Sitzung. */
const MFA_PENDING_ALLOWED = ["/login/2fa", "/logout"];

export const handle: Handle = async ({ event, resolve }) => {
    const theme = parseTheme(event.cookies.get(THEME_COOKIE));
    event.locals.theme = theme;
    event.locals.user = null;
    event.locals.session = null;
    event.locals.impersonator = null;
    event.locals.permissions = [];

    const token = event.cookies.get(SESSION_COOKIE);
    const session = await readSession(token);

    if (session) {
        const user = await users().findOne({ _id: session.userId });

        if (!user || user.status !== "active") {
            // Gesperrter oder geloeschter Zugang: Sitzung sofort beenden.
            await revokeSession(token, event.cookies);
        } else {
            const { permissions, requireMfa } = await resolvePermissions(user.roleIds ?? []);
            const roleDocs = await roles()
                .find({ _id: { $in: user.roleIds ?? [] } })
                .toArray();
            const roleKeys = roleDocs.map((role) => role.key);
            const userId = user._id!.toString();

            event.locals.user = {
                id: userId,
                email: user.email,
                name: user.name,
                type: user.type,
                roleKeys,
                memberIds: (user.memberIds ?? []).map(String),
                mfaEnabled: user.mfa?.enabled === true,
                requireMfa,
                // Beibehalten, damit bestehende Aufrufer unveraendert weiterlaufen.
                sub: userId,
                userinfo: { email: user.email, name: user.name, groups: roleKeys }
            };

            event.locals.session = {
                id: session._id!.toString(),
                mfaSatisfied: session.mfaSatisfied,
                expiresAt: session.expiresAt
            };

            event.locals.impersonator = session.impersonation
                ? {
                      id: session.impersonation.originalUserId.toString(),
                      name: session.impersonation.originalUserName,
                      email: session.impersonation.originalUserEmail
                  }
                : null;

            event.locals.permissions = permissions;

            await touchSession(session, event.cookies);
        }
    }

    const path = event.url.pathname;
    const isPublic =
        PUBLIC_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)) ||
        (dev && path.startsWith("/dev"));

    if (!event.locals.user) {
        if (!isPublic) throw redirect(302, "/login");
        return render(event, resolve, theme);
    }

    // Zweiter Faktor steht noch aus: nur die Bestätigungsseite ist erreichbar.
    if (event.locals.session && !event.locals.session.mfaSatisfied) {
        if (!MFA_PENDING_ALLOWED.some((prefix) => path.startsWith(prefix))) {
            throw redirect(302, "/login/2fa");
        }
        return render(event, resolve, theme);
    }

    // Rollen mit erhöhten Rechten müssen 2FA eingerichtet haben.
    if (
        event.locals.user.requireMfa &&
        !event.locals.user.mfaEnabled &&
        !path.startsWith("/intern/profil/sicherheit") &&
        !path.startsWith("/logout") &&
        path.startsWith("/intern")
    ) {
        throw redirect(302, "/intern/profil/sicherheit?mfa=erforderlich");
    }

    if (path.startsWith("/login") || path === "/setup") {
        throw redirect(302, "/intern/dashboard");
    }

    if (path.startsWith("/intern/admin") && !matchesPermission(event.locals.permissions, "admin.view")) {
        throw redirect(302, "/intern/dashboard");
    }

    return render(event, resolve, theme);
};

function render(
    event: Parameters<Handle>[0]["event"],
    resolve: Parameters<Handle>[0]["resolve"],
    theme: string
) {
    return resolve(event, {
        transformPageChunk: ({ html }) =>
            html.replace("%ep.theme%", theme === "dark" ? "dark" : "")
    });
}
