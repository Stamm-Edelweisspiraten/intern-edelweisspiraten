import { redirect, type Handle } from "@sveltejs/kit";
import { getPermissionsForUser, hasPermission } from "$lib/server/permissionService";
import { verifySignedSession } from "$lib/server/session";
import { db } from "$lib/server/mongo";

export const handle: Handle = async ({ event, resolve }) => {
    const raw = event.cookies.get("session");

    const session = verifySignedSession(raw ?? undefined);

    if (session) {
        let memberIds: string[] = [];
        if (session.email) {
            const userDoc = await db.collection("users").findOne({ email: session.email.toLowerCase() });
            if (userDoc?.memberIds) {
                memberIds = (userDoc.memberIds as any[]).map((id: any) => id?.toString?.() ?? id).filter(Boolean);
            }
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
