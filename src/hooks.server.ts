import { redirect, type Handle, type ServerInit } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { resolveGrants } from "$lib/server/permissionService";
import { matchesPermission } from "$lib/permissions/match";
import { ensureDefaultRoles } from "$lib/server/roleService";
import { ensureBootstrapAdmin } from "$lib/server/auth/bootstrap";
import { readSession, revokeSession, SESSION_COOKIE, touchSession } from "$lib/server/auth/session";
import { getUser } from "$lib/server/userService";
import { getRolesByIds } from "$lib/server/roleService";
import { startMaintenance } from "$lib/server/startup";
import { handleApiRequest } from "$lib/server/api/handle";
import { parseTheme, THEME_COOKIE } from "$lib/theme";

/**
 * Einmalig beim Start: Systemrollen, ggf. der erste Zugang, Wartungslauf.
 *
 * Die Indizes werden nicht mehr hier erzeugt -- sie stehen im Schema und
 * kommen ueber die Migrationen. Die Migrationen selbst laufen ausserhalb der
 * Anwendung (npm run db:migrate bzw. beim Start des Containers), damit nicht
 * mehrere Instanzen gleichzeitig am Schema arbeiten.
 */
export const init: ServerInit = async () => {
    try {
        await ensureDefaultRoles();
        await ensureBootstrapAdmin();
    } catch (err) {
        console.error("Start unvollstaendig:", err);
    }
    startMaintenance();
};

/**
 * Routen, die ohne Anmeldung erreichbar sind.
 *
 * Der Kalenderabruf gehoert dazu, weil ein Kalenderprogramm sich nicht
 * anmelden kann: statt der Sitzung zaehlt dort ein persoenliches Token im
 * Abfrageteil der Adresse. Ohne diesen Eintrag liefe der Abruf in die
 * Weiterleitung auf /login und das Programm bekaeme eine HTML-Seite mit
 * Status 200 statt eines Fehlers.
 */
const PUBLIC_PREFIXES = [
    "/login",
    "/join",
    "/password",
    "/setup",
    "/logout",
    "/intern/termine/kalender.ics"
];

/** Auch mit angemeldeter, aber noch nicht per zweitem Faktor bestätigter Sitzung. */
const MFA_PENDING_ALLOWED = ["/login/2fa", "/logout"];

export const handle: Handle = async ({ event, resolve }) => {
    const theme = parseTheme(event.cookies.get(THEME_COOKIE));
    event.locals.theme = theme;
    event.locals.user = null;
    event.locals.session = null;
    event.locals.impersonator = null;
    event.locals.permissions = [];
    event.locals.grants = [];
    event.locals.apiToken = null;

    /**
     * Die REST-API wird VOR dem HTML-Gate abgezweigt.
     *
     * Ohne diesen Abzweig liefe jeder Zugriff eines Fremdsystems in die
     * Weiterleitung auf /login und bekaeme eine HTML-Seite statt einer
     * Fehlermeldung -- mit Status 200, was jede Fehlerbehandlung auf der
     * Gegenseite unbrauchbar macht.
     */
    if (event.url.pathname === "/api" || event.url.pathname.startsWith("/api/")) {
        return handleApiRequest(event, resolve);
    }

    const token = event.cookies.get(SESSION_COOKIE);
    const session = await readSession(token);

    if (session) {
        const user = await getUser(session.userId);

        if (!user || user.status !== "active") {
            // Gesperrter oder geloeschter Zugang: Sitzung sofort beenden.
            await revokeSession(token, event.cookies);
        } else {
            const { grants, permissions, requireMfa } = await resolveGrants({
                userId: user.id,
                memberIds: user.memberIds
            });
            const roleDocs = await getRolesByIds(user.roleIds);
            const roleKeys = roleDocs.map((role) => role.key);

            event.locals.user = {
                id: user.id,
                email: user.email,
                name: user.name,
                type: user.type,
                roleKeys,
                memberIds: user.memberIds,
                mfaEnabled: user.mfaEnabled,
                requireMfa,
                // Beibehalten, damit bestehende Aufrufer unveraendert weiterlaufen.
                sub: user.id,
                userinfo: { email: user.email, name: user.name, groups: roleKeys }
            };

            event.locals.session = {
                id: session.id,
                mfaSatisfied: session.mfaSatisfied,
                expiresAt: session.expiresAt
            };

            event.locals.impersonator = session.impersonationUserId
                ? {
                      id: session.impersonationUserId,
                      name: session.impersonationUserName ?? "",
                      email: session.impersonationUserEmail ?? ""
                  }
                : null;

            event.locals.permissions = permissions;
            event.locals.grants = grants;

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

    if (
        path.startsWith("/intern/admin") &&
        !matchesPermission(event.locals.permissions, "admin.view")
    ) {
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
