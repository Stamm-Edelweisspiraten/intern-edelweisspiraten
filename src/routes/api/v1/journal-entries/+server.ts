import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/api/handle";
import { badRequest, created, parseBody } from "$lib/server/api/respond";
import { paginated, readDate, readPagination } from "$lib/server/api/pagination";
import { journalEntryCreateSchema } from "$lib/server/api/schemas";
import { countEntries, getEntry, listEntries, postEntry } from "$lib/server/finance/journalService";
import type { JournalSource } from "$lib/server/finance/types";

/**
 * Buchungssaetze.
 *
 * Gebucht wird auch hier ausschliesslich ueber postEntry(); die
 * Ausgeglichenheit prueft dieselbe Funktion wie in der Oberflaeche, und
 * darunter noch einmal die Datenbank.
 */

export const GET: RequestHandler = async (event) => {
    const denied = requireScope(event, "finance.view");
    if (denied) return denied;

    const pagination = readPagination(event);
    const filter = {
        fiscalYearId: event.url.searchParams.get("fiscal_year") ?? undefined,
        accountId: event.url.searchParams.get("account") ?? undefined,
        memberId: event.url.searchParams.get("member") ?? undefined,
        source: (event.url.searchParams.get("source") as JournalSource) ?? undefined,
        from: readDate(event, "from") ?? undefined,
        to: readDate(event, "to") ?? undefined
    };

    const [entries, total] = await Promise.all([
        listEntries({ ...filter, limit: pagination.perPage, offset: pagination.offset }),
        countEntries(filter)
    ]);

    return paginated(entries, total, pagination);
};

export const POST: RequestHandler = async (event) => {
    const denied = requireScope(event, "finance.manage");
    if (denied) return denied;

    const body = await parseBody(event, journalEntryCreateSchema);
    if (!body.ok) return body.response!;

    const result = await postEntry({
        ...body.data!,
        source: "manual",
        user: event.locals.apiToken?.name ?? "api"
    });

    if (!result.ok) return badRequest(result.error ?? "Buchung fehlgeschlagen.");

    const entry = await getEntry(result.entryId!);
    return created({ data: entry }, `${event.url.origin}/api/v1/journal-entries/${result.entryId}`);
};
