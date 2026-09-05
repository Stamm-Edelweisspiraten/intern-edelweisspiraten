import type { Actions, PageServerLoad } from "./$types";
import { handleOrderSubmit, loadOrderForm } from "$lib/server/kaemmerer/orderCreation";

/** Bestellung fuer die eigenen Mitglieder anlegen. */

export const load: PageServerLoad = async (event) => loadOrderForm(event, "self");

export const actions: Actions = {
    default: async (event) => handleOrderSubmit(event, "self", "/intern/kaemmerer/order")
};
