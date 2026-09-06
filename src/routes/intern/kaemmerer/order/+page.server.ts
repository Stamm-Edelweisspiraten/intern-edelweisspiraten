import type { PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { listOrdersForMembers } from "$lib/server/kaemmerer/orderService";

/** Meine Bestellungen (Selbstbedienung). */
export const load: PageServerLoad = async (event) => {
    requirePermission(event, "kaemmerer.order.view");

    // memberIds stehen jetzt direkt in locals -- vorher wurde dafuer noch
    // einmal der Benutzer ueber die E-Mail-Adresse nachgeladen.
    const memberIds = event.locals.user?.memberIds ?? [];
    const orders = await listOrdersForMembers(memberIds);

    return { orders, hasMembers: memberIds.length > 0 };
};
