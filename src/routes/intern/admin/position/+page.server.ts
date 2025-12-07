import type { Actions, PageServerLoad } from "./$types";
import { error, fail } from "@sveltejs/kit";
import { hasPermission } from "$lib/server/permissionService";
import { createPosition, deletePosition, getAllPositions, updatePosition } from "$lib/server/positionService";
import { getAllMembers } from "$lib/server/memberService";
import { getAllGroups } from "$lib/server/groupService";

export const load: PageServerLoad = async ({ locals }) => {
    if (!hasPermission(locals.permissions ?? [], "admin.view")) {
        throw error(403, "Keine Berechtigung");
    }

    const [positions, members, groups] = await Promise.all([
        getAllPositions(),
        getAllMembers(),
        getAllGroups()
    ]);

    const memberMap = new Map(
        members.map((m: any) => [
            m._id.toString(),
            {
                id: m._id.toString(),
                name: `${m.firstname} ${m.lastname}`,
                email: (m.emails ?? [])[0]?.email ?? ""
            }
        ])
    );

    const enriched = positions.map((p) => ({
        ...p,
        members: (p.memberIds ?? []).map((id) => memberMap.get(id)).filter(Boolean)
    }));

    const memberOptions = members.map((m: any) => ({
        id: m._id.toString(),
        name: `${m.firstname} ${m.lastname}`,
        email: (m.emails ?? [])[0]?.email ?? ""
    }));

    return { positions: enriched, members: memberOptions, groups };
};

export const actions: Actions = {
    create: async ({ request, locals }) => {
        if (!hasPermission(locals.permissions ?? [], "admin.*")) {
            throw error(403, "Keine Berechtigung");
        }

        const form = await request.formData();
        const name = form.get("name")?.toString().trim() ?? "";
        const email = form.get("email")?.toString().trim() ?? "";
        const description = form.get("description")?.toString().trim() ?? "";
        const memberIds = form.getAll("memberIds").map((v) => v.toString()).filter(Boolean);
        const type = (form.get("type")?.toString() ?? "amt") as "amt" | "gruppenleiter";
        const groupId = form.get("groupId")?.toString().trim() ?? "";

        if (!name) {
            return fail(400, { error: "Name ist erforderlich." });
        }
        if (type === "gruppenleiter" && !groupId) {
            return fail(400, { error: "Gruppe ist für Gruppenleiter erforderlich." });
        }

        await createPosition({
            name,
            email,
            description,
            memberIds,
            type,
            groupId
        });

        return { success: true };
    },
    update: async ({ request, locals }) => {
        if (!hasPermission(locals.permissions ?? [], "admin.*")) {
            throw error(403, "Keine Berechtigung");
        }

        const form = await request.formData();
        const id = form.get("id")?.toString() ?? "";
        const name = form.get("name")?.toString().trim() ?? "";
        const email = form.get("email")?.toString().trim() ?? "";
        const description = form.get("description")?.toString().trim() ?? "";
        const memberIds = form.getAll("memberIds").map((v) => v.toString()).filter(Boolean);
        const type = (form.get("type")?.toString() ?? "amt") as "amt" | "gruppenleiter";
        const groupId = form.get("groupId")?.toString().trim() ?? "";

        if (!id) return fail(400, { error: "ID fehlt." });
        if (!name) return fail(400, { error: "Name ist erforderlich." });
        if (type === "gruppenleiter" && !groupId) return fail(400, { error: "Gruppe ist erforderlich." });

        await updatePosition(id, {
            name,
            email,
            description,
            memberIds,
            type,
            groupId
        });

        return { success: true };
    },
    delete: async ({ request, locals }) => {
        if (!hasPermission(locals.permissions ?? [], "admin.*")) {
            throw error(403, "Keine Berechtigung");
        }

        const form = await request.formData();
        const id = form.get("id")?.toString() ?? "";

        if (!id) return fail(400, { error: "ID fehlt." });

        await deletePosition(id);

        return { success: true };
    }
};
