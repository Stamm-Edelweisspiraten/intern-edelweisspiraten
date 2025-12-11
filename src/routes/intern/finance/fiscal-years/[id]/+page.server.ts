import type { Actions, PageServerLoad } from "./$types";
import { error, fail, redirect } from "@sveltejs/kit";
import { addTransaction, getFiscalYear } from "$lib/server/financeService";
import { getAllMembers } from "$lib/server/memberService";

export const load: PageServerLoad = async ({ params }) => {
    const fiscalYear = await getFiscalYear(params.id);
    if (!fiscalYear) {
        throw error(404, "Fiscal year not found");
    }

    const members = await getAllMembers();
    const sumAll = fiscalYear.dues.stamm + fiscalYear.dues.gau + fiscalYear.dues.landesmark + fiscalYear.dues.bund;

    const paymentsByMember = (fiscalYear.transactions ?? [])
        .filter((tx) => tx.kind === "dues" && tx.memberId)
        .reduce((acc: Record<string, number>, tx) => {
            const key = tx.memberId as string;
            acc[key] = (acc[key] ?? 0) + (Number(tx.amount) || 0);
            return acc;
        }, {});

    const outstandingItems = members.map((m: any) => {
        const id = m._id?.toString?.() ?? m.id ?? "";
        const isSecondMember = !!m.isSecondMember;
        const flags = m.contributionDues ?? { stamm: true, gau: true, landesmark: true, bund: true };

        const payableParts = {
            stamm: flags.stamm ? fiscalYear.dues.stamm : 0,
            gau: flags.gau ? fiscalYear.dues.gau : 0,
            landesmark: flags.landesmark ? fiscalYear.dues.landesmark : 0,
            bund: flags.bund ? fiscalYear.dues.bund : 0
        };

        const payable = isSecondMember
            ? payableParts.stamm + payableParts.gau + payableParts.landesmark + payableParts.bund
            : sumAll;

        const paid = paymentsByMember[id] ?? 0;
        const open = payable - paid;

        return {
            id,
            title: `${m.firstname ?? ""} ${m.lastname ?? ""}`.trim() || "Unbekannt",
            amount: open > 0 ? open : 0,
            note: isSecondMember ? "Zweitmitglied" : undefined
        };
    }).filter((item) => item.amount > 0);

    const outstandingTotal = outstandingItems.reduce((sum, item) => sum + item.amount, 0);

    const memberSuggestions = members.map((m: any) => ({
        id: m._id?.toString?.() ?? m.id ?? "",
        name: `${m.firstname ?? ""} ${m.lastname ?? ""}`.trim() || "Unbekannt"
    }));

    return {
        fiscalYear,
        outstanding: {
            total: outstandingTotal,
            items: outstandingItems
        },
        actions: [] as { title: string; note?: string }[],
        memberOrders: [] as { member: string; item: string; amount: number }[],
        memberSuggestions
    };
};

export const actions: Actions = {
    addTransaction: async ({ request, params }) => {
        const form = await request.formData();

        const amount = Number(form.get("amount") ?? 0);
        const date = form.get("date")?.toString() ?? "";
        const direction = form.get("direction")?.toString() === "out" ? "out" : "in";
        const kind = form.get("kind")?.toString() ?? "custom";
        const member = form.get("member")?.toString() ?? "";
        const note = form.get("note")?.toString() ?? "";

        if (!params.id) return fail(400, { error: "Missing fiscal year id" });
        if (Number.isNaN(amount) || amount <= 0) return fail(400, { error: "Invalid amount" });
        if (!date) return fail(400, { error: "Date is required" });

        const tx = await addTransaction(params.id, {
            member: member || "Unbekannt",
            date,
            direction,
            kind,
            amount,
            note: note || undefined
        });

        if (!tx) return fail(500, { error: "Could not save transaction" });

        throw redirect(303, `/intern/finance/fiscal-years/${params.id}`);
    }
};
