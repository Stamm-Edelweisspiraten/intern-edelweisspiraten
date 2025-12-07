import type { Actions, PageServerLoad } from "./$types";
import { getAllMembers, deleteMember } from "$lib/server/memberService";
import { redirect, fail, error } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/permissionGuard";
import { hasPermission } from "$lib/server/permissionService";
import { getAllGroups } from "$lib/server/groupService";

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "members.view");

    const members = await getAllMembers();
    const groups = await getAllGroups();

    const normalized = members.map((m: any) => ({
        id: m._id.toString(),
        firstname: m.firstname,
        lastname: m.lastname,
        groups: m.groups ?? [],
        status: m.status,
        emails: m.emails,
        numbers: m.numbers
    }));

    return { members: normalized, groups };
};

export const actions: Actions = {
    delete: async ({ request, locals }) => {
        if (!hasPermission(locals.permissions ?? [], "members.delete")) {
            throw error(403, "Keine Berechtigung");
        }

        const form = await request.formData();
        const id = form.get("id")?.toString();

        if (!id) return fail(400, { error: "Missing ID" });

        await deleteMember(id);

        throw redirect(303, "/intern/members");
    }
};
