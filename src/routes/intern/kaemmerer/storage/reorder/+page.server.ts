import type { PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { getReorderList } from "$lib/server/kaemmerer/articleService";

/**
 * Nachbestellliste.
 *
 * Die Berechnung liegt jetzt im Artikeldienst. Vorher wurde hier jede
 * GROESSE gegen den ARTIKELWEITEN Mindestbestand verglichen -- ein Artikel
 * mit Mindestbestand 10 und fuenf Groessen meldete dadurch einen Fehlbestand
 * von 10 je Groesse, also das Fuenffache des tatsaechlichen Bedarfs.
 */
export const load: PageServerLoad = async (event) => {
    requirePermission(event, "kaemmerer.storage.manage");
    return { reorder: await getReorderList() };
};
