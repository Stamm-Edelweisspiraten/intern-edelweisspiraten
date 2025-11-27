import type { Actions, PageServerLoad } from "./$types";
import { getAllMembers, deleteMember } from "$lib/server/memberService";
import { redirect, fail } from "@sveltejs/kit";

export const load: PageServerLoad = async () => {
    const members = await getAllMembers();

    const normalized = members.map((m: any) => ({
        id: m._id.toString(),
        firstname: m.firstname,
        lastname: m.lastname,
        group: m.group,
        status: m.status,
        emails: m.emails,
        numbers: m.numbers
    }));

    return { members: normalized };
};

export const actions: Actions = {
    delete: async ({ request }) => {
        const form = await request.formData();
        const id = form.get("id")?.toString();

        if (!id) return fail(400, { error: "Missing ID" });

        await deleteMember(id);

        throw redirect(303, "/intern/member");
    }
};
