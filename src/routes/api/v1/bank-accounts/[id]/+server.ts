import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/api/handle";
import { notFound } from "$lib/server/api/respond";
import { resource } from "$lib/server/api/pagination";
import { getBankAccount } from "$lib/server/finance/bankAccountService";

export const GET: RequestHandler = async (event) => {
    const denied = requireScope(event, "finance.view");
    if (denied) return denied;

    const account = await getBankAccount(event.params.id);
    if (!account) return notFound("Das Konto");

    return resource(account);
};
