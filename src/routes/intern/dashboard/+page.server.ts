import type { PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { getAllMembers } from "$lib/server/memberService";

interface UpcomingBirthday {
    id: string;
    name: string;
    dateISO: string;
    dateLabel: string;
    age: number;
    inDays: number;
}

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "members.view");

    const userName = event.locals.user?.userinfo?.name ?? event.locals.user?.userinfo?.email ?? "Willkommen";

    const members = await getAllMembers();

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

            return {
                id: m._id?.toString?.() ?? "",
                name: `${m.firstname} ${m.lastname}`,
                dateISO: next.toISOString(),
                dateLabel: formatter.format(next),
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
