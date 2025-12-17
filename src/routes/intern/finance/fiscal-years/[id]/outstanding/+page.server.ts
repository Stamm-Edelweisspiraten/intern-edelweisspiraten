import type { Actions, PageServerLoad } from "./$types";
import { error, redirect } from "@sveltejs/kit";
import { addInvoice, addTransaction, calculateMemberDues, getFiscalYear, updateInvoice, updateTransaction } from "$lib/server/financeService";
import { getAllMembers, getMember } from "$lib/server/memberService";
import { fail } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/permissionGuard";

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "finance.view");
    const { params } = event;
    const fiscalYear = await getFiscalYear(params.id);
    if (!fiscalYear) {
        throw error(404, "Fiscal year not found");
    }
    const isArchived = fiscalYear.status === "archived";

    const members = await getAllMembers();

    let invoices = [...(fiscalYear.invoices ?? [])];

    // Ensure there is a pending invoice per member for the yearly dues
    if (!isArchived) {
        for (const m of members) {
            const memberId = m._id?.toString?.() ?? m.id ?? "";
            if (!memberId) continue;

            const existing = invoices.find((inv) => inv.memberId === memberId && inv.kind === "Jahresbeitrag");
            if (!existing) {
                const { payable } = calculateMemberDues(fiscalYear.dues, m);
                const memberName = `${m.firstname ?? ""} ${m.lastname ?? ""}`.trim() || "Unbekannt";
                const inv = await addInvoice(fiscalYear.id!, {
                    memberId,
                    member: memberName,
                    kind: "Jahresbeitrag",
                    amount: payable,
                    date: new Date().toISOString(),
                    note: m.isSecondMember ? "Zweitmitglied" : undefined,
                    status: "pending"
                });
                if (inv) {
                    invoices.push(inv);
                }
            }
        }
    }

    const paymentsDetailed = (fiscalYear.transactions ?? [])
        .filter((tx) => tx.status !== "pending")
        .reduce((acc: any, tx: any) => {
            const key = tx.invoiceId ?? tx.memberId ?? tx.id;
            if (!key) return acc;
            if (!acc[key]) {
                acc[key] = { total: 0, entries: [] as any[] };
            }
            acc[key].entries.push({
                id: tx.id,
                amount: tx.amount,
                date: tx.date,
                note: tx.note ?? ""
            });
            acc[key].total += Number(tx.amount) || 0;
            return acc;
        }, {});

    const pendingInvoices = invoices
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

    const allOutstanding = [...pendingInvoices];
    const outstandingTotal = allOutstanding.reduce((sum, item) => sum + item.amount, 0);

    return {
        fiscalYear,
        outstanding: {
            total: outstandingTotal,
            items: allOutstanding
        },
        payments: paymentsDetailed,
        memberSuggestions: members.map((m: any) => ({
            id: m._id?.toString?.() ?? m.id ?? "",
            name: `${m.firstname ?? ""} ${m.lastname ?? ""}`.trim() || "Unbekannt"
        }))
    };
};

export const actions: Actions = {
    addPending: async (event) => {
        requirePermission(event, "finance.manage");
        const { request, params } = event;
        const form = await request.formData();
        const fiscalYearId = params.id;
        const memberId = form.get("memberId")?.toString() ?? "";
        const memberNameInput = form.get("memberName")?.toString() ?? "";
        const amount = Number(form.get("amount") ?? 0);
        const date = form.get("date")?.toString() ?? "";
        const kind = form.get("kind")?.toString() ?? "Jahresbeitrag";
        const note = form.get("note")?.toString() ?? "";

        if (!fiscalYearId || Number.isNaN(amount) || amount <= 0 || !date) {
            return fail(400, { error: "Ungültige Angaben" });
        }

        const fiscalYear = await getFiscalYear(fiscalYearId);
        if (!fiscalYear) {
            return fail(404, { error: "Fiscal year not found" });
        }
        if (fiscalYear.status === "archived") {
            return fail(400, { error: "Archivierte Geschaeftsjahre koennen nicht bearbeitet werden." });
        }

        let memberName = memberNameInput || "Unbekannt";
        if (memberId) {
            const member = await getMember(memberId);
            if (member) {
                memberName = `${member.firstname ?? ""} ${member.lastname ?? ""}`.trim() || memberName;
            }
        }

        const inv = await addInvoice(fiscalYearId, {
            memberId: memberId || undefined,
            member: memberName,
            kind,
            amount,
            date,
            note: note || undefined
        });

        if (!inv) {
            return fail(500, { error: "Konnte Rechnung nicht speichern." });
        }

        throw redirect(303, `/intern/finance/fiscal-years/${fiscalYearId}/outstanding`);
    },

    pay: async (event) => {
        requirePermission(event, "finance.manage");
        const { request, params } = event;
        const form = await request.formData();
        const fiscalYearId = form.get("fiscalYearId")?.toString() ?? "";
        const itemId = form.get("itemId")?.toString() ?? "";
        const memberId = form.get("memberId")?.toString() ?? "";
        const memberNameInput = form.get("memberName")?.toString() ?? "";
        const amount = Number(form.get("amount") ?? 0);
        const date = form.get("date")?.toString() ?? "";
        const note = form.get("note")?.toString() ?? "";
        const transactionId = form.get("transactionId")?.toString() ?? "";

        if (!fiscalYearId || !date || Number.isNaN(amount) || amount <= 0) {
            return fail(400, { error: "Invalid payload" });
        }

        const fiscalYear = await getFiscalYear(params.id);
        if (!fiscalYear || fiscalYear.id !== fiscalYearId) {
            return fail(400, { error: "Fiscal year mismatch" });
        }
        if (fiscalYear.status === "archived") {
            return fail(400, { error: "Archivierte Geschaeftsjahre koennen nicht bearbeitet werden." });
        }

        let memberName = memberNameInput || "Unbekannt";
        if (memberId) {
            const member = await getMember(memberId);
            if (!member) {
                return fail(404, { error: "Member not found" });
            }
            memberName = `${member.firstname ?? ""} ${member.lastname ?? ""}`.trim() || memberName;
        }

        const memberKey = memberId || itemId || transactionId || memberName;

        const targetId = transactionId || itemId;
        const invoice = (fiscalYear.invoices ?? []).find((i) => i.id === targetId);
        if (!invoice) {
            return fail(404, { error: "Pending entry not found" });
        }

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

        // check if invoice is now fully paid
        const paidSum = (fiscalYear.transactions ?? [])
            .filter((t) => t.invoiceId === invoice.id && (t.status ?? "paid") === "paid")
            .reduce((sum, t) => sum + (Number(t.amount) || 0), 0) + amount;

        if (paidSum >= (Number(invoice.amount) || 0)) {
            await updateInvoice(fiscalYearId, invoice.id!, { status: "paid" });
        }

        throw redirect(303, `/intern/finance/fiscal-years/${params.id}/outstanding`);
    }
};
