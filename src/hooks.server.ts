import { redirect, type Handle, type ServerInit } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { getPermissionsForUser } from "$lib/server/permissionService";
import { matchesPermission } from "$lib/permissions/match";
import { verifySignedSession } from "$lib/server/session";
import { ensureIndexes } from "$lib/server/db/indexes";
import { parseTheme, THEME_COOKIE } from "$lib/theme";
import { db } from "$lib/server/mongo";

/** Einmalig beim Start: Indizes sicherstellen. */
export const init: ServerInit = async () => {
    await ensureIndexes();
};

export const handle: Handle = async ({ event, resolve }) => {
    const raw = event.cookies.get("session");

    const session = verifySignedSession(raw ?? undefined);

    if (session) {
        let memberIds: string[] = [];
        if (session.email) {
            const normalizedEmail = session.email.toLowerCase?.() ?? session.email;
            const userDoc = await db.collection("users").findOne({
                email: { $in: [session.email, normalizedEmail] }
            });
            if (userDoc?.memberIds) {
                memberIds = (userDoc.memberIds as any[])
                    .map((id: any) => id?.toString?.() ?? id)
                    .filter(Boolean);
            }
        }
        if (session.memberId) {
            memberIds = Array.from(
                new Set(
                    [session.memberId, ...memberIds]
                        .map((id) => id?.toString?.() ?? id)
                        .filter(Boolean)
                )
            );
        }

        event.locals.user = {
            userinfo: {
                email: session.email,
                name: session.name,
                groups: (session.groups ?? []).map((g) => g.toLowerCase())
            },
            sub: session.sub,
            memberId: session.memberId,
            memberIds
        };
        event.locals.impersonator = session.impersonator ?? null;
    } else {
        event.locals.user = null;
        event.locals.impersonator = null;
    }

    // Theme aus dem Cookie, damit der Server die Klasse direkt setzen kann.
    const theme = parseTheme(event.cookies.get(THEME_COOKIE));
    event.locals.theme = theme;

    // Login- und Join-Routen bleiben oeffentlich; die UI-Galerie nur lokal.
    const publicPrefixes = dev ? ["/login", "/join", "/dev"] : ["/login", "/join"];
    const isPublic = publicPrefixes.some((p) => event.url.pathname.startsWith(p));

    if (!isPublic && !event.locals.user) {
        throw redirect(302, "/login");
    }

    if (event.locals.user) {
        const perms = await getPermissionsForUser(event.locals.user);
        event.locals.permissions = perms;

        // Admin-Bereich nur mit admin.view
        if (
            event.url.pathname.startsWith("/intern/admin") &&
            !matchesPermission(perms, "admin.view")
        ) {
            throw redirect(302, "/intern/dashboard");
        }
    } else {
        event.locals.permissions = [];
    }

    return resolve(event, {
        transformPageChunk: ({ html }) =>
            html.replace("%ep.theme%", theme === "dark" ? "dark" : "")
    });
};
