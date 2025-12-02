import type { Actions, PageServerLoad } from "./$types";
import { createMember } from "$lib/server/memberService";
import { getAllGroups } from "$lib/server/groupService";
import { redirect, fail } from "@sveltejs/kit";

export const load: PageServerLoad = async () => {
    const groups = await getAllGroups();
    return { groups };
};

export const actions: Actions = {
    createMember: async ({ request, locals }) => {
        const form = await request.formData();

        const firstname = form.get("firstname")?.toString() ?? "";
        const lastname = form.get("lastname")?.toString() ?? "";
        const birthday = form.get("birthday")?.toString() ?? "";

        const address_street = form.get("address_street")?.toString() ?? "";
        const address_city = form.get("address_city")?.toString() ?? "";
        const address_zip = form.get("address_zip")?.toString() ?? "";

        const stand = form.get("stand")?.toString() ?? "";
        const status = form.get("status")?.toString() ?? "";

        const entryDate = form.get("joined")?.toString() ?? "";

        const groups = JSON.parse(<string>form.get("groups") ?? "[]");

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

        const memberData = {
            firstname,
            lastname,
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
            updatedBy: locals.user?.userinfo?.email ?? "system"
        };

        await createMember(memberData);

        throw redirect(303, "/intern/members");
    }
};
