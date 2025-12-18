import type { Actions, PageServerLoad } from "./$types";
import { getMember, updateMember, deleteMember } from "$lib/server/memberService";
import { redirect, fail, error } from "@sveltejs/kit";
import { db } from "$lib/server/mongo";
import { ObjectId } from "mongodb";
import { getAllGroups } from "$lib/server/groupService";
import { hasPermission, getLeaderGroupIdsForUser } from "$lib/server/permissionService";
import { saveMemberFile, deleteMemberFile } from "$lib/server/fileStore";

export const load: PageServerLoad = async ({ params, url, locals }) => {
    const perms = locals.permissions ?? [];
    const canAll = hasPermission(perms, "members.view");
    const canGroup = hasPermission(perms, "members.group.view");
    if (!canAll && !canGroup) throw error(403, "Keine Berechtigung");

    const id = params.id;

    const member = await getMember(id);
    if (!member) throw redirect(303, "/intern/members");

    if (!canAll) {
        const allowedGroups = await getLeaderGroupIdsForUser(locals.user);
        const isAllowed = (member.groups ?? []).some((g: any) => allowedGroups.includes(g?.toString()));
        if (!isAllowed) throw error(403, "Keine Berechtigung");
    }

    member.userIds = member.userIds ?? [];
    member.groups = member.groups ?? [];

    const normalized = {
        id,
        firstname: member.firstname,
        lastname: member.lastname,
        fahrtenname: member.fahrtenname ?? "",
        birthday: member.birthday,
        address: member.address,
        stand: member.stand,
        status: member.status,
        groups: member.groups ?? [],
        entryDate: member.entryDate,
        emails: member.emails ?? [],
        numbers: member.numbers ?? [],
        isSecondMember: member.isSecondMember ?? false,
        contributionDues: {
            stamm: member.contributionDues?.stamm ?? false,
            gau: member.contributionDues?.gau ?? false,
            landesmark: member.contributionDues?.landesmark ?? false,
            bund: member.contributionDues?.bund ?? false
        },
        userIds: member.userIds,
        mediaConsent: {
            socialMedia: member.mediaConsent?.socialMedia ?? false,
            website: member.mediaConsent?.website ?? false,
            print: member.mediaConsent?.print ?? false
        },
        consentFile: member.consentFile ?? null,
        applicationFile: member.applicationFile ?? null,
        updatedAt: member.updatedAt ?? null,
        updatedBy: member.updatedBy ?? null
    };

    const relatedUsers = await db.collection("users")
        .find({ memberIds: id })
        .toArray();

    normalized.userIds = relatedUsers.map(u => u._id.toString());

    const allUsersRaw = await db.collection("users")
        .find({})
        .project({ name: 1, email: 1 })
        .toArray();

    const allUsers = allUsersRaw.map(u => ({
        id: u._id.toString(),
        name: u.name ?? "",
        email: u.email ?? ""
    }));

    const groupsAll = await getAllGroups();
    const groups = canAll ? groupsAll : groupsAll.filter((g) => (member.groups ?? []).includes(g.id));

    const scope = url.searchParams.get("scope") ?? "view";

    return {
        member: normalized,
        allUsers,
        groups,
        groupNames: groupsAll,
        scope,
        permissions: perms
    };
};


export const actions: Actions = {

    update: async ({ request, locals }) => {
        const perms = locals.permissions ?? [];
        const canAllEdit = hasPermission(perms, "members.edit");
        const canGroupEdit = hasPermission(perms, "members.group.edit");

        const form = await request.formData();

        const id = form.get("id")?.toString();
        if (!id) return fail(400, { error: "ID fehlt" });

        const existing = await getMember(id);
        if (!existing) {
            return fail(404, { error: "Mitglied nicht gefunden" });
        }

        if (!canAllEdit) {
            if (!canGroupEdit) throw error(403, "Keine Berechtigung");
            const allowedGroups = await getLeaderGroupIdsForUser(locals.user);
            const currentAllowed = (existing.groups ?? []).some((g: any) => allowedGroups.includes(g?.toString()));
            if (!currentAllowed) throw error(403, "Keine Berechtigung");
        }

        const firstname = form.get("firstname")?.toString() ?? "";
        const lastname = form.get("lastname")?.toString() ?? "";
        const fahrtenname = form.get("fahrtenname")?.toString() ?? "";
        const birthday = form.get("birthday")?.toString() ?? "";
        const address_street = form.get("address_street")?.toString() ?? "";
        const address_city = form.get("address_city")?.toString() ?? "";
        const address_zip = form.get("address_zip")?.toString() ?? "";
        const stand = form.get("stand")?.toString() ?? "";
        const status = form.get("status")?.toString() ?? "";

        const entryDate = form.get("entryDate")?.toString() ?? "";

        const isSecondMember = form.get("isSecondMember") === "on";
        const contributionDues = {
            stamm: isSecondMember ? true : false,
            gau: isSecondMember && form.get("contributionDues_gau") === "on",
            landesmark: isSecondMember && form.get("contributionDues_landesmark") === "on",
            bund: isSecondMember && form.get("contributionDues_bund") === "on"
        };

        // --- Gruppen-Array ---
        const groups = JSON.parse(<string>form.get("groups") ?? "[]");
        if (!canAllEdit) {
            const allowedGroups = await getLeaderGroupIdsForUser(locals.user);
            const allAllowed = groups.every((g: any) => allowedGroups.includes(g?.toString()));
            if (!allAllowed) throw error(403, "Gruppenauswahl nicht erlaubt");
        }

        const consentSocial = form.get("consent_social") === "on";
        const consentWebsite = form.get("consent_website") === "on";
        const consentPrint = form.get("consent_print") === "on";

        const consentFile = form.get("consent_file");
        const applicationFile = form.get("application_file");
        const removeConsent = form.get("remove_consent") === "true";
        const removeApplication = form.get("remove_application") === "true";

        if (!firstname || !lastname || !birthday) {
            return fail(400, { error: "Bitte Pflichtfelder ausfüllen." });
        }

        const emails: { label: string; email: string }[] = [];
        for (const [key, value] of form.entries()) {
            if (key.startsWith("email_label_")) {
                const index = key.split("_")[2];
                const label = value.toString();
                const email = form.get(`email_email_${index}`)?.toString() ?? "";
                if (label || email) emails.push({ label, email });
            }
        }

        const numbers: { label: string; number: string }[] = [];
        for (const [key, value] of form.entries()) {
            if (key.startsWith("number_label_")) {
                const index = key.split("_")[2];
                const label = value.toString();
                const number = form.get(`number_number_${index}`)?.toString() ?? "";
                if (label || number) numbers.push({ label, number });
            }
        }

        const updatedBy = locals.user?.userinfo?.name ?? locals.user?.userinfo?.email ?? "system";

        const updatedMember = {
            firstname,
            lastname,
            ...(fahrtenname ? { fahrtenname } : { fahrtenname: "" }),
            birthday,
            address: {
                street: address_street,
                city: address_city,
                zip: address_zip
            },
            stand,
            status,
            groups,
            entryDate,
            emails,
            numbers,
            isSecondMember,
            contributionDues,
            mediaConsent: {
                socialMedia: consentSocial,
                website: consentWebsite,
                print: consentPrint
            },
            updatedBy
        };

        try {
            const consentMeta = await saveMemberFile(consentFile, id, "consent", existing.consentFile?.id);
            if (consentMeta) {
                (updatedMember as any).consentFile = consentMeta;
            }

            const applicationMeta = await saveMemberFile(applicationFile, id, "application", existing.applicationFile?.id);
            if (applicationMeta) {
                (updatedMember as any).applicationFile = applicationMeta;
            }

            if (removeConsent && existing.consentFile?.id) {
                await deleteMemberFile(existing.consentFile.id);
                (updatedMember as any).consentFile = null;
            }

            if (removeApplication && existing.applicationFile?.id) {
                await deleteMemberFile(existing.applicationFile.id);
                (updatedMember as any).applicationFile = null;
            }
        } catch (err: any) {
            return fail(400, { error: err?.message ?? "Datei-Upload fehlgeschlagen." });
        }

        // userIds from form (optional)
        const userIdsRaw = form.get("userIds")?.toString();
        let userIds: string[] = [];
        if (userIdsRaw) {
            try {
                userIds = JSON.parse(userIdsRaw);
            } catch (e) {
                // ignore parse errors
            }
        }
        (updatedMember as any).userIds = userIds;

        await updateMember(id, updatedMember, updatedBy);

        if (userIds && Array.isArray(userIds)) {
            await db.collection("users").updateMany(
                { memberIds: id },
                { $pull: { memberIds: id } }
            );
            await db.collection("users").updateMany(
                { _id: { $in: userIds.map((uid) => new ObjectId(uid)) } },
                { $addToSet: { memberIds: id } }
            );
        }

        throw redirect(303, `/intern/members/${id}`);
    },


    delete: async ({ request, locals }) => {
        const perms = locals.permissions ?? [];
        const canAllDelete = hasPermission(perms, "members.delete");
        const canGroupDelete = hasPermission(perms, "members.group.delete");

        const form = await request.formData();
        const id = form.get("id")?.toString();

        if (!id) return fail(400, { error: "ID fehlt" });

        if (!canAllDelete) {
            if (!canGroupDelete) throw error(403, "Keine Berechtigung");
            const target = await getMember(id);
            if (!target) return fail(404, { error: "Mitglied nicht gefunden" });
            const allowedGroups = await getLeaderGroupIdsForUser(locals.user);
            const allowed = (target.groups ?? []).some((g: any) => allowedGroups.includes(g?.toString()));
            if (!allowed) throw error(403, "Keine Berechtigung");
        }

        const actor = locals.user?.userinfo?.name ?? locals.user?.userinfo?.email ?? "system";
        await deleteMember(id, actor);

        throw redirect(303, "/intern/members");
    },


    "update-users": async ({ request, locals }) => {
        if (!hasPermission(locals.permissions ?? [], "members.edit")) {
            throw error(403, "Keine Berechtigung");
        }

        const form = await request.formData();

        const memberId = form.get("memberId");
        const userIds = JSON.parse(<string>form.get("userIds"));

        await db.collection("users").updateMany(
            { memberIds: memberId },
            { $pull: { memberIds: memberId } }
        );

        await db.collection("users").updateMany(
            { _id: { $in: userIds.map((id: string) => new ObjectId(id)) } },
            { $addToSet: { memberIds: memberId } }
        );

        return { success: true };
    }
};
