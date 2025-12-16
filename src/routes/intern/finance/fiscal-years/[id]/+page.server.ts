import type { Actions, PageServerLoad } from "./$types";
import { error, fail, redirect } from "@sveltejs/kit";
import { addTransaction, getFiscalYear } from "$lib/server/financeService";
import { getAllMembers, getMember } from "$lib/server/memberService";
import { requirePermission } from "$lib/server/permissionGuard";

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "finance.view");
    const { params } = event;
    const fiscalYear = await getFiscalYear(params.id);
    if (!fiscalYear) {
        throw error(404, "Fiscal year not found");
    }

    const members = await getAllMembers();

    const pendingInvoices = (fiscalYear.invoices ?? [])
        .filter((inv) => (inv.status ?? "pending") === "pending")
        .map((inv) => {
            const paidSum = (fiscalYear.transactions ?? [])
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

    const outstandingTotal = pendingInvoices.reduce((sum, item) => sum + item.amount, 0);

    return {
        fiscalYear,
        outstanding: {
            total: outstandingTotal,
            items: pendingInvoices
        },
        actions: [] as { title: string; note?: string }[],
        memberOrders: [] as { member: string; item: string; amount: number }[],
        memberSuggestions: members.map((m: any) => ({
            id: m._id?.toString?.() ?? m.id ?? "",
            name: `${m.firstname ?? ""} ${m.lastname ?? ""}`.trim() || "Unbekannt"
        }))
    };
};

export const actions: Actions = {
    addTransaction: async (event) => {
        requirePermission(event, "finance.manage");
        const { request, params } = event;
        const form = await request.formData();

        const amount = Number(form.get("amount") ?? 0);
        const date = form.get("date")?.toString() ?? "";
        const direction = form.get("direction")?.toString() === "out" ? "out" : "in";
        const kind = form.get("kind")?.toString() ?? "custom";
        const memberInput = form.get("member")?.toString() ?? "";
        const memberId = form.get("memberId")?.toString() ?? "";
        const note = form.get("note")?.toString() ?? "";

        if (!params.id) return fail(400, { error: "Missing fiscal year id" });
        if (Number.isNaN(amount) || amount <= 0) return fail(400, { error: "Invalid amount" });
        if (!date) return fail(400, { error: "Date is required" });

        let memberName = memberInput || "Unbekannt";
        if (memberId) {
            const m = await getMember(memberId);
            if (m) {
                memberName = `${m.firstname ?? ""} ${m.lastname ?? ""}`.trim() || memberName;
            }
        }

        const tx = await addTransaction(params.id, {
            memberId: memberId || undefined,
            member: memberName,
            date,
            direction,
            kind,
            amount,
            note: note || undefined,
            status: "paid"
        });

        if (!tx) return fail(500, { error: "Could not save transaction" });

        throw redirect(303, `/intern/finance/fiscal-years/${params.id}`);
    }
};
