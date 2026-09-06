import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { env } from "$env/dynamic/private";
import { buildCalendar, resolveCalendarToken } from "$lib/server/calendar";
import { listEvents } from "$lib/server/eventService";
import { getUser } from "$lib/server/userService";
import { resolveGrants } from "$lib/server/permissionService";
import { matchesPermission } from "$lib/permissions/match";
import { getOrganizationSettings } from "$lib/server/settingsService";

/**
 * Kalenderabonnement.
 *
 * Diese Adresse liegt ABSICHTLICH außerhalb der Anmeldung: ein
 * Kalenderprogramm kann sich nicht anmelden. Statt der Sitzung zählt das
 * persönliche Token im Abfrageteil der Adresse, das jederzeit im Profil
 * widerrufen werden kann.
 *
 * Der Zugriff läuft dennoch über dieselbe Sichtbarkeitsprüfung wie die
 * Terminseite: geladen werden die Termine des Benutzers, auf den das Token
 * ausgestellt ist. Ein fremdes Token liefert deshalb andere Termine.
 *
 * Der Pfad muss in PUBLIC_PREFIXES von hooks.server.ts stehen, sonst leitet
 * das Anmelde-Gate den Abruf auf /login um und das Kalenderprogramm bekommt
 * eine HTML-Seite mit Status 200 statt eines Fehlers.
 */
export const GET: RequestHandler = async ({ url }) => {
    const token = url.searchParams.get("token") ?? "";

    const userId = await resolveCalendarToken(token);
    if (!userId) throw error(401, "Ungültiges oder widerrufenes Kalender-Token");

    const user = await getUser(userId);
    if (!user || user.status !== "active") {
        throw error(401, "Der Zugang ist nicht mehr aktiv");
    }

    const { permissions } = await resolveGrants({
        userId: user.id,
        memberIds: user.memberIds
    });

    if (!matchesPermission(permissions, "events.view")) {
        throw error(403, "Keine Berechtigung für Termine");
    }

    const [events, organization] = await Promise.all([
        listEvents(
            { id: user.id, memberIds: user.memberIds },
            {
                manageAll: matchesPermission(permissions, "events.manage"),
                range: "all",
                // Vergangene Termine bleiben ein Jahr im Kalender stehen.
                from: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
            }
        ),
        getOrganizationSettings()
    ]);

    const base = env.PUBLIC_APP_URL || url.origin;

    const body = buildCalendar(events, {
        name: `${organization.name} – Termine`,
        baseUrl: base.replace(/\/+$/, ""),
        // Stabile Kennung für die UIDs: sie darf sich nicht ändern, sonst
        // legen die Kalenderprogramme jeden Termin neu an.
        domain: new URL(base).hostname || "intern.local"
    });

    return new Response(body, {
        headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Content-Disposition": 'inline; filename="termine.ics"',
            // Der Kalender ist persönlich -- kein Zwischenspeicher unterwegs.
            "Cache-Control": "private, no-store"
        }
    });
};
