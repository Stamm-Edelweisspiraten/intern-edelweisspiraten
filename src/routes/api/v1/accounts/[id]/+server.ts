import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/api/handle";
import { badRequest, noContent, notFound, parseBody } from "$lib/server/api/respond";
import { resource } from "$lib/server/api/pagination";
import { readDate } from "$lib/server/api/pagination";
import { accountUpdateSchema } from "$lib/server/api/schemas";
import { deleteAccount, getAccount, updateAccount } from "$lib/server/finance/accountService";
import { accountLedger } from "$lib/server/finance/reportService";

export const GET: RequestHandler = async (event) => {
    const denied = requireScope(event, "finance.view");
    if (denied) return denied;

    const account = await getAccount(event.params.id);
    if (!account) return notFound("Das Konto");

    // Auf Wunsch das Kontenblatt: ?include=ledger&from=…&to=…
    if (event.url.searchParams.get("include") === "ledger") {
        const now = new Date();
        const from = readDate(event, "from") ?? new Date(now.getFullYear(), 0, 1);
        const to = readDate(event, "to") ?? new Date(now.getFullYear(), 11, 31);
        return resource(await accountLedger(account.id, from, to));
    }

    return resource(account);
};

export const PATCH: RequestHandler = async (event) => {
    const denied = requireScope(event, "finance.manage");
    if (denied) return denied;

    const body = await parseBody(event, accountUpdateSchema);
    if (!body.ok) return body.response!;

    const result = await updateAccount(
        event.params.id,
        body.data!,
        event.locals.apiToken?.name ?? "api"
    );
    if (!result.ok) return badRequest(result.error ?? "Speichern fehlgeschlagen.");

    return resource(await getAccount(event.params.id));
};

export const DELETE: RequestHandler = async (event) => {
    const denied = requireScope(event, "finance.manage");
    if (denied) return denied;

    const result = await deleteAccount(event.params.id, event.locals.apiToken?.name ?? "api");
    if (!result.ok) return badRequest(result.error ?? "Löschen fehlgeschlagen.");

    return noContent();
};
