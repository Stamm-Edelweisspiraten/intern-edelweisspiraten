import { getMember } from "$lib/server/memberService";
import { assignMemberToUser, createUser } from "$lib/server/userService";
import { fail, redirect } from "@sveltejs/kit";
import { ObjectId } from "mongodb";
import {db} from "$lib/server/mongo";

export const load = async ({ params, cookies }) => {
    const memberId = params.id;

    // Einladungscode-Prüfung
    if (!cookies.get(`join_verified_${memberId}`)) {
        throw redirect(303, `/join/${memberId}`);
    }

    const member = await getMember(memberId);
    if (!member) return fail(404, { error: "Mitglied nicht gefunden" });

    return {
        member: {
            id: params.id,
            firstname: member.firstname,
            lastname: member.lastname
        }
    };
};

export const actions = {
    default: async ({ request, params, cookies }) => {
        const memberId = params.id;

        // Schutz
        if (!cookies.get(`join_verified_${memberId}`)) {
            throw redirect(303, `/join/${memberId}`);
        }

        const form = await request.formData();

        const name = form.get("name")?.toString();
        const email = form.get("email")?.toString();
        const password = form.get("password")?.toString();
        const type = form.get("accountType")?.toString() || "parent"; // fallback

        if (!name || !email || !password || !type) {
            return fail(400, { error: "Bitte alle Felder ausfüllen." });
        }

        const GROUP_MAP = {
            child: ["6d1940af-e162-48f2-9fc1-eb4fcd59ed37"],
            parent: ["7afc50a1-7cab-4092-b63c-32f5a03e2da9"]
        };

        const groups = GROUP_MAP[type] ?? GROUP_MAP.parent;


        // -------------------------------------------------------
        // 1) USER ANLEGEN → MONGO + AUTHENTIK + EMAIL
        // -------------------------------------------------------
        const created = await createUser({
            name,
            email,
            type,
            groups,
            password
        });

        const mongoUserId = created.mongoId.toString();

        // -------------------------------------------------------
        // 2) USER ↔ MEMBER VERKNÜPFEN
        // -------------------------------------------------------
        await assignMemberToUser(mongoUserId, memberId);

        // Member.userIds ergänzen
        await db.collection("members").updateOne(
            { _id: new ObjectId(memberId) },
            { $addToSet: { userIds: mongoUserId } }
        );

        // -------------------------------------------------------
        // 3) Erfolgreich → Weiterleitung
        // -------------------------------------------------------
        throw redirect(303, `/join/${memberId}/success`);
    }
};
