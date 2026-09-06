import type { Actions, PageServerLoad } from "./$types";
import {
    assignInviteCode,
    deleteMember,
    getAllMembers,
    getMember,
    getMembersByGroupIds,
    getMembersByIds,
    inviteCodeState,
    type Member
} from "$lib/server/memberService";
import { env } from "$env/dynamic/private";
import { redirect, fail } from "@sveltejs/kit";
import {
    groupsWithPermission,
    requireGroupsWithPermission,
    requirePermissionForAnyGroup
} from "$lib/server/permissionGuard";
import { getAllGroups } from "$lib/server/groupService";
import type { RequestEvent } from "./$types";

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
            numbers: m.numbers,
            /**
             * Fuer "Einladungslink kopieren" und die Sammelaktionen: der Link
             * ist oeffentlich, das Geheimnis ist der Code daneben. Fehlt oder
             * verfaellt er, ist der Link wertlos -- deshalb wandert der
             * Zustand mit.
             */
            inviteCode: m.inviteCode ?? "",
            inviteStatus: inviteCodeState(m),
            inviteExpiresAt: m.inviteCodeExpiresAt ?? ""
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
        canCreate: creatableGroups === null || creatableGroups.length > 0,
        /** Grundadresse der Beitrittslinks -- der Browser kennt env nicht. */
        inviteBaseUrl: (env.PUBLIC_APP_URL || event.url.origin).replace(/\/+$/, "")
    };
};

/**
 * Kennungen einer Sammelaktion einlesen und gegen die Zustaendigkeit pruefen.
 *
 * Abgewiesen wird, sobald EIN Datensatz daneben liegt -- nicht still
 * gefiltert. Ein stilles Filtern hiesse: die Rueckmeldung nennt eine Zahl,
 * die nicht zur Auswahl passt, und niemand erfaehrt, welcher Datensatz fehlte.
 */
async function collectSelection(
    event: RequestEvent,
    form: FormData,
    permission: string
): Promise<{ members: Member[] } | { failure: ReturnType<typeof fail> }> {
    const ids = Array.from(
        new Set(form.getAll("ids").map(String).map((id) => id.trim()).filter(Boolean))
    );

    if (ids.length === 0) {
        return { failure: fail(400, { error: "Es wurde kein Mitglied ausgewählt." }) };
    }

    const allowed = groupsWithPermission(event, permission);
    if (allowed !== null && allowed.length === 0) {
        return { failure: fail(403, { error: "Keine Berechtigung." }) };
    }

    const members = await getMembersByIds(ids);
    if (members.length !== ids.length) {
        return { failure: fail(404, { error: "Nicht alle ausgewählten Mitglieder wurden gefunden." }) };
    }

    if (allowed !== null) {
        const outside = members.filter(
            (member) => !member.groups.some((groupId) => allowed.includes(groupId))
        );
        if (outside.length > 0) {
            return {
                failure: fail(403, {
                    error: `Für ${outside.length} der ausgewählten Mitglieder fehlt die Berechtigung.`
                })
            };
        }
    }

    return { members };
}

export const actions: Actions = {
    delete: async (event) => {
        const { request, locals } = event;

        const form = await request.formData();
        const id = form.get("id")?.toString();
        if (!id) return fail(400, { error: "Es wurde kein Mitglied angegeben." });

        const target = await getMember(id);
        if (!target) return fail(404, { error: "Mitglied nicht gefunden" });

        // Ein Mitglied kann in mehreren Gruppen sein; eine davon genuegt.
        requirePermissionForAnyGroup(event, "members.delete", target.groups);

        const actor = locals.user?.userinfo?.name ?? locals.user?.userinfo?.email ?? "system";
        const removed = await deleteMember(id, actor);
        if (!removed) return fail(404, { error: "Mitglied nicht gefunden" });

        throw redirect(303, "/intern/members?hinweis=geloescht");
    },

    /** Mehrere Mitglieder auf einmal loeschen. */
    deleteSelected: async (event) => {
        const form = await event.request.formData();
        const selection = await collectSelection(event, form, "members.delete");
        if ("failure" in selection) return selection.failure;

        const actor =
            event.locals.user?.userinfo?.name ?? event.locals.user?.userinfo?.email ?? "system";

        let removed = 0;
        for (const member of selection.members) {
            if (await deleteMember(member.id, actor)) removed += 1;
        }

        return {
            success:
                removed === 1
                    ? "Ein Mitglied wurde gelöscht."
                    : `${removed} Mitglieder wurden gelöscht.`
        };
    },

    /**
     * Einladungscodes erneuern.
     *
     * `assignInviteCode()` war exportiert, aber von keiner Route erreichbar --
     * ein nach 60 Tagen abgelaufener Code liess sich damit gar nicht erneuern.
     * Das Aendern eines Codes ist eine Aenderung am Mitglied, also members.edit.
     */
    renewInvites: async (event) => {
        const form = await event.request.formData();
        const selection = await collectSelection(event, form, "members.edit");
        if ("failure" in selection) return selection.failure;

        let renewed = 0;
        const failed: string[] = [];

        for (const member of selection.members) {
            try {
                await assignInviteCode(member.id);
                renewed += 1;
            } catch (err) {
                console.error(`Einladungscode fuer ${member.id} fehlgeschlagen:`, err);
                failed.push(`${member.firstname} ${member.lastname}`.trim());
            }
        }

        if (renewed === 0) {
            return fail(500, { error: "Es konnte kein Einladungscode erneuert werden." });
        }

        const base =
            renewed === 1
                ? "Ein Einladungscode wurde erneuert."
                : `${renewed} Einladungscodes wurden erneuert.`;

        return {
            success: failed.length === 0 ? base : `${base} Fehlgeschlagen: ${failed.join(", ")}.`
        };
    }
};
