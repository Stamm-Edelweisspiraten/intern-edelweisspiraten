import { error, redirect } from "@sveltejs/kit";
import { ObjectId } from "mongodb";
import type { RequestHandler } from "./$types";
import { getUser } from "$lib/server/userService";
import { resolvePermissions } from "$lib/server/permissionService";
import { matchesAnyPermission, matchesPermission } from "$lib/permissions/match";
import { readSession, SESSION_COOKIE, startImpersonation } from "$lib/server/auth/session";

/**
 * Ansicht als anderer Benutzer.
 *
 * Vorher wurde dafuer ein voellig neues Sieben-Tage-Cookie ausgestellt, in
 * das die Gruppen-IDs des Ziels geschrieben wurden -- die Rechteaufloesung
 * erwartete aber Gruppennamen, sodass ein impersonierter Benutzer faktisch
 * gar keine Rechte hatte. Jetzt wechselt lediglich der Benutzerbezug der
 * bestehenden Sitzung; die Rechte ergeben sich aus dessen Rollen.
 */
export const POST: RequestHandler = async ({ request, locals, cookies }) => {
    if (!locals.user) throw error(401, "Nicht angemeldet");

    if (!matchesAnyPermission(locals.permissions, ["admin.view", "user.impersonate"])) {
        throw error(403, "Keine Berechtigung");
    }

    const form = await request.formData();
    const userId = form.get("userId")?.toString();
    if (!userId) throw error(400, "Es wurde kein Benutzer angegeben.");

    if (userId === locals.user.id) {
        throw redirect(303, "/intern/dashboard");
    }

    const target = await getUser(userId);
    if (!target?._id) throw error(404, "Benutzer nicht gefunden");
    if (target.status !== "active") throw error(400, "Dieser Zugang ist nicht aktiv.");

    // Ein Zugang mit Vollrechten darf nicht uebernommen werden -- sonst waere
    // die Rechteerweiterung ueber Impersonation trivial.
    const { permissions } = await resolvePermissions(target.roleIds ?? []);
    if (matchesPermission(permissions, "*")) {
        throw error(403, "Zugänge mit Vollrechten können nicht übernommen werden.");
    }

    const session = await readSession(cookies.get(SESSION_COOKIE));
    if (!session) throw error(401, "Sitzung nicht gefunden");
    if (session.impersonation) {
        throw error(400, "Es läuft bereits eine Übernahme. Bitte diese zuerst beenden.");
    }

    await startImpersonation(session, cookies, target._id, {
        id: new ObjectId(locals.user.id),
        name: locals.user.name,
        email: locals.user.email
    });

    throw redirect(303, "/intern/dashboard");
};
