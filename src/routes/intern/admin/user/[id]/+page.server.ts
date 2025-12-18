import type { Actions, PageServerLoad } from "./$types";
import { getUser, updateUser } from "$lib/server/userService";
import { getAllMembers } from "$lib/server/memberService";
import { fail, error } from "@sveltejs/kit";
import { db } from "$lib/server/mongo";
import { ObjectId } from "mongodb";
import { hasPermission } from "$lib/server/permissionService";
import { env } from "$env/dynamic/private";

export const load: PageServerLoad = async ({ params, url, locals }) => {
    if (!hasPermission(locals.permissions ?? [], "user.view")) {
        throw error(403, "Keine Berechtigung");
    }

    const canImpersonate = hasPermission(locals.permissions ?? [], "admin.*") ||
        hasPermission(locals.permissions ?? [], "user.impersonate");

    const user = await getUser(params.id);
    if (!user) throw new Error("User not found");

    const members = (await getAllMembers()).map((m) => ({
        id: m._id.toString(),
        firstname: m.firstname,
        lastname: m.lastname
    }));

    const akRes = await fetch(`${env.AUTHENTIK_URL}/api/v3/core/groups/?page_size=1000`, {
        headers: { Authorization: `Bearer ${env.AUTHENTIK_TOKEN}` }
    });
    if (!akRes.ok) {
        throw error(500, "Authentik Gruppen konnten nicht geladen werden");
    }
    const akGroups = await akRes.json();

    return {
        scope: url.searchParams.get("scope"),
        canImpersonate,
        user: {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            memberId: user.memberId,
            createdAt: user.createdAt,
            memberIds: user.memberIds ?? [],
            groups: (user.groups ?? []).map((g: any) => g?.toString?.() ?? g)
        },
        members,
        authentikGroups: akGroups.results ?? []
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

        let memberId = form.get("memberId") as string | null;
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
    },

    "update-groups": async ({ request, locals }) => {
        if (!hasPermission(locals.permissions ?? [], "user.edit")) {
            throw error(403, "Keine Berechtigung");
        }

        const form = await request.formData();
        const userId = form.get("userId")?.toString();
        const groups = form.getAll("groups").map((g) => g?.toString?.()).filter(Boolean) as string[];

        if (!userId) return fail(400, { error: "User-ID fehlt" });

        await updateUser(userId, { groups });

        return { success: true };
    }

};
