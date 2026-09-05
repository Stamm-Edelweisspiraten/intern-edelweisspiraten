import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { toInvoiceView } from "./invoiceService";
import type { FiscalInvoiceDoc } from "$lib/server/db/collections";

/**
 * Prüft die Ableitung des offenen Betrags und des Verzugs. Das ist der Kern
 * der Berechnung, die vorher an vier Stellen kopiert war -- und dort nach
 * zwei verschiedenen Regeln arbeitete.
 */

function invoice(overrides: Partial<FiscalInvoiceDoc> = {}): FiscalInvoiceDoc {
    return {
        _id: new ObjectId(),
        fiscalYearId: new ObjectId(),
        memberId: "m1",
        member: "Anna Müller",
        kind: "Jahresbeitrag",
        amount: 6500,
        paidAmount: 0,
        date: new Date("2026-01-15T00:00:00Z"),
        dueDate: null,
        note: "",
        orderId: null,
        status: "open",
        createdAt: new Date("2026-01-15T00:00:00Z"),
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
        const view = toInvoiceView(invoice({ paidAmount: 7000, status: "paid" }));
        expect(view.outstanding).toBe(0);
    });

    it("markiert überfällige offene Rechnungen", () => {
        const view = toInvoiceView(
            invoice({ dueDate: new Date("2020-03-31T00:00:00Z") })
        );
        expect(view.overdue).toBe(true);
    });

    it("markiert bezahlte Rechnungen nie als überfällig", () => {
        const view = toInvoiceView(
            invoice({ paidAmount: 6500, status: "paid", dueDate: new Date("2020-03-31T00:00:00Z") })
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

    it("setzt einen Platzhalter, wenn kein Mitglied hinterlegt ist", () => {
        const view = toInvoiceView(invoice({ member: undefined, memberId: null }));
        expect(view.member).toBe("Unbekannt");
        expect(view.memberId).toBeNull();
    });
});
