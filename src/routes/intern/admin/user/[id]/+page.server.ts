import type { Actions, PageServerLoad } from "./$types";
import { getUser, updateUser } from "$lib/server/userService";
import { getAllMembers } from "$lib/server/memberService";
import { fail, error } from "@sveltejs/kit";
import { db } from "$lib/server/mongo";
import { ObjectId } from "mongodb";
import { hasPermission } from "$lib/server/permissionService";

export const load: PageServerLoad = async ({ params, url, locals }) => {
    if (!hasPermission(locals.permissions ?? [], "user.view")) {
        throw error(403, "Keine Berechtigung");
    }

    const user = await getUser(params.id);
    if (!user) throw new Error("User not found");

    const members = (await getAllMembers()).map((m) => ({
        id: m._id.toString(),
        firstname: m.firstname,
        lastname: m.lastname
    }));

    return {
        scope: url.searchParams.get("scope"),
        user: {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            memberId: user.memberId,
            createdAt: user.createdAt,
            memberIds: user.memberIds ?? []
        },
        members
    };
};

export const actions: Actions = {
    update: async ({ request, locals }) => {
        if (!hasPermission(locals.permissions ?? [], "user.edit")) {
            throw error(403, "Keine Berechtigung");
        }

        const form = await request.formData();

        const id = form.get("id") as string;
        const name = form.get("name") as string;
        const email = form.get("email") as string;

        // WICHTIG: memberId korrekt auslesen
        let memberId = form.get("memberId") as string | null;

        // Wenn leer -> Member entfernen
        if (!memberId || memberId.trim() === "") {
            memberId = null;
        }

        await updateUser(id, {
            name,
            email,
            memberId
        });

        return { success: true };
    },

    "update-members": async ({ request, locals }) => {
        if (!hasPermission(locals.permissions ?? [], "user.edit")) {
            throw error(403, "Keine Berechtigung");
        }

        const form = await request.formData();

        const userId = form.get("userId")?.toString();
        const memberIds = JSON.parse(form.get("memberIds")?.toString() ?? "[]");

        if (!userId) return fail(400, { error: "User-ID fehlt" });

        // 1. Alle Member von User entfernen
        await db.collection("users").updateOne(
            { _id: new ObjectId(userId) },
            { $set: { memberIds: memberIds } }
        );

        return { success: true };
    }

};
