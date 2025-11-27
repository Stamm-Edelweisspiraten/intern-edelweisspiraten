import { redirect, type Handle } from "@sveltejs/kit";
import { getPermissionsForUser } from "$lib/server/permissionService";


export const handle: Handle = async ({ event, resolve }) => {
    const raw = event.cookies.get("session");

    let user = null;

    if (raw) {
        try {
            // cookies.set() encodiert → wir müssen decodieren
            const decoded = decodeURIComponent(raw);

            // Session in JSON verwandeln
            const data = JSON.parse(decoded);

            // Gruppen normalisieren (lowercase), falls vorhanden
            const groups = (data.groups ?? []).map((g: string) => g.toLowerCase());

            user = {
                access_token: data.access_token,
                id_token: data.id_token,
                refresh_token: data.refresh_token,
                expires_in: data.expires_in,
                token_type: data.token_type,
                userinfo: {
                    email: data.email,
                    name: data.name,
                    groups: groups,
                }
            };

        } catch (err) {
            console.error("Invalid session cookie:", err);
            user = null;
        }
    }

    // User global verfügbar machen
    event.locals.user = user;

    // ================================
    // 🔒 Zugriff nur für Admins
    // ================================
    if (event.url.pathname.startsWith("/intern/admin")) {
        if (!user?.userinfo?.groups?.includes("ep-admin")) {
            throw redirect(302, "/intern/dashboard");
        }
    }

    // ================================
    // 🔒 Login-Routen sind öffentlich
    // ================================
    const publicRoutes = [
        "/login",
        "/login/callback",
        "/login/start"
    ];

    // Wenn Route nicht öffentlich ist → login check
    if (!publicRoutes.includes(event.url.pathname)) {
        if (!user) {
            throw redirect(302, "/login");
        }
    }

    const session = event.locals.user;

    if (session) {
        const perms = await getPermissionsForUser(session);
        console.log("LOADED PERMISSIONS:", perms);
        event.locals.permissions = perms;
    }



    return resolve(event);
};
