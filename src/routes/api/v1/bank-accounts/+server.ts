import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/api/handle";
import { badRequest, created, parseBody } from "$lib/server/api/respond";
import { collection } from "$lib/server/api/pagination";
import { bankAccountCreateSchema } from "$lib/server/api/schemas";
import { createBankAccount, getBankAccount, listBankAccounts } from "$lib/server/finance/bankAccountService";

export const GET: RequestHandler = async (event) => {
    const denied = requireScope(event, "finance.view");
    if (denied) return denied;
    return collection(await listBankAccounts());
};

export const POST: RequestHandler = async (event) => {
    const denied = requireScope(event, "finance.manage");
    if (denied) return denied;

    const body = await parseBody(event, bankAccountCreateSchema);
    if (!body.ok) return body.response!;

    const result = await createBankAccount(body.data!);
    if (!result.ok) return badRequest(result.error ?? "Anlegen fehlgeschlagen.");

    return created(
        { data: await getBankAccount(result.id!) },
        `${event.url.origin}/api/v1/bank-accounts/${result.id}`
    );
};
