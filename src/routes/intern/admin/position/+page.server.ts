import type { Actions, PageServerLoad } from "./$types";
import { error, fail } from "@sveltejs/kit";
import { hasPermission } from "$lib/server/permissionService";
import { createPosition, deletePosition, getAllPositions, updatePosition } from "$lib/server/positionService";
import { getAllMembers } from "$lib/server/memberService";

export const load: PageServerLoad = async ({ locals }) => {
    if (!hasPermission(locals.permissions ?? [], "admin.view")) {
        throw error(403, "Keine Berechtigung");
    }

    const [positions, members] = await Promise.all([
        getAllPositions(),
        getAllMembers()
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

    return { positions: enriched, members: memberOptions };
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

        if (!name) {
            return fail(400, { error: "Name ist erforderlich." });
        }

        await createPosition({
            name,
            email,
            description,
            memberIds
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

        if (!id) return fail(400, { error: "ID fehlt." });
        if (!name) return fail(400, { error: "Name ist erforderlich." });

        await updatePosition(id, {
            name,
            email,
            description,
            memberIds
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
