import { redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { revokeSession, SESSION_COOKIE } from "$lib/server/auth/session";

/**
 * Abmelden ausschliesslich per POST. Vorher war /logout ein GET-Link und
 * damit ueber ein fremdes Bild oder einen Prefetch ausloesbar.
 */

/**
 * Ein GET auf /logout ist kein Abmelden, sondern ein Versehen (Lesezeichen,
 * Vorabruf). Frueher fuehrte es auf /intern/dashboard -- fuer einen Zugang
 * ohne dashboard.view war das der Einstieg in genau die Schleife, aus der
 * dieser Pfad heraushelfen soll. /login ist der neutrale Zielpunkt: wer noch
 * angemeldet ist, wird von dort weitergereicht, wer nicht, sieht das
 * Anmeldeformular.
 */
export const load: PageServerLoad = async () => {
    throw redirect(303, "/login");
};

export const actions: Actions = {
    default: async ({ cookies }) => {
        await revokeSession(cookies.get(SESSION_COOKIE), cookies);
        throw redirect(303, "/login?hinweis=abgemeldet");
    }
};
