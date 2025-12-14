import type { PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "kaemmerer.access");
    return {};
};
