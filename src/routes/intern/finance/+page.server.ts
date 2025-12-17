import type { Actions, PageServerLoad } from "./$types";
import { archiveFiscalYear, getFiscalYear, listFiscalYears } from "$lib/server/financeService";
import { redirect, error } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/permissionGuard";

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "finance.view");

    const summaries = await listFiscalYears();
    const enriched = await Promise.all(
        summaries.map(async (summary) => {
            const full = summary.id ? await getFiscalYear(summary.id) : null;
            if (!full) {
                return { ...summary, income: 0, outcome: 0, saldo: 0, outstanding: 0 };
            }

            const paidTx = (full.transactions ?? []).filter((tx) => (tx.status ?? "paid") === "paid");
            const income = paidTx.filter((tx) => tx.direction === "in").reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
            const outcome = paidTx.filter((tx) => tx.direction === "out").reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);

            const outstanding = (full.invoices ?? [])
                .filter((inv) => (inv.status ?? "pending") === "pending")
                .map((inv) => {
                    const paidSum = paidTx
                        .filter(
                            (tx) =>
                                tx.invoiceId === inv.id ||
                                (!tx.invoiceId && tx.memberId && tx.memberId === inv.memberId && tx.kind === inv.kind)
                        )
                        .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
                    return Math.max((Number(inv.amount) || 0) - paidSum, 0);
                })
                .filter((amount) => amount > 0)
                .reduce((sum, amount) => sum + amount, 0);

            return {
                ...summary,
                income,
                outcome,
                saldo: income - outcome,
                outstanding
            };
        })
    );

    const outstandingTotal = enriched
        .filter((fy) => (fy.status ?? "active") !== "archived")
        .reduce((sum, fy) => sum + (fy.outstanding ?? 0), 0);

    return { fiscalYears: enriched, outstandingTotal };
};

export const actions: Actions = {
    archive: async (event) => {
        requirePermission(event, "finance.manage");

        const { request } = event;
        const form = await request.formData();
        const id = form.get("id");

        if (typeof id !== "string" || !id) {
            return { error: "Invalid id" };
        }

        await archiveFiscalYear(id);
        throw redirect(303, "/intern/finance");
    }
};
