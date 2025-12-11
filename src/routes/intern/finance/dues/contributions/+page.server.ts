import type { PageServerLoad } from "./$types";
import { listFiscalYears } from "$lib/server/financeService";

export const load: PageServerLoad = async () => {
    const fiscalYears = await listFiscalYears();
    return { fiscalYears };
};
