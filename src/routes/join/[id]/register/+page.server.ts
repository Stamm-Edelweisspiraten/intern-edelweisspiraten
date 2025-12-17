import { getMember } from "$lib/server/memberService";
import { assignMemberToUser, createUser } from "$lib/server/userService";
import { fail, redirect } from "@sveltejs/kit";
import { ObjectId } from "mongodb";
import { db } from "$lib/server/mongo";
import { verifySignedSession } from "$lib/server/session";

const JOIN_COOKIE_AGE = 60 * 30; // 30 Minuten

export const load = async ({ params, cookies }) => {
    const memberId = params.id;

    const inviteSession = verifySignedSession(cookies.get(`join_verified_${memberId}`) ?? undefined);
    if (!inviteSession || inviteSession.type !== "invite" || inviteSession.memberId !== memberId) {
        throw redirect(303, `/join/${memberId}`);
    }

    const member = await getMember(memberId);
    if (!member) return fail(404, { error: "Mitglied nicht gefunden" });

    return {
        member: {
            id: params.id,
            firstname: member.firstname,
            lastname: member.lastname,
            birthday: member.birthday ?? null
        }
    };
};

export const actions = {
    default: async ({ request, params, cookies }) => {
        const memberId = params.id;
        const member = await getMember(memberId);

        const inviteSession = verifySignedSession(cookies.get(`join_verified_${memberId}`) ?? undefined);
        if (!inviteSession || inviteSession.type !== "invite" || inviteSession.memberId !== memberId) {
            throw redirect(303, `/join/${memberId}`);
        }

        const form = await request.formData();

        const name = form.get("name")?.toString();
        const email = form.get("email")?.toString();
        const password = form.get("password")?.toString();
        const password2 = form.get("password2")?.toString();
        const requestedType = form.get("accountType")?.toString() || "parent"; // fallback

        if (!name || !email || !password || !password2 || !requestedType) {
            return fail(400, { error: "Bitte alle Felder ausfüllen." });
        }

        if (password !== password2) {
            return fail(400, { error: "Passwörter stimmen nicht überein." });
        }

        const isAdult = (() => {
            if (!member?.birthday) return false;
            const b = new Date(member.birthday);
            if (isNaN(b.getTime())) return false;
            const today = new Date();
            let years = today.getFullYear() - b.getFullYear();
            const m = today.getMonth() - b.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < b.getDate())) years--;
            return years >= 18;
        })();

        const type = isAdult ? "parent" : requestedType;

        const GROUP_MAP = {
            child: ["6d1940af-e162-48f2-9fc1-eb4fcd59ed37"],
            parent: ["7afc50a1-7cab-4092-b63c-32f5a03e2da9"]
        };

        const groups = GROUP_MAP[type] ?? GROUP_MAP.parent;

        // -------------------------------------------------------
        // 1) USER ANLEGEN -> MONGO + AUTHENTIK (ohne Passwort-Mail)
        // -------------------------------------------------------
        let created;
        try {
            created = await createUser({
                name,
                email,
                type,
                groups,
                password
            });
        } catch (err: any) {
            return fail(500, { error: err?.message ?? "Konto konnte nicht erstellt werden." });
        }

        const mongoUserId = created.mongoId.toString();

        // -------------------------------------------------------
        // 2) USER -> MEMBER VERKNÜPFEN
        // -------------------------------------------------------
        await assignMemberToUser(mongoUserId, memberId);

        await db.collection("members").updateOne(
            { _id: new ObjectId(memberId) },
            { $addToSet: { userIds: mongoUserId } }
        );

        // Flag für Erfolg (Success-Seite)
        cookies.set("join_created_user", "1", {
            path: "/",
            httpOnly: true,
            sameSite: "lax",
            secure: true,
            maxAge: JOIN_COOKIE_AGE
        });

        // -------------------------------------------------------
        // 3) Erfolgreich -> Weiterleitung
        // -------------------------------------------------------
        throw redirect(303, `/join/${memberId}/success`);
    }
};
