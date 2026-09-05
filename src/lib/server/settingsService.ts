import { settings, type SettingsDoc } from "$lib/server/db/collections";
import type { Cents } from "$lib/money";

/**
 * Einstellungen der Kasse.
 *
 * Neu sind die Bankdaten: der Beitragsbescheid als PDF war bereits fertig
 * implementiert, druckte einen Abschnitt "Bankverbindung" -- und es gab
 * nirgends einen Ort, an dem IBAN, BIC oder Kontoinhaber hinterlegt werden
 * konnten. Entsprechend war das PDF an keine Route angeschlossen.
 */

export interface BankDetails {
    accountHolder: string;
    iban: string;
    bic: string;
    bankName: string;
    creditorId: string;
}

export interface FinanceSettings {
    /** Beitragsanteile in Cents. */
    contributions: {
        stamm: Cents;
        gau: Cents;
        landesmark: Cents;
        bund: Cents;
    };
    bank: BankDetails;
    updatedAt?: string;
    updatedBy?: string;
}

const FINANCE_SETTINGS_ID = "finance";

const EMPTY_BANK: BankDetails = {
    accountHolder: "",
    iban: "",
    bic: "",
    bankName: "",
    creditorId: ""
};

export async function getFinanceSettings(): Promise<FinanceSettings> {
    const doc = await settings().findOne({ _id: FINANCE_SETTINGS_ID });

    return {
        contributions: {
            stamm: Number(doc?.contributions?.stamm) || 0,
            gau: Number(doc?.contributions?.gau) || 0,
            landesmark: Number(doc?.contributions?.landesmark) || 0,
            bund: Number(doc?.contributions?.bund) || 0
        },
        bank: { ...EMPTY_BANK, ...(doc?.bank ?? {}) },
        updatedAt: doc?.updatedAt,
        updatedBy: doc?.updatedBy
    };
}

export async function saveFinanceSettings(
    input: { contributions: FinanceSettings["contributions"]; bank?: Partial<BankDetails> },
    updatedBy: string
): Promise<FinanceSettings> {
    const payload: Omit<SettingsDoc, "_id"> = {
        contributions: input.contributions,
        bank: { ...EMPTY_BANK, ...(input.bank ?? {}) },
        updatedAt: new Date().toISOString(),
        updatedBy
    };

    await settings().updateOne(
        { _id: FINANCE_SETTINGS_ID },
        { $set: payload },
        { upsert: true }
    );

    return { ...payload, bank: payload.bank! } as FinanceSettings;
}

/** Grobe Plausibilitätsprüfung einer IBAN inklusive Prüfziffer. */
export function isValidIban(value: string): boolean {
    const iban = value.replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;

    // Die ersten vier Zeichen ans Ende, Buchstaben zu Zahlen, Modulo 97.
    const rearranged = iban.slice(4) + iban.slice(0, 4);
    const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));

    let remainder = 0;
    for (const digit of numeric) {
        remainder = (remainder * 10 + Number(digit)) % 97;
    }
    return remainder === 1;
}

/** IBAN in Vierergruppen für die Anzeige. */
export function formatIban(value: string): string {
    const iban = value.replace(/\s+/g, "").toUpperCase();
    return iban.replace(/(.{4})/g, "$1 ").trim();
}
