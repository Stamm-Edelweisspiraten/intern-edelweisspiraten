import type { Actions, PageServerLoad } from "./$types";
import { handleOrderSubmit, loadOrderForm } from "$lib/server/kaemmerer/orderCreation";

/** Bestellung fuer beliebige Mitglieder anlegen (Verwaltung). */

export const load: PageServerLoad = async (event) => loadOrderForm(event, "admin");

export const actions: Actions = {
    default: async (event) => handleOrderSubmit(event, "admin", "/intern/kaemmerer/orders")
};
