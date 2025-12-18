import type { PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { listOrdersForMembers } from "$lib/server/kaemmererService";
import { getMembersByIds } from "$lib/server/memberService";
import { getUserByEmail } from "$lib/server/userService";

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "kaemmerer.access");

    const email = event.locals.user?.userinfo?.email ?? "";
    const dbUser = email ? await getUserByEmail(email) : null;
    const memberIds: string[] = (dbUser?.memberIds ?? []).map((id: any) => id?.toString?.() ?? id).filter(Boolean);
    const membersRaw = memberIds.length ? await getMembersByIds(memberIds) : [];
    const members = membersRaw.map((m: any) => ({
        id: m._id?.toString?.() ?? m.id,
        name: `${m.firstname ?? ""} ${m.lastname ?? ""}`.trim() || m.firstname || m.lastname || "Unbekannt"
    }));

    const orders = await listOrdersForMembers(memberIds);

    return { orders, members };
};
