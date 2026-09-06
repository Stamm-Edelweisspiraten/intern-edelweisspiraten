import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/api/handle";
import { badRequest, created, parseBody } from "$lib/server/api/respond";
import { collection } from "$lib/server/api/pagination";
import { accountCreateSchema } from "$lib/server/api/schemas";
import { accountBalances, createAccount, listAccounts } from "$lib/server/finance/accountService";

/** Kontenplan. */

export const GET: RequestHandler = async (event) => {
    const denied = requireScope(event, "finance.view");
    if (denied) return denied;

    const [accounts, balances] = await Promise.all([
        listAccounts({ activeOnly: event.url.searchParams.get("active") === "true" }),
        accountBalances()
    ]);

    return collection(
        accounts.map((account) => ({ ...account, balance: balances.get(account.id) ?? 0 }))
    );
};

export const POST: RequestHandler = async (event) => {
    const denied = requireScope(event, "finance.manage");
    if (denied) return denied;

    const body = await parseBody(event, accountCreateSchema);
    if (!body.ok) return body.response!;

    const result = await createAccount(body.data!, event.locals.apiToken?.name ?? "api");
    if (!result.ok) return badRequest(result.error ?? "Anlegen fehlgeschlagen.");

    return created(
        { data: result.account },
        `${event.url.origin}/api/v1/accounts/${result.account!.id}`
    );
};
