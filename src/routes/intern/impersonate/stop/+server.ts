import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { readSession, SESSION_COOKIE, stopImpersonation } from "$lib/server/auth/session";

/** Beendet die Ansicht als anderer Benutzer. */
export const POST: RequestHandler = async ({ cookies }) => {
    const session = await readSession(cookies.get(SESSION_COOKIE));

    if (session?.impersonation) {
        await stopImpersonation(session, cookies);
    }

    throw redirect(303, "/intern/dashboard");
};
