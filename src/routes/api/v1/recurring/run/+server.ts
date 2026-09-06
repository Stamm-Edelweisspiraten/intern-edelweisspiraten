import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/api/handle";
import { resource } from "$lib/server/api/pagination";
import { runDueSchedules } from "$lib/server/finance/recurringService";

/**
 * Faellige wiederkehrende Buchungen ausfuehren.
 *
 * Die Anwendung erledigt das beim Start und danach stuendlich. Dieser
 * Endpunkt existiert, damit ein Cron von aussen den Lauf erzwingen kann --
 * ein Portal, das nur beim Start bucht, verpasst sonst jeden Termin, an dem
 * niemand neu startet.
 */
export const POST: RequestHandler = async (event) => {
    const denied = requireScope(event, "finance.manage");
    if (denied) return denied;

    return resource(await runDueSchedules(event.locals.apiToken?.name ?? "api"));
};
