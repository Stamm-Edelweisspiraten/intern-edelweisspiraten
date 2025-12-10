import type { Actions, PageServerLoad } from "./$types";
import { createMember, updateMember } from "$lib/server/memberService";
import { getAllGroups } from "$lib/server/groupService";
import { redirect, fail, error } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/permissionGuard";
import { hasPermission } from "$lib/server/permissionService";
import { saveMemberFile } from "$lib/server/fileStore";

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "members.create");

    const groups = await getAllGroups();
    return { groups };
};

export const actions: Actions = {
    createMember: async ({ request, locals }) => {
        if (!hasPermission(locals.permissions ?? [], "members.create")) {
            throw error(403, "Keine Berechtigung");
        }

        const form = await request.formData();

        const firstname = form.get("firstname")?.toString() ?? "";
        const lastname = form.get("lastname")?.toString() ?? "";
        const fahrtenname = form.get("fahrtenname")?.toString() ?? "";
        const birthday = form.get("birthday")?.toString() ?? "";

        const address_street = form.get("address_street")?.toString() ?? "";
        const address_city = form.get("address_city")?.toString() ?? "";
        const address_zip = form.get("address_zip")?.toString() ?? "";

        const stand = form.get("stand")?.toString() ?? "";
        const status = form.get("status")?.toString() ?? "";

        const entryDate = form.get("joined")?.toString() ?? "";

        const isSecondMember = form.get("is_second_member") === "on";
        const contributionDues = {
            stamm: isSecondMember ? true : false,
            gau: isSecondMember && form.get("dues_gau") === "on",
            landesmark: isSecondMember && form.get("dues_landesmark") === "on",
            bund: isSecondMember && form.get("dues_bund") === "on"
        };

        const groups = JSON.parse(<string>form.get("groups") ?? "[]");

        const consentSocial = form.get("consent_social") === "on";
        const consentWebsite = form.get("consent_website") === "on";
        const consentPrint = form.get("consent_print") === "on";

        const consentFile = form.get("consent_file");
        const applicationFile = form.get("application_file");

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

        if (!firstname || !lastname || !birthday) {
            return fail(400, { error: "Bitte Pflichtfelder ausfüllen." });
        }

        const updatedBy = locals.user?.userinfo?.name ?? locals.user?.userinfo?.email ?? "system";

        const memberData = {
            firstname,
            lastname,
            ...(fahrtenname ? { fahrtenname } : {}),
            birthday,
            address: {
                street: address_street,
                city: address_city,
                zip: address_zip
            },
            stand,
            status,
            emails,
            numbers,
            groups,
            users: [],
            entryDate,
            updatedBy,
            isSecondMember,
            contributionDues,
            mediaConsent: {
                socialMedia: consentSocial,
                website: consentWebsite,
                print: consentPrint
            }
        };

        const created = await createMember(memberData);

        // Dateien speichern (optional)
        let fileUpdates: Record<string, any> = {};

        try {
            const consentMeta = await saveMemberFile(consentFile, created._id.toString(), "consent");
            if (consentMeta) {
                fileUpdates.consentFile = consentMeta;
            }
            const applicationMeta = await saveMemberFile(applicationFile, created._id.toString(), "application");
            if (applicationMeta) {
                fileUpdates.applicationFile = applicationMeta;
            }
        } catch (err: any) {
            return fail(400, { error: err?.message ?? "Datei-Upload fehlgeschlagen." });
        }

        if (Object.keys(fileUpdates).length > 0) {
            await updateMember(created._id.toString(), fileUpdates, updatedBy);
        }

        return {
            success: true,
            memberName: `${firstname} ${lastname}`,
            memberId: created._id?.toString?.() ?? null
        };
    }
};
