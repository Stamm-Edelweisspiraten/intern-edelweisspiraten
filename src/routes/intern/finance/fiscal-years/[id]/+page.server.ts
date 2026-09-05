import { error, fail } from "@sveltejs/kit";
import { ObjectId } from "mongodb";
import type { Actions, PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { getFiscalYear, closeFiscalYear, updateDues } from "$lib/server/finance/yearService";
import { computeOutstanding } from "$lib/server/finance/invoiceService";
import {
    countTransactions,
    createTransaction,
    deleteTransaction,
    listTransactions,
    updateTransaction
} from "$lib/server/finance/transactionService";
import { previewDuesSeeding, seedYearlyDues } from "$lib/server/finance/duesSeeding";
import { getOrdersForFiscalYear } from "$lib/server/orders/orderBilling";
import { financeLogs, fiscalTransactions } from "$lib/server/db/collections";
import { getAllMembers } from "$lib/server/memberService";
import { parseEuro } from "$lib/money";
import { fullName, formatDateTime } from "$lib/format";
import { isTransactionKind, TRANSACTION_KINDS } from "$lib/server/finance/types";

const PAGE_SIZE = 50;

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "finance.view");

    const year = await getFiscalYear(event.params.id);
    if (!year) throw error(404, "Geschäftsjahr nicht gefunden");

    const yearId = new ObjectId(year.id);
    const page = Math.max(1, Number(event.url.searchParams.get("page") ?? 1) || 1);

    const [transactions, transactionCount, outstanding, orders, logs, members, seedPreview] =
        await Promise.all([
            listTransactions(yearId, { limit: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }),
            countTransactions(yearId),
            computeOutstanding({ fiscalYearId: yearId }),
            getOrdersForFiscalYear(yearId),
            financeLogs().find({ fiscalYearId: yearId }).sort({ createdAt: -1 }).limit(10).toArray(),
            getAllMembers(),
            previewDuesSeeding(event.params.id)
        ]);

    const income = await sumByDirection(yearId, "in");
    const expense = await sumByDirection(yearId, "out");

    return {
        year,
        page,
        pageSize: PAGE_SIZE,
        transactions,
        transactionCount,
        income,
        expense,
        balance: income - expense,
        outstandingTotal: outstanding.reduce((sum, i) => sum + i.outstanding, 0),
        outstandingCount: outstanding.length,
        kinds: [...TRANSACTION_KINDS],
        canManage: event.locals.permissions.includes("*") ||
            event.locals.permissions.includes("finance.manage") ||
            event.locals.permissions.includes("finance.*"),
        seedPreview: seedPreview
            ? { newCount: seedPreview.newCount, newTotal: seedPreview.newTotal }
            : null,
        // Diese beiden Bereiche gaben vorher fest kodierte leere Listen zurück
        // und blieben daher dauerhaft leer.
        memberOrders: orders.map((order) => ({
            id: order._id!.toString(),
            number: order.number,
            total: order.total,
            status: order.status,
            paymentStatus: order.paymentStatus,
            members: order.members.map((m) => m.name).join(", "),
            createdAt: order.createdAt.toISOString()
        })),
        activity: logs.map((log) => ({
            id: log._id!.toString(),
            entity: log.entity,
            action: log.action,
            user: log.user,
            at: formatDateTime(log.createdAt)
        })),
        members: members.map((m: Record<string, unknown>) => ({
            id: String(m._id),
            name: fullName(m as { firstname?: string; lastname?: string })
        }))
    };
};

async function sumByDirection(fiscalYearId: ObjectId, direction: "in" | "out"): Promise<number> {
    const rows = await fiscalTransactions()
        .aggregate<{ total: number }>([
            { $match: { fiscalYearId, direction } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ])
        .toArray();
    return rows[0]?.total ?? 0;
}

export const actions: Actions = {
    addTransaction: async (event) => {
        requirePermission(event, "finance.manage");

        const form = await event.request.formData();
        const amount = parseEuro(String(form.get("amount") ?? ""));
        const kind = String(form.get("kind") ?? "");
        const dateValue = String(form.get("date") ?? "");
        const direction = String(form.get("direction") ?? "in") === "out" ? "out" : "in";
        const memberId = String(form.get("memberId") ?? "") || null;

        if (amount === null || amount <= 0) {
            return fail(400, { error: "Bitte einen gültigen Betrag größer als 0 angeben." });
        }
        if (!isTransactionKind(kind)) {
            return fail(400, { error: "Bitte eine gültige Buchungsart auswählen." });
        }

        const date = dateValue ? new Date(dateValue) : new Date();
        if (Number.isNaN(date.getTime())) {
            return fail(400, { error: "Bitte ein gültiges Datum angeben." });
        }

        const member = memberId
            ? (await getAllMembers()).find((m: Record<string, unknown>) => String(m._id) === memberId)
            : null;

        const result = await createTransaction({
            fiscalYearId: event.params.id,
            memberId,
            member: member ? fullName(member as { firstname?: string; lastname?: string }) : "",
            date,
            direction,
            kind,
            amount,
            note: String(form.get("note") ?? ""),
            user: event.locals.user?.email ?? "system"
        });

        if (!result.ok) return fail(400, { error: result.error });
        return { success: "Die Buchung wurde erfasst." };
    },

    updateTransaction: async (event) => {
        requirePermission(event, "finance.manage");

        const form = await event.request.formData();
        const id = String(form.get("transactionId") ?? "");
        const amount = parseEuro(String(form.get("amount") ?? ""));
        const kind = String(form.get("kind") ?? "");
        const dateValue = String(form.get("date") ?? "");

        if (amount === null || amount <= 0) {
            return fail(400, { error: "Bitte einen gültigen Betrag größer als 0 angeben." });
        }
        if (!isTransactionKind(kind)) {
            return fail(400, { error: "Bitte eine gültige Buchungsart auswählen." });
        }

        const result = await updateTransaction(
            id,
            {
                amount,
                kind,
                date: dateValue ? new Date(dateValue) : undefined,
                direction: String(form.get("direction") ?? "in") === "out" ? "out" : "in",
                note: String(form.get("note") ?? "")
            },
            event.locals.user?.email ?? "system"
        );

        if (!result.ok) return fail(400, { error: result.error });
        return { success: "Die Buchung wurde geändert." };
    },

    deleteTransaction: async (event) => {
        requirePermission(event, "finance.manage");

        const form = await event.request.formData();
        const result = await deleteTransaction(
            String(form.get("transactionId") ?? ""),
            event.locals.user?.email ?? "system"
        );

        if (!result.ok) return fail(400, { error: result.error });
        return { success: "Die Buchung wurde gelöscht." };
    },

    /**
     * Beiträge anlegen -- ausdrücklich statt als Nebenwirkung eines Seitenaufrufs.
     */
    seedDues: async (event) => {
        requirePermission(event, "finance.manage");

        const result = await seedYearlyDues(event.params.id, event.locals.user?.email ?? "system");
        if (!result.ok) return fail(400, { error: result.error });

        return {
            success:
                result.created === 0
                    ? "Es waren bereits alle Jahresbeiträge angelegt."
                    : `${result.created} Jahresbeiträge wurden angelegt.`
        };
    },

    updateDues: async (event) => {
        requirePermission(event, "finance.manage");

        const form = await event.request.formData();
        const dues = { stamm: 0, gau: 0, landesmark: 0, bund: 0 };

        for (const field of ["stamm", "gau", "landesmark", "bund"] as const) {
            const value = parseEuro(String(form.get(`dues_${field}`) ?? "0"));
            if (value === null || value < 0) {
                return fail(400, { error: `Der Beitrag "${field}" ist kein gültiger Betrag.` });
            }
            dues[field] = value;
        }

        const result = await updateDues(event.params.id, dues, event.locals.user?.email ?? "system");
        if (!result.ok) return fail(400, { error: result.error });

        return { success: "Die Beitragssätze wurden gespeichert." };
    },

    close: async (event) => {
        requirePermission(event, "finance.manage");

        const form = await event.request.formData();
        const carryOver = form.get("carryOver") === "1";

        const result = await closeFiscalYear(event.params.id, {
            user: event.locals.user?.email ?? "system",
            carryOverOpenInvoices: carryOver
        });

        if (!result.ok) return fail(400, { error: result.error });

        return {
            success:
                result.carriedOver && result.carriedOver > 0
                    ? `Das Geschäftsjahr wurde abgeschlossen. ${result.carriedOver} offene Posten wurden übertragen.`
                    : "Das Geschäftsjahr wurde abgeschlossen."
        };
    }
};
