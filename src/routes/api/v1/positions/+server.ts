import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/api/handle";
import { collection } from "$lib/server/api/pagination";
import { getAllPositions } from "$lib/server/positionService";

/** Aemter und Gruppenleitungen -- lesend. */
export const GET: RequestHandler = async (event) => {
    const denied = requireScope(event, "admin.view");
    if (denied) return denied;
    return collection(await getAllPositions());
};
