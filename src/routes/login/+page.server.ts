import { redirect } from "@sveltejs/kit";
import { db } from "$lib/server/mongo";
import { ObjectId } from "mongodb";

export const load = async ({ cookies, url }) => {
    const joinId = url.searchParams.get("join");

    // JOIN-ID IM COOKIE SPEICHERN
    if (joinId) {
        cookies.set("join_member", joinId, {
            path: "/",
            httpOnly: true,
            sameSite: "lax"
        });
    }

    const sessionRaw = cookies.get("session");
    if (!sessionRaw) return {}; // nicht eingeloggt → normale Seite anzeigen

    // Benutzer IST bereits eingeloggt → hier kommt der FIX
    const session = JSON.parse(sessionRaw);

    if (joinId) {

        // User in Mongo suchen
        const user = await db.collection("users").findOne({ email: session.email });

        if (user) {
            // 1. User bekommt MemberId
            await db.collection("users").updateOne(
                { _id: user._id },
                { $addToSet: { memberIds: joinId } }
            );

            // 2. Member bekommt UserId
            await db.collection("members").updateOne(
                { _id: new ObjectId(joinId) },
                { $addToSet: { userIds: user._id.toString() } }
            );
        }

        // JOIN-Cookie löschen
        cookies.delete("join_member", { path: "/" });

        // Weiter zur Erfolg-Seite
        throw redirect(302, `/join/${joinId}/success`);
    }

    // Normales Verhalten: eingeloggt → Dashboard
    throw redirect(302, "/intern/dashboard");
};
