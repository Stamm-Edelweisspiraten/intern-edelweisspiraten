import type { Actions, PageServerLoad } from "./$types";
import { addTransaction, getFiscalYear, listFiscalYears, updateTransaction } from "$lib/server/financeService";
import { getAllMembers, getMember } from "$lib/server/memberService";
import { error, fail } from "@sveltejs/kit";

export const load: PageServerLoad = async ({ params }) => {
    const fiscalYears = await listFiscalYears();
    const fiscalYear = fiscalYears.find((fy) => fy.id === params.id || fy.year.toString() === params.id);

    if (!fiscalYear) {
        throw error(404, "Fiscal year not found");
    }

    const fullFiscalYear = await getFiscalYear(fiscalYear.id);
    const members = await getAllMembers();

    const sumAll = fiscalYear.dues.stamm + fiscalYear.dues.gau + fiscalYear.dues.landesmark + fiscalYear.dues.bund;

    const normalizedMembers = members.map((m: any) => {
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

        return {
            id,
            firstname: m.firstname,
            lastname: m.lastname,
            isSecondMember,
            contributionDues: flags,
            payable,
            payableParts
        };
    });

    return {
        fiscalYear: fullFiscalYear ?? fiscalYear,
        members: normalizedMembers,
        payments: (fullFiscalYear?.transactions ?? [])
            .filter((tx) => tx.kind === "Jahresbeitrag")
            .reduce((acc: any, tx: any) => {
                const key = tx.memberId ?? "";
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
            }, {})
    };
};

export const actions: Actions = {
    pay: async ({ request, params }) => {
        const form = await request.formData();
        const fiscalYearId = form.get("fiscalYearId")?.toString() ?? "";
        const memberId = form.get("memberId")?.toString() ?? "";
        const amount = Number(form.get("amount") ?? 0);
        const date = form.get("date")?.toString() ?? "";
        const note = form.get("note")?.toString() ?? "";
        const transactionId = form.get("transactionId")?.toString() ?? "";

        if (!fiscalYearId || !memberId || !date || Number.isNaN(amount) || amount <= 0) {
            return fail(400, { error: "Invalid payload" });
        }

        const fiscalYears = await listFiscalYears();
        const fiscalYear = fiscalYears.find((fy) => fy.id === fiscalYearId || fy.id === params.id);
        if (!fiscalYear || fiscalYear.id !== fiscalYearId) {
            return fail(400, { error: "Fiscal year mismatch" });
        }

        const member = await getMember(memberId);
        if (!member) {
            return fail(404, { error: "Member not found" });
        }

        const memberName = `${member.firstname ?? ""} ${member.lastname ?? ""}`.trim();

        let txId = transactionId;

        if (transactionId) {
            const ok = await updateTransaction(fiscalYearId, transactionId, {
                memberId,
                member: memberName || memberId,
                date,
                direction: "in",
                kind: "Jahresbeitrag",
                amount,
                note: note || undefined
            });
            if (!ok) return fail(500, { error: "Could not update transaction" });
        } else {
            const tx = await addTransaction(fiscalYearId, {
                memberId,
                member: memberName || memberId,
                date,
                direction: "in",
                kind: "Jahresbeitrag",
                amount,
                note: note || undefined
            });

            if (!tx) {
                return fail(500, { error: "Could not save transaction" });
            }
            txId = tx.id ?? "";
        }

        return {
            success: true,
            payment: {
                memberId,
                transactionId: txId,
                amount,
                date,
                note
            }
        };
    }
};
