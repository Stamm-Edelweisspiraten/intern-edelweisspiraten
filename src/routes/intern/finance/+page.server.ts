import type { Actions, PageServerLoad } from "./$types";
import { archiveFiscalYear, getFiscalYear, listFiscalYears } from "$lib/server/financeService";
import { redirect } from "@sveltejs/kit";

export const load: PageServerLoad = async () => {
    const fiscalYears = await listFiscalYears();
    const openYears = fiscalYears.filter((fy) => (fy.status ?? "active") !== "archived");

    const outstandingTotal = (
        await Promise.all(
            openYears.map(async (fy) => {
                const full = fy.id ? await getFiscalYear(fy.id) : null;
                if (!full) return 0;

                const pendingInvoices = (full.invoices ?? [])
                    .filter((inv) => (inv.status ?? "pending") === "pending")
                    .map((inv) => {
                        const paidSum = (full.transactions ?? [])
                            .filter(
                                (tx) =>
                                    (tx.invoiceId === inv.id ||
                                        (!tx.invoiceId &&
                                            tx.memberId &&
                                            tx.memberId === inv.memberId &&
                                            tx.kind === inv.kind)) &&
                                    (tx.status ?? "paid") === "paid"
                            )
                            .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);

                        return Math.max((Number(inv.amount) || 0) - paidSum, 0);
                    })
                    .filter((amount) => amount > 0)
                    .reduce((sum, amount) => sum + amount, 0);

                return pendingInvoices;
            })
        )
    ).reduce((sum, val) => sum + val, 0);

    return { fiscalYears, outstandingTotal };
};

export const actions: Actions = {
    archive: async ({ request }) => {
        const form = await request.formData();
        const id = form.get("id");

        if (typeof id !== "string" || !id) {
            return { error: "Invalid id" };
        }

        await archiveFiscalYear(id);
        throw redirect(303, "/intern/finance");
    }
};
