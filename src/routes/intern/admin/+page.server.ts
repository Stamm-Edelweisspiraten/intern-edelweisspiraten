import type { PageServerLoad } from "./$types";
import { error } from "@sveltejs/kit";
import { can } from "$lib/can";

const ADMIN_PERMS = [
    "admin.view",
    "user.view",
    "groups.view",
    "system.settings.view",
    "admin.*",
    "*"
];

export const load: PageServerLoad = async ({ locals }) => {
    const perms = locals.permissions ?? [];

    const allowed = ADMIN_PERMS.some((p) => can(perms, p));
    if (!allowed) {
        throw error(403, "Keine Berechtigung");
    }

    return { permissions: perms };
};
