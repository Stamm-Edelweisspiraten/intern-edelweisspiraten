import type { Actions } from "./$types";
import { getAllUsers, deleteUser } from "$lib/server/userService";
import { getAllMembers } from "$lib/server/memberService";
import { redirect, error } from "@sveltejs/kit";
import { hasPermission } from "$lib/server/permissionService";

export async function load({ locals }) {
    if (!hasPermission(locals.permissions ?? [], "user.view")) {
        throw error(403, "Keine Berechtigung");
    }

    const users = await getAllUsers();
    const members = await getAllMembers();

    const normalized = users.map((u: any) => ({
        id: u._id.toString(),
        name: u.name,
        email: u.email,
        memberId: u.memberId,
        createdAt: u.createdAt,
    }));

    return {
        users: normalized,
        members: members.map(m => ({
            id: m._id.toString(),
            name: m.firstname + " " + m.lastname
        }))
    };
}

export const actions: Actions = {
    delete: async ({ request, locals }) => {
        if (!hasPermission(locals.permissions ?? [], "user.delete")) {
            throw error(403, "Keine Berechtigung");
        }

        const form = await request.formData();
        const id = form.get("id");

        if (typeof id !== "string") return;

        await deleteUser(id);

        throw redirect(303, "/intern/admin/user");
    }
};
