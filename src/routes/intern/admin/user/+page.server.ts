import type { Actions } from "./$types";
import { getAllUsers, deleteUser } from "$lib/server/userService";
import { getAllMembers } from "$lib/server/memberService";
import { redirect, fail } from "@sveltejs/kit";

export async function load() {
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
    delete: async ({ request }) => {
        const form = await request.formData();
        const id = form.get("id");

        if (typeof id !== "string") return;

        await deleteUser(id);

        throw redirect(303, "/intern/admin/user");
    }
};