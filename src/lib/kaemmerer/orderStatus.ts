/**
 * Status-Definitionen fuer Kaemmerer-Bestellungen.
 *
 * Ersetzt die bisher in vier Seiten kopierten statusLabel/statusTone-Paare und
 * liefert zugleich die Validierung, die serverseitig gefehlt hat (dort wurde
 * der Formularwert per `as any` ungeprueft in die Datenbank geschrieben).
 */

export const ORDER_STATUSES = ["ordered", "processing", "delivered", "paid"] as const;
export const PAYMENT_STATUSES = ["open", "partial", "paid"] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
    ordered: "Bestellt",
    processing: "In Bearbeitung",
    delivered: "Geliefert",
    paid: "Abgeschlossen"
};

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
    open: "Offen",
    partial: "Teilweise bezahlt",
    paid: "Bezahlt"
};

/** Semantische Farbrolle, aufgeloest ueber die Design-Tokens. */
export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const ORDER_STATUS_TONES: Record<OrderStatus, Tone> = {
    ordered: "info",
    processing: "warning",
    delivered: "success",
    paid: "success"
};

const PAYMENT_STATUS_TONES: Record<PaymentStatus, Tone> = {
    open: "warning",
    partial: "info",
    paid: "success"
};

export function isOrderStatus(value: unknown): value is OrderStatus {
    return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}

export function isPaymentStatus(value: unknown): value is PaymentStatus {
    return typeof value === "string" && (PAYMENT_STATUSES as readonly string[]).includes(value);
}

/** Validiert einen Formularwert; null bedeutet "ungueltig, bitte ablehnen". */
export function parseOrderStatus(value: unknown): OrderStatus | null {
    return isOrderStatus(value) ? value : null;
}

export function parsePaymentStatus(value: unknown): PaymentStatus | null {
    return isPaymentStatus(value) ? value : null;
}

export function orderStatusLabel(status: unknown): string {
    return isOrderStatus(status) ? ORDER_STATUS_LABELS[status] : "Unbekannt";
}

export function paymentStatusLabel(status: unknown): string {
    return isPaymentStatus(status) ? PAYMENT_STATUS_LABELS[status] : "Unbekannt";
}

export function orderStatusTone(status: unknown): Tone {
    return isOrderStatus(status) ? ORDER_STATUS_TONES[status] : "neutral";
}

export function paymentStatusTone(status: unknown): Tone {
    return isPaymentStatus(status) ? PAYMENT_STATUS_TONES[status] : "neutral";
}

/** Auswahllisten fuer Formulare -- eine einzige Quelle statt zweier Dropdowns. */
export const ORDER_STATUS_OPTIONS = ORDER_STATUSES.map((value) => ({
    value,
    label: ORDER_STATUS_LABELS[value]
}));

export const PAYMENT_STATUS_OPTIONS = PAYMENT_STATUSES.map((value) => ({
    value,
    label: PAYMENT_STATUS_LABELS[value]
}));
