import { redirect, error } from "@sveltejs/kit";
import { db } from "$lib/server/mongo";
import { env as privateEnv } from "$env/dynamic/private";
import { ObjectId } from "mongodb";
import { env } from "$lib/env";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { createSignedSession, SESSION_MAX_AGE_SECONDS } from "$lib/server/session";

function normalizeBase(url: string) {
    return url.replace(/\/+$/, "");
}

export async function GET({ url, cookies, fetch }) {
    const code = url.searchParams.get("code");
    if (!code) throw redirect(302, "/login");

    const base = normalizeBase(env.PUBLIC_AUTHENTIK_URL);

    const tokenEndpoint = `${base}/application/o/token/`;
    const issuer = base;

    let discoveryConf: any = null;

    // JWKS-URL bestimmen: Vorrang AUTHENTIK_JWKS_URL, sonst Discovery -> jwks_uri, sonst Fallback
    const AUTHENTIK_CLIENT_ID = privateEnv.AUTHENTIK_CLIENT_ID;
    const AUTHENTIK_CLIENT_SECRET = privateEnv.AUTHENTIK_CLIENT_SECRET;
    const AUTHENTIK_REDIRECT = privateEnv.AUTHENTIK_REDIRECT;
    const AUTHENTIK_JWKS_URL = privateEnv.AUTHENTIK_JWKS_URL;
    const AUTHENTIK_ISSUER = privateEnv.AUTHENTIK_ISSUER;

    let jwksUri = AUTHENTIK_JWKS_URL;
    if (!jwksUri) {
        try {
            const discovery = await fetch(`${issuer}/.well-known/openid-configuration`);
            if (discovery.ok) {
                discoveryConf = await discovery.json();
                if (discoveryConf.jwks_uri) {
                    jwksUri = discoveryConf.jwks_uri;
                }
            }
        } catch (err) {
            console.warn("OIDC discovery failed, falling back to default jwks path", err);
        }
    }
    if (!jwksUri) {
        jwksUri = `${issuer}/.well-known/jwks.json`;
    }

    // TOKEN holen
    const response = await fetch(tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            client_id: AUTHENTIK_CLIENT_ID,
            client_secret: AUTHENTIK_CLIENT_SECRET,
            redirect_uri: AUTHENTIK_REDIRECT
        })
    });

    if (!response.ok) {
        console.error("Token endpoint error", response.status, await response.text());
        throw error(401, "Login fehlgeschlagen");
    }

    const tokens = await response.json();

    if (!tokens.id_token) {
        throw error(401, "Kein ID Token erhalten");
    }

    // ID Token validieren
    // JWKS vorab prüfen, damit wir klarere Fehler liefern
    try {
        const jwksRes = await fetch(jwksUri);
        if (!jwksRes.ok) {
            console.error("JWKS fetch failed", jwksUri, jwksRes.status, await jwksRes.text());
            throw error(503, "Login nicht möglich (JWKS nicht erreichbar)");
        }
    } catch (err) {
        console.error("JWKS fetch error", jwksUri, err);
        throw error(503, "Login nicht möglich (JWKS nicht erreichbar)");
    }

    let payload;
    try {
        const JWKS = createRemoteJWKSet(new URL(jwksUri));
        ({ payload } = await jwtVerify(tokens.id_token, JWKS, {
            issuer: AUTHENTIK_ISSUER || discoveryConf?.issuer || issuer,
            audience: AUTHENTIK_CLIENT_ID
        }));
    } catch (err) {
        console.error("JWT verify failed", err);
        throw error(503, "Login nicht möglich (JWKS/Token Validation) - JWKS prüfen");
    }

    const groups = (payload.groups as string[] | undefined)?.map((g) => g.toLowerCase()) ?? [];

    // Session signieren
    const signedSession = createSignedSession({
        email: payload.email as string,
        name: payload.name as string,
        groups,
        sub: payload.sub as string,
        type: "session"
    }, SESSION_MAX_AGE_SECONDS);

    cookies.set("session", signedSession, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        maxAge: SESSION_MAX_AGE_SECONDS
    });

    // Wurde beitreten ausgelöst?
    const joinId = cookies.get("join_member");

    if (joinId) {
        // User in Mongo holen
        let user = await db.collection("users").findOne({ email: payload.email });

        // Falls es den User nicht gibt -> erstellen
        if (!user) {
            const insert = await db.collection("users").insertOne({
                name: payload.name,
                email: payload.email,
                memberIds: [],
                createdAt: new Date().toISOString()
            });
            user = { ...user, _id: insert.insertedId };
        }

        // Verknüpfen
        await db.collection("users").updateOne(
            { _id: user._id },
            { $addToSet: { memberIds: joinId } }
        );

        await db.collection("members").updateOne(
            { _id: new ObjectId(joinId) },
            { $addToSet: { userIds: user._id.toString() } }
        );

        // Cookie löschen
        cookies.delete("join_member", { path: "/" });

        // Success-Seite
        throw redirect(302, `/join/${joinId}/success`);
    }

    // Normaler Login -> Dashboard
    throw redirect(302, "/intern/dashboard");
}
