import { redirect } from "@sveltejs/kit";
import { db } from "$lib/server/mongo";
import {
    AUTHENTIK_CLIENT_ID,
    AUTHENTIK_REDIRECT,
    AUTHENTIK_CLIENT_SECRET
} from "$env/static/private";
import { ObjectId } from "mongodb";
import {env} from "$lib/env";

function decodeJwt(token: string) {
    const payload = token.split(".")[1];
    return JSON.parse(Buffer.from(payload, "base64").toString("utf-8"));
}

export async function GET({ url, cookies, fetch }) {
    const code = url.searchParams.get("code");
    if (!code) throw redirect(302, "/login");

    // TOKEN holen
    const response = await fetch(`${env.PUBLIC_AUTHENTIK_URL}/application/o/token/`, {
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

    const tokens = await response.json();
    const decoded = decodeJwt(tokens.id_token);

    // Session speichern
    cookies.set("session", JSON.stringify({
        email: decoded.email,
        name: decoded.name,
        groups: decoded.groups ?? []
    }), {
        path: "/",
        httpOnly: true,
        sameSite: "lax"
    });

    // Wurde beitreten ausgelöst?
    const joinId = cookies.get("join_member");

    if (joinId) {
        // User in Mongo holen
        let user = await db.collection("users").findOne({ email: decoded.email });

        // Falls es den User nicht gibt → erstellen
        if (!user) {
            const insert = await db.collection("users").insertOne({
                name: decoded.name,
                email: decoded.email,
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

    // Normaler Login → Dashboard
    throw redirect(302, "/intern/dashboard");
}
