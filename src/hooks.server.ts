import { error, redirect, type Handle, type HandleServerError, type ServerInit } from "@sveltejs/kit";
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
    "/intern/termine/kalender.ics",
    /*
     * Eine Umfrage, die extern freigegeben ist: der Link traegt ein Token, und
     * wer ihn bekommt, soll ohne Zugang antworten koennen (Elternabend,
     * Anmeldung, Rueckfrage an Ehemalige).
     *
     * Der Praefixvergleich unten deckt `/umfrage/<token>` und alles darunter
     * mit ab. Bewusst auf oberster Ebene und NICHT unter `/intern/umfragen`:
     * dort erzwingt `routeGuards.test.ts` fuer jede Aktion einen Guard aus
     * `permissionGuard.ts`, und eine Ausnahme wuerde diese Regel fuer das
     * ganze Modul aufweichen. Hier gibt es keine Sitzung, gegen die ein Guard
     * pruefen koennte -- die Route prueft das Token selbst.
     */
    "/umfrage"
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

    /*
     * Umleitungen auf das Dashboard nur, wenn der Zugang es auch sehen darf.
     *
     * Sonst entsteht eine Schleife: /intern/dashboard prueft dashboard.view,
     * wirft 403, und die Fehlerseite unmountet die interne Huelle samt
     * Sidebar -- dort sitzt der einzige Abmelde-Knopf. Wer dashboard.view
     * nicht hat, kaeme aus diesem Zustand nicht mehr heraus. Ein 403 fuehrt
     * dagegen auf die Fehlerseite, die ein eigenes Abmelde-Formular traegt.
     */
    if (path.startsWith("/login") || path === "/setup") {
        if (canSeeDashboard(event)) throw redirect(302, "/intern/dashboard");
        throw error(
            403,
            "Du bist bereits angemeldet, dieser Zugang hat aber keinen Zugriff auf das Dashboard."
        );
    }

    if (
        path.startsWith("/intern/admin") &&
        !matchesPermission(event.locals.permissions, "admin.view")
    ) {
        if (canSeeDashboard(event)) throw redirect(302, "/intern/dashboard");
        throw error(403, "Kein Zugriff auf den Verwaltungsbereich.");
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

/** Darf dieser Zugang das Dashboard sehen? Ziel jeder internen Umleitung. */
function canSeeDashboard(event: Parameters<Handle>[0]["event"]): boolean {
    return matchesPermission(event.locals.permissions, "dashboard.view");
}

/**
 * Zentrale Fehlerbehandlung.
 *
 * Jeder Fehler bekommt eine Korrelations-ID. Sie steht im Protokoll und wird
 * dem Benutzer auf der Fehlerseite angezeigt -- damit laesst sich eine
 * Meldung ohne Ratespiel dem passenden Protokolleintrag zuordnen.
 *
 * Erwartete Fehler (4xx, also alles aus error()) sind Ablaeufe, keine
 * Stoerungen: sie werden protokolliert, aber nicht als Fehler. Nur bei 5xx
 * landet die Ausnahme selbst samt Aufrufliste im Protokoll.
 */
/**
 * Pfade, in denen ein Geheimnis steckt -- der Protokolleintrag kuerzt sie.
 *
 * Bei `/umfrage/<token>` IST der Pfad der Ausweis: wer ihn hat, darf
 * antworten. Ungekuerzt schriebe jede 404 auf einen abgelaufenen Link ein
 * benutzbares Token im Klartext ins Serverprotokoll -- und Protokolle wandern
 * in Sammelsysteme, Sicherungen und Fehlerberichte. Fuer die Fehlersuche
 * genuegt der Hinweis, DASS es eine Umfrage war.
 */
const SECRET_PATHS = [{ prefix: "/umfrage/", replacement: "/umfrage/[token]" }];

function redactPath(path: string): string {
    for (const entry of SECRET_PATHS) {
        if (path.startsWith(entry.prefix)) return entry.replacement;
    }
    return path;
}

export const handleError: HandleServerError = ({ error: caught, event, status, message }) => {
    const id = crypto.randomUUID();

    /*
     * Alles hier drin laeuft in einem try/catch -- und zwar aus einem Grund,
     * der Stunden gekostet hat: wirft `handleError` selbst, verwirft SvelteKit
     * den urspruenglichen Fehler KOMMENTARLOS und liefert eine nackte 500
     * "Internal Error". Im Protokoll steht dann gar nichts, und der eigentliche
     * Fehler ist nicht mehr zu ermitteln. Ein Fehlerbehandler, der selbst
     * ausfallen kann, ist schlimmer als keiner.
     *
     * Die Ausnahme wird deshalb ZUERST roh ausgegeben; alles Weitere ist Kuer.
     */
    try {
        console.error(`Serverfehler [${id}]:`, caught);
    } catch {
        // Selbst das darf den Ablauf nicht anhalten.
    }

    try {
        const entry = {
            id,
            status,
            method: event.request.method,
            path: redactPath(event.url.pathname),
            userId: event.locals.user?.id ?? null,
            apiTokenId: event.locals.apiToken?.id ?? null,
            message
        };

        if (status >= 400 && status < 500) {
            console.warn("Abgewiesen:", JSON.stringify(entry));
        } else {
            console.error("Serverfehler:", JSON.stringify(entry));
        }
    } catch (err) {
        console.error(`Protokolleintrag fehlgeschlagen [${id}]:`, err);
    }

    // `id` steht in App.Error (src/app.d.ts) -- die Fehlerseite zeigt sie
    // als Kennung fuer Rueckfragen an.
    return { message, id };
};
