import type { PageServerLoad } from "./$types";
import { redirect } from "@sveltejs/kit";

export const load: PageServerLoad = async ({ locals, url }) => {
    if (locals.user) {
        // Bereits eingeloggt -> ins Dashboard oder Zielroute umleiten
        const redirectTo = url.searchParams.get("redirect") ?? "/intern/dashboard";
        throw redirect(303, redirectTo);
    }
    return {};
};
