import type { Actions, PageServerLoad } from "./$types";
import { fail } from "@sveltejs/kit";
import { requireAnyPermission } from "$lib/server/permissionGuard";
import { createPosition, deletePosition, getAllPositions, updatePosition } from "$lib/server/positionService";
import { getAllMembers } from "$lib/server/memberService";
import { getAllGroups } from "$lib/server/groupService";
import { listRoles } from "$lib/server/roleService";
import { isGroupScopable } from "$lib/permissions";

/**
 * Ämter und Gruppenleitungen.
 *
 * Neu: Ein Amt kann eine Rolle tragen. Wer das Amt innehat, bekommt deren
 * Rechte -- bei einem Amt mit Gruppenbezug nur fuer diese Gruppe. Damit ist
 * "Gruppenleitung Meute Panther" ein gewoehnliches Amt mit der Rolle
 * "Gruppenleitung"; die frueher fest verdrahtete Sonderrolle des Typs
 * `gruppenleiter` entfaellt, der Typ bleibt reine Beschriftung.
 *
 * Die Pruefung verlangte hier woertlich den Schluessel "admin.*". Da
 * Platzhalter nur auf der GEHALTENEN Seite gedeutet werden, traf sie nur
 * Rollen, die exakt "admin.*" fuehren -- eine Rolle mit "*" fiel durch.
 */

const GUARD = ["admin.view", "roles.manage"] as const;

export const load: PageServerLoad = async (event) => {
    requireAnyPermission(event, GUARD);

    const [positions, members, groups, roles] = await Promise.all([
        getAllPositions(),
        getAllMembers(),
        getAllGroups(),
        listRoles()
    ]);

    const memberMap = new Map(
        members.map((m) => [
            m.id,
            {
                id: m.id,
                name: `${m.firstname} ${m.lastname}`,
                email: m.emails[0]?.email ?? ""
            }
        ])
    );

    const enriched = positions.map((p) => ({
        ...p,
        members: (p.memberIds ?? []).map((id: string) => memberMap.get(id)).filter(Boolean)
    }));

    const memberOptions = members.map((m) => ({
        id: m.id,
        name: `${m.firstname} ${m.lastname}`,
        email: m.emails[0]?.email ?? ""
    }));

    return {
        positions: enriched,
        members: memberOptions,
        groups,
        roles: roles.map((role) => ({
            id: role.id,
            name: role.name,
            description: role.description ?? "",
            /** Nur solche Rollen wirken mit dem Gruppenbezug des Amts sinnvoll. */
            groupScopable: (role.permissions ?? []).some(isGroupScopable)
        }))
    };
};

/** Die gemeinsamen Felder beider Formulare. */
function readForm(form: FormData) {
    return {
        name: form.get("name")?.toString().trim() ?? "",
        email: form.get("email")?.toString().trim() ?? "",
        description: form.get("description")?.toString().trim() ?? "",
        memberIds: form.getAll("memberIds").map((v) => v.toString()).filter(Boolean),
        type: (form.get("type")?.toString() ?? "amt") as "amt" | "gruppenleiter",
        groupId: form.get("groupId")?.toString().trim() ?? "",
        roleId: form.get("roleId")?.toString().trim() ?? ""
    };
}

export const actions: Actions = {
    create: async (event) => {
        requireAnyPermission(event, GUARD);

        const input = readForm(await event.request.formData());

        if (!input.name) return fail(400, { error: "Name ist erforderlich." });
        if (input.type === "gruppenleiter" && !input.groupId) {
            return fail(400, { error: "Gruppe ist für Gruppenleiter erforderlich." });
        }

        await createPosition(input);
        return { success: true };
    },

    update: async (event) => {
        requireAnyPermission(event, GUARD);

        const form = await event.request.formData();
        const id = form.get("id")?.toString() ?? "";
        const input = readForm(form);

        if (!id) return fail(400, { error: "ID fehlt." });
        if (!input.name) return fail(400, { error: "Name ist erforderlich." });
        if (input.type === "gruppenleiter" && !input.groupId) {
            return fail(400, { error: "Gruppe ist erforderlich." });
        }

        await updatePosition(id, input);
        return { success: true };
    },

    delete: async (event) => {
        requireAnyPermission(event, GUARD);

        const form = await event.request.formData();
        const id = form.get("id")?.toString() ?? "";

        if (!id) return fail(400, { error: "ID fehlt." });

        await deletePosition(id);
        return { success: true };
    }
};
