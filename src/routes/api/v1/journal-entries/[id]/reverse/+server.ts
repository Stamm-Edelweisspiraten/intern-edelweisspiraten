import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/api/handle";
import { badRequest, created, parseBody } from "$lib/server/api/respond";
import { reverseSchema } from "$lib/server/api/schemas";
import { getEntry, reverseEntry } from "$lib/server/finance/journalService";

/**
 * Storno.
 *
 * Es gibt bewusst kein DELETE auf Buchungssaetze: eine Buchhaltung, aus der
 * Belege verschwinden koennen, ist keine.
 */
export const POST: RequestHandler = async (event) => {
    const denied = requireScope(event, "finance.manage");
    if (denied) return denied;

    const body = await parseBody(event, reverseSchema);
    if (!body.ok) return body.response!;

    const result = await reverseEntry(
        event.params.id,
        event.locals.apiToken?.name ?? "api",
        body.data!.reason ?? ""
    );

    if (!result.ok) return badRequest(result.error ?? "Storno fehlgeschlagen.");

    const entry = await getEntry(result.entryId!);
    return created({ data: entry }, `${event.url.origin}/api/v1/journal-entries/${result.entryId}`);
};
