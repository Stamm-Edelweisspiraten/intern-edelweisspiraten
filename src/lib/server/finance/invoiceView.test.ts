import { describe, expect, it } from "vitest";
import { toInvoiceView } from "./invoiceService";
import { invoices } from "$lib/server/db/schema";

/**
 * Prüft die Ableitung des offenen Betrags und des Verzugs. Das ist der Kern
 * der Berechnung, die vorher an vier Stellen kopiert war -- und dort nach
 * zwei verschiedenen Regeln arbeitete.
 */

type InvoiceRow = typeof invoices.$inferSelect;

function invoice(overrides: Partial<InvoiceRow> = {}): InvoiceRow {
    return {
        id: "11111111-1111-4111-8111-111111111111",
        number: "2026-0001",
        fiscalYearId: "22222222-2222-4222-8222-222222222222",
        memberId: "33333333-3333-4333-8333-333333333333",
        memberName: "Anna Müller",
        kind: "Jahresbeitrag",
        categoryId: null,
        amount: 6500,
        paidAmount: 0,
        date: new Date("2026-01-15T00:00:00Z"),
        dueDate: null,
        note: "",
        status: "open",
        orderId: null,
        entryId: null,
        remindedAt: null,
        reminderLevel: 0,
        createdBy: "test",
        createdAt: new Date("2026-01-15T00:00:00Z"),
        updatedAt: null,
        ...overrides
    };
}

describe("toInvoiceView", () => {
    it("weist bei unbezahlter Rechnung den vollen Betrag als offen aus", () => {
        const view = toInvoiceView(invoice());
        expect(view.outstanding).toBe(6500);
        expect(view.status).toBe("open");
    });

    it("zieht Teilzahlungen ab", () => {
        const view = toInvoiceView(invoice({ paidAmount: 2000, status: "partial" }));
        expect(view.outstanding).toBe(4500);
        expect(view.status).toBe("partial");
    });

    it("weist bei vollständiger Zahlung 0 aus", () => {
        const view = toInvoiceView(invoice({ paidAmount: 6500, status: "paid" }));
        expect(view.outstanding).toBe(0);
    });

    it("wird bei Überzahlung nicht negativ", () => {
        // Die Datenbank laesst das ueber invoices_paid_check gar nicht erst
        // zu; die Ansicht muss trotzdem robust bleiben.
        const view = toInvoiceView(invoice({ paidAmount: 7000, status: "paid" }));
        expect(view.outstanding).toBe(0);
    });

    it("markiert überfällige offene Rechnungen", () => {
        const view = toInvoiceView(invoice({ dueDate: new Date("2020-03-31T00:00:00Z") }));
        expect(view.overdue).toBe(true);
    });

    it("markiert bezahlte Rechnungen nie als überfällig", () => {
        const view = toInvoiceView(
            invoice({
                paidAmount: 6500,
                status: "paid",
                dueDate: new Date("2020-03-31T00:00:00Z")
            })
        );
        expect(view.overdue).toBe(false);
    });

    it("markiert stornierte Rechnungen nie als überfällig", () => {
        const view = toInvoiceView(
            invoice({ status: "cancelled", dueDate: new Date("2020-03-31T00:00:00Z") })
        );
        expect(view.overdue).toBe(false);
    });

    it("markiert Rechnungen ohne Fälligkeit nicht als überfällig", () => {
        expect(toInvoiceView(invoice({ dueDate: null })).overdue).toBe(false);
    });

    it("markiert noch nicht fällige Rechnungen nicht als überfällig", () => {
        const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        expect(toInvoiceView(invoice({ dueDate: future })).overdue).toBe(false);
    });

    it("markiert eine heute fällige Rechnung noch nicht als überfällig", () => {
        // Der Vergleich laeuft gegen den Tagesbeginn; sonst waere eine heute
        // faellige Rechnung ab 00:01 Uhr ueberfaellig.
        const today = new Date();
        today.setHours(12, 0, 0, 0);
        expect(toInvoiceView(invoice({ dueDate: today })).overdue).toBe(false);
    });

    it("setzt einen Platzhalter, wenn kein Mitglied hinterlegt ist", () => {
        const view = toInvoiceView(invoice({ memberName: null, memberId: null }));
        expect(view.member).toBe("Unbekannt");
        expect(view.memberId).toBeNull();
    });
});
