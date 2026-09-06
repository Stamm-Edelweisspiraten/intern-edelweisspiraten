import type { Actions, PageServerLoad } from "./$types";
import { createMember, updateMember, type MemberInput } from "$lib/server/memberService";
import { getAllGroups } from "$lib/server/groupService";
import { fail } from "@sveltejs/kit";
import { requireGroupsWithPermission } from "$lib/server/permissionGuard";
import { saveMemberFile } from "$lib/server/fileStore";

/**
 * Mitglied anlegen.
 *
 * Der Gruppenbezug entscheidet, nicht die flache Rechteliste: `members.create`
 * kann fuer einzelne Gruppen zugewiesen sein. Vorher verlangten load und
 * Action das Recht STAMMESWEIT (requirePermission), waehrend die Liste die
 * Schaltflaeche aus groupsWithPermission berechnete -- eine gruppenbezogene
 * Leitung sah "Mitglied anlegen" und bekam beim Klick 403.
 */
export const load: PageServerLoad = async (event) => {
    const creatable = requireGroupsWithPermission(event, "members.create");

    const groups = await getAllGroups();

    // Zur Auswahl steht nur, wofuer Zustaendigkeit besteht: sonst legt man ein
    // Mitglied an, das man anschliessend selbst nicht mehr sieht.
    return {
        groups: creatable === null ? groups : groups.filter((group) => creatable.includes(group.id))
    };
};

export const actions: Actions = {
    createMember: async (event) => {
        // Jede Action sichert sich selbst ab -- bei einer Form-Action laeuft
        // das load gar nicht erst.
        const creatable = requireGroupsWithPermission(event, "members.create");

        const { request, locals } = event;
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

        /**
         * Die Beitragshaken gelten fuer ALLE Mitglieder, nicht nur fuer
         * Zweitmitglieder. Vorher wurden sie ausserhalb dieses Falls
         * pauschal auf false gesetzt -- und die Beitragsberechnung ignorierte
         * sie fuer regulaere Mitglieder ohnehin, sodass diese immer den
         * vollen Beitrag zahlten.
         */
        const contributionDues = {
            stamm: form.get("dues_stamm") === "on",
            gau: form.get("dues_gau") === "on",
            landesmark: form.get("dues_landesmark") === "on",
            bund: form.get("dues_bund") === "on"
        };

        /**
         * Das versteckte Feld traegt JSON. Ein rohes JSON.parse endete bei
         * leerem oder manipuliertem Inhalt in einem 500er statt in einer
         * Meldung.
         */
        let groups: string[];
        try {
            const parsed: unknown = JSON.parse(form.get("groups")?.toString() || "[]");
            if (!Array.isArray(parsed)) throw new Error("kein Array");
            groups = parsed.map(String).filter(Boolean);
        } catch {
            return fail(400, { error: "Die Gruppenauswahl konnte nicht gelesen werden." });
        }

        // Angelegt werden darf nur in Gruppen, fuer die das Recht gilt --
        // dieselbe Regel wie in POST /api/v1/members.
        if (creatable !== null) {
            if (groups.some((id) => !creatable.includes(id))) {
                return fail(403, {
                    error: "Für mindestens eine der gewählten Gruppen fehlt die Berechtigung."
                });
            }
            if (groups.length === 0) {
                return fail(400, {
                    error: "Bitte mindestens eine Gruppe wählen, für die du zuständig bist."
                });
            }
        }

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

        const memberData: MemberInput & { updatedBy: string } = {
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

        /**
         * Unterlagen nachtragen.
         *
         * Hier standen vorher die Schluessel `consentFile` und
         * `applicationFile`. Die kennt weder MemberInput noch toColumns() --
         * unbekannte Schluessel werden verworfen. Die hochgeladenen Dateien
         * landeten damit in `files`, wurden aber nie mit dem Mitglied
         * verknuepft und waren anschliessend unerreichbar. Richtig sind die
         * Fremdschluessel `consentFileId` und `applicationFileId`.
         */
        const fileUpdates: MemberInput = {};

        try {
            const consentMeta = await saveMemberFile(consentFile, created.id, "consent");
            if (consentMeta) fileUpdates.consentFileId = consentMeta.id;

            const applicationMeta = await saveMemberFile(
                applicationFile,
                created.id,
                "application"
            );
            if (applicationMeta) fileUpdates.applicationFileId = applicationMeta.id;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Datei-Upload fehlgeschlagen.";
            // Das Mitglied steht bereits -- das gehoert in die Meldung, sonst
            // legt man es aus Versehen ein zweites Mal an.
            return fail(400, {
                error: `${message} Das Mitglied wurde angelegt, die Unterlage nicht gespeichert.`
            });
        }

        if (Object.keys(fileUpdates).length > 0) {
            await updateMember(created.id, fileUpdates, updatedBy);
        }

        return {
            success: true,
            memberName: `${firstname} ${lastname}`,
            memberId: created.id
        };
    }
};
