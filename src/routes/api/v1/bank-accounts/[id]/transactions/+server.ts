import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/api/handle";
import { notFound } from "$lib/server/api/respond";
import { readDate, resource } from "$lib/server/api/pagination";
import { cashBook } from "$lib/server/finance/reportService";

/** Kassenbericht eines Kontos: Bewegungen mit fortlaufendem Bestand. */
export const GET: RequestHandler = async (event) => {
    const denied = requireScope(event, "finance.view");
    if (denied) return denied;

    const now = new Date();
    const from = readDate(event, "from") ?? new Date(now.getFullYear(), 0, 1);
    const to = readDate(event, "to") ?? new Date(now.getFullYear(), 11, 31);

    const book = await cashBook(event.params.id, from, to);
    if (!book) return notFound("Das Konto");

    return resource(book);
};
