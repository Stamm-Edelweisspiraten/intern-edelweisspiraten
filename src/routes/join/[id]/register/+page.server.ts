import { db } from "$lib/server/mongo";
import { getMember } from "$lib/server/memberService";
import { fail, redirect } from "@sveltejs/kit";
import { ObjectId } from "mongodb";

export const load = async ({ params }) => {
    const member = await getMember(params.id);
    if (!member) return fail(404, { error: "Mitglied nicht gefunden" });

    // 🔥 SAFE: Nur serialisierbare Daten zurückgeben
    return {
        member: {
            id: params.id,
            firstname: member.firstname,
            lastname: member.lastname
        }
    };
};

export const actions = {
    default: async ({ request, params }) => {
        const form = await request.formData();
        const name = form.get("name")?.toString();
        const email = form.get("email")?.toString();
        const password = form.get("password")?.toString();
        const type = form.get("accountType")?.toString(); // child / parent

        if (!name || !email || !password || !type) {
            return fail(400, { error: "Bitte alle Felder ausfüllen." });
        }

        const memberId = params.id;

        // User erzeugen
        const userRes = await db.collection("users").insertOne({
            name,
            email,
            password,         // du willst später Hashing hinzufügen
            type,             // "child" | "parent"
            memberIds: [memberId],
            createdAt: new Date()
        });

        // Member → userIds
        await db.collection("members").updateOne(
            { _id: new ObjectId(memberId) },
            { $addToSet: { userIds: userRes.insertedId.toString() } }
        );

        throw redirect(303, "/join/success");
    }
};
