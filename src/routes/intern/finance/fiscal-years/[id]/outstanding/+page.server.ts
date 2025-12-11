import type { PageServerLoad } from "./$types";
import { error } from "@sveltejs/kit";
import { getFiscalYear } from "$lib/server/financeService";
import { getAllMembers } from "$lib/server/memberService";

export const load: PageServerLoad = async ({ params }) => {
    const fiscalYear = await getFiscalYear(params.id);
    if (!fiscalYear) {
        throw error(404, "Fiscal year not found");
    }

    const members = await getAllMembers();
    const sumAll = fiscalYear.dues.stamm + fiscalYear.dues.gau + fiscalYear.dues.landesmark + fiscalYear.dues.bund;

    const paymentsByMember = (fiscalYear.transactions ?? [])
        .filter((tx) => tx.kind === "Jahresbeitrag" && tx.memberId)
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

    return {
        fiscalYear,
        outstanding: {
            total: outstandingTotal,
            items: outstandingItems
        }
    };
};
