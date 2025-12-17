import type { PageServerLoad } from "./$types";
import { getMembersByIds } from "$lib/server/memberService";
import { getUserByEmail } from "$lib/server/userService";

export const load: PageServerLoad = async ({ locals }) => {
    const userinfo = locals.user?.userinfo;
    const email = userinfo?.email ?? "";

    const dbUser = email ? await getUserByEmail(email) : null;
    const memberIds: string[] = (dbUser?.memberIds ?? []).map((id: any) => id?.toString?.() ?? id).filter(Boolean);
    const members = memberIds.length ? await getMembersByIds(memberIds) : [];

    return {
        userinfo,
        dbUser: dbUser
            ? {
                id: dbUser._id?.toString?.() ?? null,
                name: dbUser.name,
                email: dbUser.email,
                type: dbUser.type,
                memberIds,
                createdAt: dbUser.createdAt
            }
            : null,
        members: members.map((m) => ({
            id: m._id?.toString?.() ?? m.id,
            firstname: m.firstname,
            lastname: m.lastname,
            status: m.status,
            stand: m.stand,
            birthday: m.birthday,
            groups: m.groups ?? []
        }))
    };
};
