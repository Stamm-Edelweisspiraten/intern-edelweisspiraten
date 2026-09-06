import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { accountLedger } from "$lib/server/finance/reportService";
import { getAccount } from "$lib/server/finance/accountService";
import { getActiveFiscalYear } from "$lib/server/finance/yearService";
import { readPeriod } from "$lib/server/finance/period";

/** Kontenblatt: alle Bewegungen eines Kontos im gewählten Zeitraum. */

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "finance.view");

    const account = await getAccount(event.params.id);
    if (!account) throw error(404, "Konto nicht gefunden");

    const activeYear = await getActiveFiscalYear();
    const period = readPeriod(event.url, activeYear?.year);

    const ledger = await accountLedger(account.id, period.from, period.to);
    if (!ledger) throw error(404, "Konto nicht gefunden");

    return { ledger, period: { from: period.fromValue, to: period.toValue } };
};
