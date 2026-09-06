import type { AccountSphere, AccountType, JournalSource } from "$lib/server/finance/types";
import type { Tone } from "$lib/components/ui";

/**
 * Beschriftungen der Kasse.
 *
 * Bewusst ausserhalb von $lib/server, damit sie auch in den Seiten nutzbar
 * sind -- der Typenimport ist rein typseitig und zieht keinen Servercode in
 * das Bundle.
 */

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
    asset: "Aktiva",
    liability: "Passiva",
    equity: "Eigenkapital",
    income: "Ertrag",
    expense: "Aufwand"
};

export const ACCOUNT_TYPE_TONES: Record<AccountType, Tone> = {
    asset: "primary",
    liability: "warning",
    equity: "info",
    income: "success",
    expense: "danger"
};

/** Steuerliche Sphaeren eines gemeinnuetzigen Vereins. */
export const SPHERE_LABELS: Record<AccountSphere, string> = {
    ideell: "Ideeller Bereich",
    vermoegensverwaltung: "Vermögensverwaltung",
    zweckbetrieb: "Zweckbetrieb",
    wirtschaftlich: "Wirtschaftlicher Geschäftsbetrieb",
    neutral: "Neutral"
};

export const SOURCE_LABELS: Record<JournalSource, string> = {
    manual: "Erfasst",
    invoice: "Forderung",
    payment: "Zahlung",
    order: "Bestellung",
    recurring: "Wiederkehrend",
    import: "Kontoauszug",
    opening: "Eröffnung",
    closing: "Abschluss"
};

export const ACCOUNT_TYPES = Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[];
export const SPHERES = Object.keys(SPHERE_LABELS) as AccountSphere[];
