import { redirect, type Handle } from "@sveltejs/kit";
import { getPermissionsForUser, hasPermission } from "$lib/server/permissionService";
import { verifySignedSession } from "$lib/server/session";

export const handle: Handle = async ({ event, resolve }) => {
    const raw = event.cookies.get("session");

    const session = verifySignedSession(raw ?? undefined);

    if (session) {
        event.locals.user = {
            userinfo: {
                email: session.email,
                name: session.name,
                groups: (session.groups ?? []).map((g) => g.toLowerCase())
            },
            sub: session.sub
        };
    } else {
        event.locals.user = null;
    }

    // Login- und Join-Routen sollen öffentlich bleiben
    const publicPrefixes = ["/login", "/join"];
    const isPublic = publicPrefixes.some((p) => event.url.pathname.startsWith(p));

    if (!isPublic && !event.locals.user) {
        throw redirect(302, "/login");
    }

    if (event.locals.user) {
        const perms = await getPermissionsForUser(event.locals.user);
        event.locals.permissions = perms;

        // Admin-Bereich nur mit admin.view
        if (event.url.pathname.startsWith("/intern/admin") && !hasPermission(perms, "admin.view")) {
            throw redirect(302, "/intern/dashboard");
        }
    }

    return resolve(event);
};
