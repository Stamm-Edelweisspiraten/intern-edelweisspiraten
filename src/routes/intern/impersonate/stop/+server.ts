import type { RequestHandler } from "./$types";
import { createSignedSession, SESSION_MAX_AGE_SECONDS, verifySignedSession } from "$lib/server/session";
import { redirect } from "@sveltejs/kit";

const COOKIE_OPTS = {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: true,
    maxAge: SESSION_MAX_AGE_SECONDS
};

export const POST: RequestHandler = async ({ cookies }) => {
    const raw = cookies.get("session");
    const session = verifySignedSession(raw ?? undefined);

    if (!session?.impersonator) {
        throw redirect(303, "/intern/dashboard");
    }

    const original = session.impersonator;

    const signedSession = createSignedSession(
        {
            email: original.email,
            name: original.name,
            groups: (original.groups ?? []).map((g) => g?.toString?.().toLowerCase?.() ?? String(g).toLowerCase()),
            sub: original.sub,
            memberId: original.memberId,
            type: "session"
        },
        SESSION_MAX_AGE_SECONDS
    );

    cookies.set("session", signedSession, COOKIE_OPTS);

    throw redirect(303, "/intern/dashboard");
};
