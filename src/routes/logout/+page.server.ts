import { redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { revokeSession, SESSION_COOKIE } from "$lib/server/auth/session";

/**
 * Abmelden ausschliesslich per POST. Vorher war /logout ein GET-Link und
 * damit ueber ein fremdes Bild oder einen Prefetch ausloesbar.
 */

export const load: PageServerLoad = async () => {
    throw redirect(303, "/intern/dashboard");
};

export const actions: Actions = {
    default: async ({ cookies }) => {
        await revokeSession(cookies.get(SESSION_COOKIE), cookies);
        throw redirect(303, "/login?hinweis=abgemeldet");
    }
};
