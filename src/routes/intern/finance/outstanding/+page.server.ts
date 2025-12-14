import type { Actions, PageServerLoad } from "./$types";
import { addTransaction, getFiscalYear, listFiscalYears, updateInvoice } from "$lib/server/financeService";
import { getMember } from "$lib/server/memberService";
import { fail, redirect } from "@sveltejs/kit";

export const load: PageServerLoad = async () => {
    const fiscalYears = await listFiscalYears();
    const openYears = fiscalYears.filter((fy) => (fy.status ?? "active") !== "archived");

    const outstandingByYear = (
        await Promise.all(
            openYears.map(async (fy) => {
                const full = fy.id ? await getFiscalYear(fy.id) : null;
                if (!full) return null;

                const pendingInvoices = (full.invoices ?? [])
                    .filter((inv) => (inv.status ?? "pending") === "pending")
                    .map((inv) => {
                        const paidSum = (full.transactions ?? [])
                            .filter((tx) => tx.invoiceId === inv.id && (tx.status ?? "paid") === "paid")
                            .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);

                        return {
                            id: inv.id ?? "",
                            memberId: inv.memberId ?? "",
                            title: inv.member ?? "Unbekannt",
                            amount: Math.max((Number(inv.amount) || 0) - paidSum, 0),
                            payable: Number(inv.amount) || 0,
                            paid: paidSum,
                            type: inv.kind ?? "Sonstiges",
                            note: inv.note ?? "",
                            invoiceId: inv.id
                        };
                    })
                    .filter((item) => item.amount > 0);

                const yearTotal = pendingInvoices.reduce((sum, item) => sum + item.amount, 0);

                return {
                    id: full.id!,
                    year: full.year,
                    total: yearTotal,
                    count: pendingInvoices.length,
                    items: pendingInvoices
                };
            })
        )
    ).filter(Boolean) as {
        id: string;
        year: number;
        total: number;
        count: number;
        items: {
            id: string;
            memberId: string;
            title: string;
            amount: number;
            payable: number;
            paid: number;
            type: string;
            note?: string;
            invoiceId?: string;
        }[];
    }[];

    const outstandingTotal = outstandingByYear.reduce((sum, fy) => sum + fy.total, 0);

    return { outstandingByYear, outstandingTotal };
};

export const actions: Actions = {
    pay: async ({ request }) => {
        const form = await request.formData();
        const fiscalYearId = form.get("fiscalYearId")?.toString() ?? "";
        const itemId = form.get("itemId")?.toString() ?? "";
        const memberId = form.get("memberId")?.toString() ?? "";
        const memberNameInput = form.get("memberName")?.toString() ?? "";
        const amount = Number(form.get("amount") ?? 0);
        const date = form.get("date")?.toString() ?? "";
        const note = form.get("note")?.toString() ?? "";

        if (!fiscalYearId || !itemId || !date || Number.isNaN(amount) || amount <= 0) {
            return fail(400, { error: "Invalid payload" });
        }

        const fiscalYear = await getFiscalYear(fiscalYearId);
        if (!fiscalYear) return fail(404, { error: "Fiscal year not found" });

        let memberName = memberNameInput || "Unbekannt";
        if (memberId) {
            const member = await getMember(memberId);
            if (!member) return fail(404, { error: "Member not found" });
            memberName = `${member.firstname ?? ""} ${member.lastname ?? ""}`.trim() || memberName;
        }

        const invoice = (fiscalYear.invoices ?? []).find((i) => i.id === itemId);
        if (!invoice) return fail(404, { error: "Pending entry not found" });

        const tx = await addTransaction(fiscalYearId, {
            memberId: memberId || invoice.memberId || undefined,
            member: memberName || invoice.member || memberId || itemId,
            date,
            direction: "in",
            kind: invoice.kind ?? "Jahresbeitrag",
            amount,
            note: note || undefined,
            status: "paid",
            invoiceId: invoice.id
        });

        if (!tx) return fail(500, { error: "Could not save transaction" });

        const paidSum = (fiscalYear.transactions ?? [])
            .filter((t) => t.invoiceId === invoice.id && (t.status ?? "paid") === "paid")
            .reduce((sum, t) => sum + (Number(t.amount) || 0), 0) + amount;

        if (paidSum >= (Number(invoice.amount) || 0)) {
            await updateInvoice(fiscalYearId, invoice.id!, { status: "paid" });
        }

        throw redirect(303, "/intern/finance/outstanding");
    }
};
