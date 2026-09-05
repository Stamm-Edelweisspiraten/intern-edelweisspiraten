import type { Actions, PageServerLoad } from "./$types";
import { getAllMembers, deleteMember, getMembersByGroupIds, getMember } from "$lib/server/memberService";
import { redirect, fail } from "@sveltejs/kit";
import {
    groupsWithPermission,
    requireGroupsWithPermission,
    requirePermissionForAnyGroup
} from "$lib/server/permissionGuard";
import { getAllGroups } from "$lib/server/groupService";

/**
 * Mitgliederliste.
 *
 * Der Gruppenbezug kommt jetzt aus den Grants: `requireGroupsWithPermission`
 * liefert `null`, wenn `members.view` stammesweit vorliegt, sonst die
 * Gruppen, fuer die es zugewiesen ist. Vorher stand hier -- wie in acht
 * weiteren Routen -- ein von Hand nachgebauter Block aus zwei
 * Rechtepruefungen und einem Abgleich mit den geleiteten Gruppen.
 */
export const load: PageServerLoad = async (event) => {
    const perms = event.locals.permissions ?? [];
    const allowedGroups = requireGroupsWithPermission(event, "members.view");

    const members = allowedGroups === null
        ? await getAllMembers()
        : await getMembersByGroupIds(allowedGroups);

    const allGroups = await getAllGroups();
    const visibleGroups = allowedGroups === null
        ? allGroups
        : allGroups.filter((g) => allowedGroups.includes(g.id));

    const normalized = members
        .map((m) => ({
            id: m.id,
            firstname: m.firstname,
            lastname: m.lastname,
            fahrtenname: m.fahrtenname,
            birthday: m.birthday,
            stand: m.stand,
            groups: m.groups,
            status: m.status,
            emails: m.emails,
            numbers: m.numbers
        }))
        .sort((a, b) => (a.lastname || "").localeCompare(b.lastname || "", "de"));

    /**
     * Die Schaltflaechen je Zeile richten sich nach der Zustaendigkeit fuer
     * die Gruppen des jeweiligen Mitglieds, nicht nach der flachen
     * Rechteliste: Wer members.edit nur fuer die Meute Panther hat, taucht in
     * `permissions` nicht damit auf, darf deren Mitglieder aber bearbeiten.
     * `null` heisst hier wie ueberall: stammesweit.
     */
    const editableGroups = groupsWithPermission(event, "members.edit");
    const deletableGroups = groupsWithPermission(event, "members.delete");
    const creatableGroups = groupsWithPermission(event, "members.create");

    return {
        members: normalized,
        groups: visibleGroups,
        groupNames: allGroups,
        permissions: perms,
        editableGroups,
        deletableGroups,
        canCreate: creatableGroups === null || creatableGroups.length > 0
    };
};

export const actions: Actions = {
    delete: async (event) => {
        const { request, locals } = event;

        const form = await request.formData();
        const id = form.get("id")?.toString();
        if (!id) return fail(400, { error: "Missing ID" });

        const target = await getMember(id);
        if (!target) return fail(404, { error: "Mitglied nicht gefunden" });

        // Ein Mitglied kann in mehreren Gruppen sein; eine davon genuegt.
        requirePermissionForAnyGroup(event, "members.delete", target.groups);

        const actor = locals.user?.userinfo?.name ?? locals.user?.userinfo?.email ?? "system";
        await deleteMember(id, actor);

        throw redirect(303, "/intern/members");
    }
};
