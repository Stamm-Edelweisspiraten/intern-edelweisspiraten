import type { RequestHandler } from "./$types";
import { createSignedSession, SESSION_MAX_AGE_SECONDS } from "$lib/server/session";
import { getUser } from "$lib/server/userService";
import { hasPermission } from "$lib/server/permissionService";
import { error, fail, redirect } from "@sveltejs/kit";

const COOKIE_OPTS = {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: true,
    maxAge: SESSION_MAX_AGE_SECONDS
};

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
    const perms = locals.permissions ?? [];
    if (!hasPermission(perms, "admin.*") && !hasPermission(perms, "user.impersonate")) {
        throw error(403, "Keine Berechtigung für Impersonation");
    }

    const form = await request.formData();
    const userId = form.get("userId")?.toString();

    if (!userId) return fail(400, { message: "User-ID fehlt" });
    if (!locals.user) throw error(401, "Nicht eingeloggt");

    const target = await getUser(userId);
    if (!target) throw error(404, "User nicht gefunden");

    const impersonator = {
        email: locals.user.userinfo.email,
        name: locals.user.userinfo.name,
        groups: locals.user.userinfo.groups,
        sub: locals.user.sub,
        memberId: locals.user.memberId
    };

    const signedSession = createSignedSession(
        {
            email: target.email,
            name: target.name,
            groups: (target.groups ?? []).map((g: any) => g?.toString?.().toLowerCase?.() ?? String(g).toLowerCase()),
            sub: target._id?.toString(),
            memberId: target.memberId,
            impersonator,
            type: "session"
        },
        SESSION_MAX_AGE_SECONDS
    );

    cookies.set("session", signedSession, COOKIE_OPTS);

    throw redirect(303, "/intern/dashboard");
};
