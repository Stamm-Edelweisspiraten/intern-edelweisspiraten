import { fail, type RequestEvent } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/permissionGuard";
import { syncOrderPayment } from "$lib/server/orders/orderBilling";
import { formatEuro, parseEuro } from "$lib/money";
import { getInvoice, payInvoice, reversePayment } from "./invoiceService";

/**
 * Gemeinsame Aktionen für beide Ansichten offener Posten.
 *
 * Vorher war dieser Ablauf zweimal nahezu identisch ausgeschrieben -- einmal
 * in der jahresübergreifenden Ansicht, einmal in der Jahresansicht -- und
 * unterschied sich nur im Ziel der Weiterleitung.
 */

export async function handlePayAction(event: RequestEvent) {
    requirePermission(event, "finance.manage");

    const form = await event.request.formData();
    const invoiceId = String(form.get("invoiceId") ?? "");
    const rawAmount = String(form.get("amount") ?? "").trim();
    const dateValue = String(form.get("date") ?? "");
    const bankAccountId = String(form.get("bankAccountId") ?? "") || null;

    if (!invoiceId) return fail(400, { error: "Es wurde keine Rechnung ausgewählt." });

    const invoice = await getInvoice(invoiceId);
    if (!invoice) return fail(404, { error: "Rechnung nicht gefunden." });

    // Ohne Betragsangabe wird der offene Rest ausgeglichen.
    const amount = rawAmount ? parseEuro(rawAmount) : invoice.outstanding;
    if (amount === null || amount <= 0) {
        return fail(400, { error: "Bitte einen gültigen Betrag größer als 0 angeben." });
    }

    const date = dateValue ? new Date(dateValue) : new Date();
    if (Number.isNaN(date.getTime())) {
        return fail(400, { error: "Bitte ein gültiges Datum angeben." });
    }

    const result = await payInvoice({
        invoiceId,
        amount,
        date,
        bankAccountId,
        note: String(form.get("note") ?? ""),
        user: event.locals.user?.email ?? "system"
    });

    if (!result.ok) return fail(400, { error: result.error });

    // Gehört die Rechnung zu einer Bestellung, wird deren Zahlungsstatus
    // nachgeführt -- ausdrücklich hier und nicht mehr über einen dynamischen
    // Import innerhalb des Finanzdienstes.
    if (result.orderId) {
        await syncOrderPayment(result.orderId);
    }

    return {
        success: result.settled
            ? "Die Rechnung ist vollständig beglichen."
            : `Teilzahlung verbucht. Offen bleiben ${formatEuro(result.invoice!.outstanding)}.`
    };
}

export async function handleReverseAction(event: RequestEvent) {
    requirePermission(event, "finance.manage");

    const form = await event.request.formData();
    const paymentId = String(form.get("paymentId") ?? "");

    if (!paymentId) return fail(400, { error: "Es wurde keine Zahlung ausgewählt." });

    const result = await reversePayment(paymentId, event.locals.user?.email ?? "system");
    if (!result.ok) return fail(400, { error: result.error });

    if (result.orderId) {
        await syncOrderPayment(result.orderId);
    }

    return { success: "Die Zahlung wurde storniert." };
}
