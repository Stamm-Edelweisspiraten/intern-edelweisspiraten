import type { AccountSphere, AccountType, TransactionDirection } from "./types";

/**
 * Mitgelieferter Kontenrahmen fuer einen gemeinnuetzigen Verein.
 *
 * An SKR49 angelehnt, aber bewusst schlank: die amtlichen Kontenrahmen haben
 * mehrere hundert Konten, von denen ein Pfadfinderstamm kaum eines nutzt.
 * Erweitern kann jeder Stamm selbst, die hier angelegten Konten sind als
 * Systemkonten markiert und damit nicht loeschbar.
 *
 * Diese Datei enthaelt ausschliesslich Daten und Typen -- keine
 * Datenbankzugriffe. Dadurch kann sie auch vom Seed-Skript ausserhalb von
 * Vite geladen werden, ohne dass die Kontenliste ein zweites Mal existiert.
 *
 * Die vier Bereiche entsprechen den steuerlichen Sphaeren eines Vereins:
 * ideeller Bereich, Vermoegensverwaltung, Zweckbetrieb und wirtschaftlicher
 * Geschaeftsbetrieb.
 */

export interface SeedAccount {
    number: string;
    name: string;
    type: AccountType;
    sphere?: AccountSphere;
    isBank?: boolean;
    description?: string;
}

export const CHART_OF_ACCOUNTS: SeedAccount[] = [
    // --- Aktiva -----------------------------------------------------------
    { number: "0640", name: "Ausrüstung und Material", type: "asset", sphere: "neutral" },
    { number: "1000", name: "Barkasse", type: "asset", sphere: "neutral", isBank: true },
    { number: "1200", name: "Bankkonto", type: "asset", sphere: "neutral", isBank: true },
    {
        number: "1400",
        name: "Forderungen aus Beiträgen und Bestellungen",
        type: "asset",
        sphere: "neutral",
        description: "Sammelkonto der offenen Posten."
    },

    // --- Passiva ----------------------------------------------------------
    {
        number: "1600",
        name: "Verbindlichkeiten aus Lieferungen und Leistungen",
        type: "liability",
        sphere: "neutral"
    },
    { number: "1700", name: "Sonstige Verbindlichkeiten", type: "liability", sphere: "neutral" },

    // --- Eigenkapital -----------------------------------------------------
    { number: "0800", name: "Vereinsvermögen", type: "equity", sphere: "neutral" },
    {
        number: "0810",
        name: "Zweckgebundene Rücklagen",
        type: "equity",
        sphere: "neutral",
        description: "Mittel, die für ein bestimmtes Vorhaben zurückgelegt sind."
    },

    // --- Erträge: ideeller Bereich ---------------------------------------
    { number: "4100", name: "Mitgliedsbeiträge", type: "income", sphere: "ideell" },
    { number: "4110", name: "Spenden", type: "income", sphere: "ideell" },
    { number: "4120", name: "Zuschüsse und Fördermittel", type: "income", sphere: "ideell" },
    { number: "4190", name: "Sonstige ideelle Erträge", type: "income", sphere: "ideell" },

    // --- Erträge: Vermögensverwaltung ------------------------------------
    { number: "4200", name: "Zinserträge", type: "income", sphere: "vermoegensverwaltung" },

    // --- Erträge: Zweckbetrieb -------------------------------------------
    { number: "4300", name: "Teilnehmerbeiträge Lager und Fahrten", type: "income", sphere: "zweckbetrieb" },
    { number: "4310", name: "Teilnehmerbeiträge Aktionen", type: "income", sphere: "zweckbetrieb" },

    // --- Erträge: wirtschaftlicher Geschäftsbetrieb ----------------------
    { number: "4400", name: "Verkauf von Ausrüstung und Kluft", type: "income", sphere: "wirtschaftlich" },
    { number: "4410", name: "Sonstige wirtschaftliche Erträge", type: "income", sphere: "wirtschaftlich" },

    // --- Aufwendungen: ideeller Bereich -----------------------------------
    { number: "5100", name: "Beitragsabführung Gau", type: "expense", sphere: "ideell" },
    { number: "5110", name: "Beitragsabführung Landesmark", type: "expense", sphere: "ideell" },
    { number: "5120", name: "Beitragsabführung Bund", type: "expense", sphere: "ideell" },
    { number: "5200", name: "Gruppenstunden und Material", type: "expense", sphere: "ideell" },
    { number: "5210", name: "Öffentlichkeitsarbeit", type: "expense", sphere: "ideell" },
    { number: "5220", name: "Ausbildung und Schulung", type: "expense", sphere: "ideell" },
    { number: "5230", name: "Versicherungen und Beiträge", type: "expense", sphere: "ideell" },
    { number: "5240", name: "Verwaltung, Porto, Software", type: "expense", sphere: "ideell" },
    { number: "5250", name: "Miete und Nebenkosten Heim", type: "expense", sphere: "ideell" },
    { number: "5290", name: "Sonstige ideelle Aufwendungen", type: "expense", sphere: "ideell" },

    // --- Aufwendungen: Zweckbetrieb ---------------------------------------
    { number: "5300", name: "Lager und Fahrten", type: "expense", sphere: "zweckbetrieb" },
    { number: "5310", name: "Aktionen und Veranstaltungen", type: "expense", sphere: "zweckbetrieb" },
    { number: "5320", name: "Fahrtkosten", type: "expense", sphere: "zweckbetrieb" },

    // --- Aufwendungen: wirtschaftlicher Geschäftsbetrieb ------------------
    { number: "5400", name: "Wareneinkauf Ausrüstung und Kluft", type: "expense", sphere: "wirtschaftlich" },
    { number: "5410", name: "Pfadverlag", type: "expense", sphere: "wirtschaftlich" },
    { number: "5490", name: "Sonstige wirtschaftliche Aufwendungen", type: "expense", sphere: "wirtschaftlich" },

    // --- Bankgebühren ------------------------------------------------------
    { number: "5900", name: "Bank- und Kontoführungsgebühren", type: "expense", sphere: "neutral" }
];

/** Kontonummern, auf die die Geschaeftslogik ausdruecklich zugreift. */
export const SYSTEM_ACCOUNTS = {
    /** Sammelkonto der Forderungen. */
    receivables: "1400",
    /** Sammelkonto der Verbindlichkeiten. */
    payables: "1600",
    /** Vorbelegtes Bankkonto der Ersteinrichtung. */
    bank: "1200",
    cash: "1000",
    /** Gegenkonto der Jahresbeitraege. */
    dues: "4100",
    /** Gegenkonto der Bestellungen. */
    orders: "4400",
    /** Eigenkapital, auf das der Jahresabschluss bucht. */
    equity: "0800"
} as const;

/**
 * Buchungsarten der einfachen Maske, vorbelegt aus TRANSACTION_KINDS. Jede
 * zeigt auf ein Erfolgskonto -- daraus entsteht die Gegenbuchung, ohne dass
 * der Kassenwart Soll und Haben kennen muss.
 */
export const DEFAULT_CATEGORIES: {
    name: string;
    direction: TransactionDirection;
    account: string;
}[] = [
    { name: "Jahresbeitrag", direction: "in", account: "4100" },
    { name: "Spende", direction: "in", account: "4110" },
    { name: "Zuschuss", direction: "in", account: "4120" },
    { name: "Bestellung", direction: "in", account: "4400" },
    { name: "Lager/Aktion (Einnahme)", direction: "in", account: "4300" },
    { name: "Sonstige Einnahme", direction: "in", account: "4190" },

    { name: "Öffentlichkeitsarbeit", direction: "out", account: "5210" },
    { name: "Gruppenstunde/Material", direction: "out", account: "5200" },
    { name: "Lager/Aktion", direction: "out", account: "5300" },
    { name: "Ausrüstung", direction: "out", account: "5400" },
    { name: "Pfadverlag", direction: "out", account: "5410" },
    { name: "Beitragsabführung", direction: "out", account: "5100" },
    { name: "Verwaltung", direction: "out", account: "5240" },
    { name: "Bankgebühren", direction: "out", account: "5900" },
    { name: "Sonstiges", direction: "out", account: "5290" }
];
