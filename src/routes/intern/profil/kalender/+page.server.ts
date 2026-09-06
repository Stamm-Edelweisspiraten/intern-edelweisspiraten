import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { env } from "$env/dynamic/private";
import { requirePermission, requireUser } from "$lib/server/permissionGuard";
import {
    createCalendarToken,
    listCalendarTokens,
    revokeCalendarToken
} from "$lib/server/calendar";

/**
 * Kalenderabonnements.
 *
 * Ein Kalenderprogramm kann sich nicht anmelden, deshalb ersetzt ein
 * persönliches Token in der Adresse die Anmeldung. Es wird genau einmal
 * angezeigt -- gespeichert ist nur sein Abdruck. Wer die Adresse verliert,
 * widerruft sie und legt eine neue an.
 *
 * Mehrere Abonnements sind vorgesehen: eines je Gerät, damit ein verlorenes
 * Telefon nicht den Kalender am Rechner mitnimmt.
 */
export const load: PageServerLoad = async (event) => {
    requirePermission(event, "events.view");
    const user = requireUser(event);

    const tokens = await listCalendarTokens(user.id);

    return {
        tokens: tokens.map((token) => ({
            id: token.id,
            label: token.label,
            lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
            createdAt: token.createdAt.toISOString()
        })),
        baseUrl: (env.PUBLIC_APP_URL || event.url.origin).replace(/\/+$/, "")
    };
};

export const actions: Actions = {
    create: async (event) => {
        requirePermission(event, "events.view");
        const user = requireUser(event);

        const form = await event.request.formData();
        const label = String(form.get("label") ?? "").trim() || "Kalender";

        const result = await createCalendarToken(user.id, label);
        if (!result) return fail(400, { error: "Das Abonnement konnte nicht angelegt werden." });

        const base = (env.PUBLIC_APP_URL || event.url.origin).replace(/\/+$/, "");

        return {
            success: "Das Abonnement wurde angelegt.",
            // Genau einmal sichtbar -- danach nie wieder.
            url: `${base}/intern/termine/kalender.ics?token=${result.token}`
        };
    },

    revoke: async (event) => {
        requirePermission(event, "events.view");
        const user = requireUser(event);

        const form = await event.request.formData();
        const id = String(form.get("tokenId") ?? "");

        const ok = await revokeCalendarToken(id, user.id);
        if (!ok) return fail(404, { error: "Das Abonnement wurde nicht gefunden." });

        return { success: "Das Abonnement wurde widerrufen." };
    }
};
