import type { PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { getAllMembers } from "$lib/server/memberService";

interface UpcomingBirthday {
    id: string;
    name: string;
    date: string;
    age: number;
    inDays: number;
}

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "members.view");

    const userName = event.locals.user?.userinfo?.name ?? event.locals.user?.userinfo?.email ?? "Willkommen";

    const members = await getAllMembers();

    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const upcoming: UpcomingBirthday[] = members
        .map((m) => {
            if (!m.birthday) return null;
            const birthDate = new Date(m.birthday);
            if (isNaN(birthDate.getTime())) return null;

            const thisYear = startOfToday.getFullYear();
            const next = new Date(birthDate);
            next.setFullYear(thisYear);
            if (next < startOfToday) {
                next.setFullYear(thisYear + 1);
            }

            const diffMs = next.getTime() - startOfToday.getTime();
            const inDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
            const age = next.getFullYear() - birthDate.getFullYear();

            return {
                id: m._id?.toString?.() ?? "",
                name: `${m.firstname} ${m.lastname}`,
                date: next.toISOString(),
                age,
                inDays
            } satisfies UpcomingBirthday;
        })
        .filter(Boolean)
        .sort((a, b) => a!.inDays - b!.inDays)
        .slice(0, 8) as UpcomingBirthday[];

    return {
        userName,
        birthdays: upcoming
    };
};
