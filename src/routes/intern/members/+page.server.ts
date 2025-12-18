import type { Actions, PageServerLoad } from "./$types";
import { getAllMembers, deleteMember, getMembersByGroupIds, getMember } from "$lib/server/memberService";
import { redirect, fail, error } from "@sveltejs/kit";
import { hasPermission, getLeaderGroupIdsForUser } from "$lib/server/permissionService";
import { getAllGroups } from "$lib/server/groupService";

export const load: PageServerLoad = async (event) => {
    const perms = event.locals.permissions ?? [];
    const canAll = hasPermission(perms, "members.view");
    const canGroup = hasPermission(perms, "members.group.view");
    if (!canAll && !canGroup) {
        throw error(403, "Keine Berechtigung");
    }

    let allowedGroups: string[] = [];
    if (!canAll) {
        allowedGroups = await getLeaderGroupIdsForUser(event.locals.user);
        if (allowedGroups.length === 0) throw error(403, "Keine zugeordneten Gruppen");
    }

    const members = canAll ? await getAllMembers() : await getMembersByGroupIds(allowedGroups);
    const groups = await getAllGroups();
    const visibleGroups = canAll ? groups : groups.filter((g) => allowedGroups.includes(g.id));

    const normalized = members
        .map((m: any) => ({
            id: m._id.toString(),
            firstname: m.firstname,
            lastname: m.lastname,
            fahrtenname: m.fahrtenname ?? "",
            birthday: m.birthday,
            stand: m.stand,
            groups: m.groups ?? [],
            status: m.status,
            emails: m.emails,
            numbers: m.numbers
        }))
        .sort((a, b) => (a.lastname || "").localeCompare(b.lastname || "", "de"));

    return { members: normalized, groups: visibleGroups, permissions: perms };
};

export const actions: Actions = {
    delete: async ({ request, locals }) => {
        const perms = locals.permissions ?? [];
        const canAllDelete = hasPermission(perms, "members.delete");
        const canGroupDelete = hasPermission(perms, "members.group.delete");

        const form = await request.formData();
        const id = form.get("id")?.toString();

        if (!id) return fail(400, { error: "Missing ID" });

        if (!canAllDelete) {
            if (!canGroupDelete) throw error(403, "Keine Berechtigung");
            const target = await getMember(id);
            if (!target) return fail(404, { error: "Mitglied nicht gefunden" });
            const allowedGroups = await getLeaderGroupIdsForUser(locals.user);
            const isAllowed = (target.groups ?? []).some((g: any) => allowedGroups.includes(g?.toString()));
            if (!isAllowed) throw error(403, "Keine Berechtigung");
        }

        const actor = locals.user?.userinfo?.name ?? locals.user?.userinfo?.email ?? "system";
        await deleteMember(id, actor);

        throw redirect(303, "/intern/members");
    }
};
