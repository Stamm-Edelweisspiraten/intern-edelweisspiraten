import type { PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { getAllMembers } from "$lib/server/memberService";
import { getAllGroups } from "$lib/server/groupService";

interface UpcomingBirthday {
    id: string;
    firstname: string;
    group: string;
    dateISO: string;
    dateLabel: string;
    age: number;
    inDays: number;
}

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "dashboard.view");

    const userName = event.locals.user?.userinfo?.name ?? event.locals.user?.userinfo?.email ?? "Willkommen";

    const [members, groups] = await Promise.all([getAllMembers(), getAllGroups()]);
    const groupMap = new Map((groups ?? []).map((g: any) => [g.id, g]));

    const today = new Date();
    const startOfToday = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

    const upcoming: UpcomingBirthday[] = members
        .map((m) => {
            if (!m.birthday) return null;
            const birthDate = new Date(m.birthday);
            if (isNaN(birthDate.getTime())) return null;

            const thisYear = startOfToday.getUTCFullYear();
            const next = new Date(Date.UTC(thisYear, birthDate.getUTCMonth(), birthDate.getUTCDate()));
            if (next.getTime() < startOfToday.getTime()) {
                next.setUTCFullYear(thisYear + 1);
            }

            const diffMs = next.getTime() - startOfToday.getTime();
            const inDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
            const age = next.getUTCFullYear() - birthDate.getUTCFullYear();

            const formatter = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

            const firstGroupId = (m.groups ?? [])[0];
            const group = groupMap.get(firstGroupId);
            let groupLabel = "-";
            if (group) {
                const type = group.type ? `${group.type.charAt(0).toUpperCase()}${group.type.slice(1)}` : "";
                groupLabel = `${type ? `${type} ` : ""}${group.name}`;
            }

            return {
                id: m._id?.toString?.() ?? "",
                firstname: m.firstname,
                group: groupLabel,
                dateISO: next.toISOString(),
                dateLabel: formatter.format(next),
                age,
                inDays
            } satisfies UpcomingBirthday;
        })
        .filter(Boolean)
        .sort((a, b) => a!.inDays - b!.inDays)
        .slice(0, 3) as UpcomingBirthday[];

    return {
        userName,
        birthdays: upcoming
    };
};
