import { db } from "$lib/server/mongo";
import { ObjectId } from "mongodb";

export interface MemberPayment {
    memberId: string;
    year: number;
    amount: number;
    paidAt?: string | null;
    paidBy?: string | null;
}

export async function getPaymentsByYear(year: number): Promise<MemberPayment[]> {
    const docs = await db.collection("memberPayments")
        .find({ year })
        .toArray();

    return docs.map((d) => ({
        memberId: d.memberId,
        year: d.year,
        amount: d.amount,
        paidAt: d.paidAt ?? null,
        paidBy: d.paidBy ?? null
    }));
}

export async function setMemberPayment(memberId: string, year: number, amount: number, paid: boolean, user: string, paidAt?: string | null) {
    const base = {
        memberId,
        year,
        amount
    };

    if (paid) {
        await db.collection("memberPayments").updateOne(
            { memberId, year },
            { $set: { ...base, paidAt: paidAt ?? new Date().toISOString(), paidBy: user } },
            { upsert: true }
        );
    } else {
        await db.collection("memberPayments").updateOne(
            { memberId, year },
            { $set: { ...base }, $unset: { paidAt: "", paidBy: "" } },
            { upsert: true }
        );
    }
}
