import type { Actions, PageServerLoad } from "./$types";
import {
    getMember,
    updateMember,
    deleteMember,
    type MemberInput
} from "$lib/server/memberService";
import { redirect, fail } from "@sveltejs/kit";
import { getAllGroups } from "$lib/server/groupService";
import { getAllUsers, getUsersForMember, setUsersForMember } from "$lib/server/userService";
import {
    groupsWithPermission,
    requirePermission,
    requirePermissionForAnyGroup
} from "$lib/server/permissionGuard";
import { hasPermissionForAnyGroup } from "$lib/server/permissionService";
import { matchesPermission } from "$lib/permissions/match";
import { saveMemberFile, deleteMemberFile } from "$lib/server/fileStore";

export const load: PageServerLoad = async (event) => {
    const { params, url, locals } = event;
    const perms = locals.permissions ?? [];

    const id = params.id;

    const member = await getMember(id);
    if (!member) throw redirect(303, "/intern/members");

    // Ein Mitglied kann in mehreren Gruppen sein -- eine zustaendige genuegt.
    requirePermissionForAnyGroup(event, "members.view", member.groups);

    const [relatedUsers, allUserRows] = await Promise.all([
        getUsersForMember(id),
        getAllUsers()
    ]);

    const normalized = {
        id,
        firstname: member.firstname,
        lastname: member.lastname,
        fahrtenname: member.fahrtenname ?? "",
        birthday: member.birthday,
        address: member.address,
        stand: member.stand,
        status: member.status,
        groups: member.groups,
        entryDate: member.entryDate,
        emails: member.emails,
        numbers: member.numbers,
        isSecondMember: member.isSecondMember,
        contributionDues: member.contributionDues,
        userIds: relatedUsers.map((user) => user.id),
        mediaConsent: member.mediaConsent,
        consentFile: member.consentFile ?? null,
        applicationFile: member.applicationFile ?? null,
        updatedAt: member.updatedAt,
        updatedBy: member.updatedBy
    };

    const allUsers = allUserRows.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email
    }));

    const groupsAll = await getAllGroups();

    /**
     * Zur Auswahl stehen die Gruppen, fuer die Aenderungsrecht besteht, plus
     * die, in denen das Mitglied bereits ist -- Letztere nur zur Anzeige. Die
     * Action haelt Gruppen ausserhalb der Zustaendigkeit ohnehin fest.
     */
    const editable = groupsWithPermission(event, "members.edit");
    const groups =
        editable === null
            ? groupsAll
            : groupsAll.filter(
                  (g) => editable.includes(g.id) || member.groups.includes(g.id)
              );

    const scope = url.searchParams.get("scope") ?? "view";

    /**
     * Die Seite kann nicht selbst entscheiden, ob bearbeitet werden darf: die
     * flache Rechteliste enthaelt nur die stammesweiten Rechte. Der Server
     * beantwortet die Frage deshalb fuer genau dieses Mitglied.
     */
    const grants = locals.grants ?? [];
    const canEdit = hasPermissionForAnyGroup(grants, "members.edit", member.groups);
    const canDelete = hasPermissionForAnyGroup(grants, "members.delete", member.groups);

    return {
        member: normalized,
        allUsers,
        groups,
        groupNames: groupsAll,
        scope,
        permissions: perms,
        canEdit,
        canDelete,
        canViewLog: true,
        canLinkUsers: canEdit && matchesPermission(perms, "user.edit")
    };
};


export const actions: Actions = {

    update: async (event) => {
        const { request, locals } = event;
        const form = await request.formData();

        const id = form.get("id")?.toString();
        if (!id) return fail(400, { error: "ID fehlt" });

        const existing = await getMember(id);
        if (!existing) {
            return fail(404, { error: "Mitglied nicht gefunden" });
        }

        requirePermissionForAnyGroup(event, "members.edit", existing.groups);

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

        /**
         * Die Beitragshaken gelten fuer ALLE Mitglieder. Vorher wurden sie
         * ausserhalb der Zweitmitgliedschaft pauschal auf false gesetzt, und
         * die Beitragsberechnung ignorierte sie fuer regulaere Mitglieder
         * ohnehin -- diese zahlten damit immer den vollen Beitrag.
         */
        const contributionDues = {
            stamm: form.get("contributionDues_stamm") === "on",
            gau: form.get("contributionDues_gau") === "on",
            landesmark: form.get("contributionDues_landesmark") === "on",
            bund: form.get("contributionDues_bund") === "on"
        };

        /**
         * Gruppen aus dem versteckten Feld.
         *
         * Vorher ein rohes JSON.parse: ein manipuliertes oder leeres Feld
         * erzeugte einen 500er statt einer Meldung -- und ein 500er sieht wie
         * ein Fehler des Portals aus, nicht wie eine fehlerhafte Eingabe.
         */
        let groups: string[];
        try {
            const parsed: unknown = JSON.parse(form.get("groups")?.toString() || "[]");
            if (!Array.isArray(parsed)) throw new Error("kein Array");
            groups = parsed.map(String).filter(Boolean);
        } catch {
            return fail(400, { error: "Die Gruppenauswahl konnte nicht gelesen werden." });
        }

        /**
         * Wer nur fuer bestimmte Gruppen zustaendig ist, darf auch nur diese
         * setzen oder entfernen. Bestehende Zugehoerigkeiten ausserhalb der
         * Zustaendigkeit bleiben unveraendert bestehen.
         *
         * Die vorherige Pruefung verlangte, dass JEDE resultierende Gruppe in
         * der Zustaendigkeit liegt -- ein Mitglied in Meute UND Sippe liess
         * sich dadurch von keiner der beiden Leitungen mehr speichern.
         */
        const editableGroups = groupsWithPermission(event, "members.edit");
        if (editableGroups !== null) {
            const untouched = existing.groups.filter((g) => !editableGroups.includes(g));
            const chosen = groups.filter((g) => editableGroups.includes(g));
            groups = Array.from(new Set([...untouched, ...chosen]));
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

        const updatedMember: MemberInput & { updatedBy: string } = {
            firstname,
            lastname,
            fahrtenname,
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
            const consentMeta = await saveMemberFile(
                consentFile,
                id,
                "consent",
                existing.consentFile?.id
            );
            if (consentMeta) updatedMember.consentFileId = consentMeta.id;

            const applicationMeta = await saveMemberFile(
                applicationFile,
                id,
                "application",
                existing.applicationFile?.id
            );
            if (applicationMeta) updatedMember.applicationFileId = applicationMeta.id;

            if (removeConsent && existing.consentFile?.id) {
                await deleteMemberFile(existing.consentFile.id);
                updatedMember.consentFileId = null;
            }

            if (removeApplication && existing.applicationFile?.id) {
                await deleteMemberFile(existing.applicationFile.id);
                updatedMember.applicationFileId = null;
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Datei-Upload fehlgeschlagen.";
            return fail(400, { error: message });
        }

        await updateMember(id, updatedMember, updatedBy);

        /*
         * Verknuepfte Zugaenge, sofern das Formular sie mitschickt.
         *
         * Wer sie setzt, bestimmt, wer die Daten des Mitglieds sehen darf --
         * dafuer genuegt members.edit nicht, es braucht zusaetzlich user.edit.
         * Dieselbe Regel wie in der Action "update-users"; vorher fehlte sie
         * auf diesem Weg vollstaendig.
         */
        const userIdsRaw = form.get("userIds")?.toString();
        if (userIdsRaw) {
            requirePermission(event, "user.edit");
            try {
                const parsed: unknown = JSON.parse(userIdsRaw);
                if (Array.isArray(parsed)) {
                    await setUsersForMember(id, parsed.map(String).filter(Boolean));
                }
            } catch {
                return fail(400, {
                    error:
                        "Die Angaben wurden gespeichert, die Zuordnung der Zugänge " +
                        "konnte aber nicht gelesen werden."
                });
            }
        }

        /*
         * Beide Actions dieser Seite antworten gleich.
         *
         * Vorher endete `update` mit einem 303 und `update-users` mit
         * `{ success: true }` -- die eine Aenderung war danach zu sehen, die
         * andere nicht, und die Rueckmeldung erschien nur bei einer von
         * beiden. Die Seite zieht die Daten ueber `invalidateAll()` nach.
         */
        return { success: "Die Änderungen wurden gespeichert." };
    },


    delete: async (event) => {
        const { request, locals } = event;
        const form = await request.formData();
        const id = form.get("id")?.toString();

        if (!id) return fail(400, { error: "ID fehlt" });

        const target = await getMember(id);
        if (!target) return fail(404, { error: "Mitglied nicht gefunden" });

        requirePermissionForAnyGroup(event, "members.delete", target.groups);

        const actor = locals.user?.userinfo?.name ?? locals.user?.userinfo?.email ?? "system";
        const removed = await deleteMember(id, actor);
        if (!removed) return fail(404, { error: "Mitglied nicht gefunden" });

        throw redirect(303, "/intern/members?hinweis=geloescht");
    },


    /**
     * Zugaenge mit dem Mitglied verknuepfen.
     *
     * Zusaetzlich zu members.edit fuer dieses Mitglied wird user.edit
     * verlangt: hier wird bestimmt, wer die Daten des Mitglieds sehen darf.
     */
    "update-users": async (event) => {
        const { request } = event;
        const form = await request.formData();

        const memberId = String(form.get("memberId") ?? "");

        const member = await getMember(memberId);
        if (!member) return fail(404, { error: "Mitglied nicht gefunden" });

        requirePermissionForAnyGroup(event, "members.edit", member.groups);
        requirePermission(event, "user.edit");

        // Auch hier ein verstecktes Feld mit JSON -- ohne try ein 500er.
        let userIds: string[];
        try {
            const parsed: unknown = JSON.parse(form.get("userIds")?.toString() || "[]");
            if (!Array.isArray(parsed)) throw new Error("kein Array");
            userIds = parsed.map(String).filter(Boolean);
        } catch {
            return fail(400, { error: "Die Auswahl konnte nicht gelesen werden." });
        }

        await setUsersForMember(memberId, userIds);

        return { success: "Die verknüpften Zugänge wurden gespeichert." };
    }
};
