import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/api/handle";
import { notFound } from "$lib/server/api/respond";
import { resource } from "$lib/server/api/pagination";
import { getEntry } from "$lib/server/finance/journalService";

export const GET: RequestHandler = async (event) => {
    const denied = requireScope(event, "finance.view");
    if (denied) return denied;

    const entry = await getEntry(event.params.id);
    if (!entry) return notFound("Der Buchungssatz");

    return resource(entry);
};
