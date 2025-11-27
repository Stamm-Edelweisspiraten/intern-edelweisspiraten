import { redirect } from "@sveltejs/kit";

// JWT Parser ohne Fremdbibliothek
function decodeJwt(token: string): Record<string, any> {
    const payload = token.split(".")[1];
    const decoded = Buffer.from(payload, "base64").toString("utf-8");
    return JSON.parse(decoded);
}


export async function GET({ url, fetch, cookies }) {
    const code = url.searchParams.get("code");

    if (!code) throw redirect(302, "/login");

    const response = await fetch(
        `${process.env.PUBLIC_AUTHENTIK_URL}/application/o/token/`,
        {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "authorization_code",
                code,
                client_id: process.env.AUTHENTIK_CLIENT_ID!,
                client_secret: process.env.AUTHENTIK_CLIENT_SECRET!,
                redirect_uri: process.env.AUTHENTIK_REDIRECT!
            })
        }
    );

    if (!response.ok) {
        console.error("Token fetch failed:", await response.text());
        throw redirect(302, "/login");
    }

    const tokens = await response.json();

    // JWT decodieren
    const decoded = decodeJwt(tokens.id_token);
    const groups = decoded.groups || [];

    // ❗ WICHTIG: Nur userinfo + Rollen speichern
    const sessionData = {
        email: decoded.email,
        name: decoded.name,
        groups: groups
    };

    cookies.set("session", JSON.stringify(sessionData), {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        path: "/"
    });

    throw redirect(302, "/intern/dashboard");
}
