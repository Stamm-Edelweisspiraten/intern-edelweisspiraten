import { describe, expect, it } from "vitest";
import {
    isOrderStatus,
    isPaymentStatus,
    orderStatusLabel,
    orderStatusTone,
    ORDER_STATUSES,
    parseOrderStatus,
    parsePaymentStatus,
    paymentStatusLabel,
    PAYMENT_STATUSES
} from "./orderStatus";

describe("Statusprüfung", () => {
    it("erkennt gültige Bestellstatus", () => {
        for (const status of ORDER_STATUSES) {
            expect(isOrderStatus(status)).toBe(true);
        }
    });

    it("erkennt gültige Zahlungsstatus", () => {
        for (const status of PAYMENT_STATUSES) {
            expect(isPaymentStatus(status)).toBe(true);
        }
    });

    it("weist beliebige Zeichenketten ab", () => {
        // Genau das kam vorher über `form.get(...) as any` ungeprüft in die
        // Datenbank und wurde danach dauerhaft als unbekannt angezeigt.
        for (const value of ["", "erledigt", "PAID", "<script>", "0", "null"]) {
            expect(isOrderStatus(value)).toBe(false);
        }
    });

    it("weist Werte ab, die keine Zeichenketten sind", () => {
        for (const value of [null, undefined, 42, {}, []]) {
            expect(isOrderStatus(value)).toBe(false);
            expect(isPaymentStatus(value)).toBe(false);
        }
    });

    it("hält Liefer- und Zahlungsstatus getrennt", () => {
        // "paid" gehört zum Zahlungsstatus, nicht zum Lieferstatus -- vorher
        // überschrieb eine Zahlung den Lieferstatus.
        expect(isOrderStatus("paid")).toBe(false);
        expect(isPaymentStatus("paid")).toBe(true);

        expect(isPaymentStatus("delivered")).toBe(false);
        expect(isOrderStatus("delivered")).toBe(true);
    });

    it("gibt bei parse… null statt eines Ersatzwertes zurück", () => {
        expect(parseOrderStatus("unsinn")).toBeNull();
        expect(parsePaymentStatus("unsinn")).toBeNull();
        expect(parseOrderStatus("delivered")).toBe("delivered");
        expect(parsePaymentStatus("partial")).toBe("partial");
    });
});

describe("Beschriftungen", () => {
    it("liefert für jeden Status eine deutsche Beschriftung", () => {
        for (const status of ORDER_STATUSES) {
            expect(orderStatusLabel(status)).toBeTruthy();
            expect(orderStatusLabel(status)).not.toBe("Unbekannt");
        }
        for (const status of PAYMENT_STATUSES) {
            expect(paymentStatusLabel(status)).not.toBe("Unbekannt");
        }
    });

    it("fällt bei unbekannten Werten auf einen Platzhalter zurück", () => {
        expect(orderStatusLabel("quatsch")).toBe("Unbekannt");
        expect(paymentStatusLabel(null)).toBe("Unbekannt");
        expect(orderStatusTone("quatsch")).toBe("neutral");
    });

    it("markiert Storno als Gefahr und Lieferung als Erfolg", () => {
        expect(orderStatusTone("cancelled")).toBe("danger");
        expect(orderStatusTone("delivered")).toBe("success");
    });
});
