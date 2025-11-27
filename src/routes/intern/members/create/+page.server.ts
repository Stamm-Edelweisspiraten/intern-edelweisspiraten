import type { Actions, PageServerLoad } from "./$types";
import { createMember } from "$lib/server/memberService";
import { redirect, fail } from "@sveltejs/kit";

export const load: PageServerLoad = async () => {
    return {};
};

export const actions: Actions = {
    createMember: async ({ request, locals }) => {
        const form = await request.formData();

        // Grundfelder
        const firstname = form.get("firstname")?.toString() ?? "";
        const lastname = form.get("lastname")?.toString() ?? "";
        const birthday = form.get("birthday")?.toString() ?? "";

        const address_street = form.get("address_street")?.toString() ?? "";
        const address_city = form.get("address_city")?.toString() ?? "";
        const address_zip = form.get("address_zip")?.toString() ?? "";

        const stand = form.get("stand")?.toString() ?? "";
        const status = form.get("status")?.toString() ?? "";
        const group = form.get("group")?.toString() ?? "";

        const entryDate = form.get("joined")?.toString() ?? "";

        // Emails extrahieren
        const emails: { label: string; email: string }[] = [];
        for (const [key, value] of form.entries()) {
            if (key.startsWith("email_label_")) {
                const index = key.split("_")[2];
                const label = value.toString();
                const email = form.get(`email_email_${index}`)?.toString() ?? "";

                if (label || email) {
                    emails.push({ label, email });
                }
            }
        }

        // Telefonnummern extrahieren
        const numbers: { label: string; number: string }[] = [];
        for (const [key, value] of form.entries()) {
            if (key.startsWith("number_label_")) {
                const index = key.split("_")[2];
                const label = value.toString();
                const number = form.get(`number_number_${index}`)?.toString() ?? "";

                if (label || number) {
                    numbers.push({ label, number });
                }
            }
        }

        // Pflichtfelder prüfen
        if (!firstname || !lastname || !birthday) {
            return fail(400, { error: "Bitte fülle alle Pflichtfelder aus." });
        }

        // Member Objekt ZU 100% korrekt nach Typ
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
            group,
            users: [] as string[],
            entryDate,
            updatedBy: locals.user?.userinfo?.email ?? "system"
        };

        // Speichern
        await createMember(memberData);

        // Weiterleiten
        throw redirect(303, "/intern/members");
    }
};
