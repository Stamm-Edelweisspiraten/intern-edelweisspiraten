import { eq } from "drizzle-orm";
import { db } from "$lib/server/db";
import { settings } from "$lib/server/db/schema";
import type { Cents } from "$lib/money";

/**
 * Einstellungen als Schluessel-Wert-Ablage.
 *
 * Zwei Bereiche: "organization" traegt Name und Kontaktdaten des Stamms --
 * dadurch laeuft dieselbe Anwendung fuer verschiedene Staemme, ohne dass der
 * Name im Quelltext steht. "finance" traegt die Standard-Beitragssaetze und
 * die Bankverbindung.
 *
 * Die Bankdaten waren der fehlende Baustein fuer den Beitragsbescheid: das
 * PDF druckte bereits einen Abschnitt "Bankverbindung", es gab aber nirgends
 * einen Ort, an dem IBAN, BIC oder Kontoinhaber hinterlegt werden konnten.
 */

// ---------------------------------------------------------------------------
// Kasse
// ---------------------------------------------------------------------------

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

const FINANCE_KEY = "finance";
const ORGANIZATION_KEY = "organization";

const EMPTY_BANK: BankDetails = {
    accountHolder: "",
    iban: "",
    bic: "",
    bankName: "",
    creditorId: ""
};

async function readSetting(key: string): Promise<{
    value: Record<string, unknown>;
    updatedAt?: string;
    updatedBy?: string;
} | null> {
    const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
    if (!row) return null;
    return {
        value: row.value ?? {},
        updatedAt: row.updatedAt?.toISOString(),
        updatedBy: row.updatedBy
    };
}

/**
 * Rohzugriff auf einen Einstellungsbereich.
 *
 * Fuer Bereiche mit eigenem Zuschnitt -- der Objektspeicher etwa legt seinen
 * geheimen Schluessel verschluesselt ab und braucht deshalb eine eigene
 * Auf- und Abbildung. Die uebrigen Bereiche gehen weiter ueber ihre
 * typisierten Funktionen.
 */
export async function readSettingRaw(key: string): Promise<Record<string, unknown> | null> {
    const setting = await readSetting(key);
    return setting?.value ?? null;
}

export async function writeSettingRaw(
    key: string,
    value: Record<string, unknown>,
    updatedBy: string
): Promise<void> {
    await writeSetting(key, value, updatedBy);
}

async function writeSetting(
    key: string,
    value: Record<string, unknown>,
    updatedBy: string
): Promise<void> {
    await db
        .insert(settings)
        .values({ key, value, updatedBy, updatedAt: new Date() })
        .onConflictDoUpdate({
            target: settings.key,
            set: { value, updatedBy, updatedAt: new Date() }
        });
}

export async function getFinanceSettings(): Promise<FinanceSettings> {
    const row = await readSetting(FINANCE_KEY);
    const value = (row?.value ?? {}) as {
        contributions?: Partial<FinanceSettings["contributions"]>;
        bank?: Partial<BankDetails>;
    };

    return {
        contributions: {
            stamm: Number(value.contributions?.stamm) || 0,
            gau: Number(value.contributions?.gau) || 0,
            landesmark: Number(value.contributions?.landesmark) || 0,
            bund: Number(value.contributions?.bund) || 0
        },
        bank: { ...EMPTY_BANK, ...(value.bank ?? {}) },
        updatedAt: row?.updatedAt,
        updatedBy: row?.updatedBy
    };
}

export async function saveFinanceSettings(
    input: { contributions: FinanceSettings["contributions"]; bank?: Partial<BankDetails> },
    updatedBy: string
): Promise<FinanceSettings> {
    const bank = { ...EMPTY_BANK, ...(input.bank ?? {}) };
    await writeSetting(FINANCE_KEY, { contributions: input.contributions, bank }, updatedBy);
    return getFinanceSettings();
}

// ---------------------------------------------------------------------------
// Organisation
// ---------------------------------------------------------------------------

export interface OrganizationSettings {
    /** Vollstaendiger Name, z. B. "Stamm Musterstadt". */
    name: string;
    /** Kurzform fuer enge Stellen, z. B. "Musterstadt". */
    shortName: string;
    city: string;
    contactEmail: string;
    website: string;
    imprintUrl: string;
    privacyUrl: string;
    instagramUrl: string;
    /** Kennung in der Dateiablage; leer, wenn kein Logo hinterlegt ist. */
    logoFileId: string;
    /** Ueberschreibt --primary, wenn gesetzt (Hex-Wert). */
    primaryColor: string;
}

/**
 * Vorbelegung, solange die Einrichtung nicht durchlaufen wurde. Bewusst
 * neutral -- ein fest verdrahteter Stammesname waere genau das, was diese
 * Einstellung abschaffen soll.
 */
export const DEFAULT_ORGANIZATION: OrganizationSettings = {
    name: "Internes Portal",
    shortName: "Portal",
    city: "",
    contactEmail: "",
    website: "",
    imprintUrl: "",
    privacyUrl: "",
    instagramUrl: "",
    logoFileId: "",
    primaryColor: ""
};

export async function getOrganizationSettings(): Promise<OrganizationSettings> {
    const row = await readSetting(ORGANIZATION_KEY);
    return { ...DEFAULT_ORGANIZATION, ...((row?.value ?? {}) as Partial<OrganizationSettings>) };
}

export async function saveOrganizationSettings(
    input: Partial<OrganizationSettings>,
    updatedBy: string
): Promise<OrganizationSettings> {
    const current = await getOrganizationSettings();
    const merged: OrganizationSettings = { ...current, ...input };
    await writeSetting(ORGANIZATION_KEY, { ...merged }, updatedBy);
    return merged;
}

/** true, sobald die Einrichtung einmal durchlaufen wurde. */
export async function isOrganizationConfigured(): Promise<boolean> {
    const row = await readSetting(ORGANIZATION_KEY);
    return Boolean(row);
}

// ---------------------------------------------------------------------------
// IBAN
// ---------------------------------------------------------------------------

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
