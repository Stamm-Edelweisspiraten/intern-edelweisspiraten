import type { Actions, PageServerLoad } from "./$types";
import { getMember, updateMember, deleteMember } from "$lib/server/memberService";
import { redirect, fail } from "@sveltejs/kit";

export const load: PageServerLoad = async ({ params, url }) => {
    const id = params.id;

    const member = await getMember(id);
    if (!member) {
        throw redirect(303, "/intern/members");
    }

    // UI-friendly normalization
    const normalized = {
        id,
        firstname: member.firstname,
        lastname: member.lastname,
        birthday: member.birthday,
        address: member.address,
        stand: member.stand,
        status: member.status,
        group: member.group,
        entryDate: member.entryDate,
        emails: member.emails || [],
        numbers: member.numbers || []
    };

    const scope = url.searchParams.get("scope") ?? "view";

    return {
        member: normalized,
        scope
    };
};


export const actions: Actions = {

    // ---------------------------------------
    // UPDATE
    // ---------------------------------------
    update: async ({ request, locals }) => {
        const form = await request.formData();

        const id = form.get("id")?.toString();
        if (!id) return fail(400, { error: "ID fehlt" });

        // Grunddaten
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

        // Pflichtfelder prüfen
        if (!firstname || !lastname || !birthday) {
            return fail(400, { error: "Bitte fülle alle Pflichtfelder aus." });
        }


        // -------------------------------
        // Emails extrahieren
        // -------------------------------
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

        // -------------------------------
        // Nummern extrahieren
        // -------------------------------
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


        // -------------------------------
        // Member-Objekt bauen
        // -------------------------------
        const updatedMember = {
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
            group,
            entryDate,
            emails,
            numbers,
            updatedBy: locals.user?.userinfo?.email ?? "system"
        };


        // -------------------------------
        // Speichern
        // -------------------------------
        const updatedBy = locals.user?.userinfo?.email ?? "system";

        await updateMember(id, updatedMember, updatedBy);

        throw redirect(303, `/intern/members/${id}`);
    },


    // ---------------------------------------
    // DELETE
    // ---------------------------------------
    delete: async ({ request }) => {
        const form = await request.formData();
        const id = form.get("id")?.toString();

        if (!id) return fail(400, { error: "ID fehlt" });

        await deleteMember(id);

        throw redirect(303, "/intern/members");
    }
};
