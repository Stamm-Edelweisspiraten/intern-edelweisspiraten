import { sumCents, type Cents } from "$lib/money";
import type { Dues } from "./types";

/**
 * Berechnung des Jahresbeitrags eines Mitglieds.
 */

export interface MemberDuesInput {
    isSecondMember?: boolean;
    contributionDues?: {
        stamm?: boolean;
        gau?: boolean;
        landesmark?: boolean;
        bund?: boolean;
    };
}

export interface MemberDuesResult {
    payable: Cents;
    parts: Dues;
    /** Anteile, die abgewählt wurden -- für die Anzeige im Beitragsbescheid. */
    waived: Dues;
}

/**
 * Vorher wurden die Häkchen in contributionDues NUR bei Zweitmitgliedern
 * ausgewertet: für alle anderen wurde stets die volle Summe berechnet und das
 * korrekt ermittelte Teilergebnis anschließend verworfen. Ein Mitglied mit
 * abgewähltem Bundesbeitrag zahlte also trotzdem den vollen Betrag.
 *
 * Die Häkchen gelten jetzt für alle Mitglieder gleichermaßen.
 */
export function calculateMemberDues(dues: Dues, member: MemberDuesInput | null): MemberDuesResult {
    const flags = {
        stamm: member?.contributionDues?.stamm !== false,
        gau: member?.contributionDues?.gau !== false,
        landesmark: member?.contributionDues?.landesmark !== false,
        bund: member?.contributionDues?.bund !== false
    };

    const parts: Dues = {
        stamm: flags.stamm ? dues.stamm : 0,
        gau: flags.gau ? dues.gau : 0,
        landesmark: flags.landesmark ? dues.landesmark : 0,
        bund: flags.bund ? dues.bund : 0
    };

    const waived: Dues = {
        stamm: dues.stamm - parts.stamm,
        gau: dues.gau - parts.gau,
        landesmark: dues.landesmark - parts.landesmark,
        bund: dues.bund - parts.bund
    };

    return {
        payable: sumCents(Object.values(parts)),
        parts,
        waived
    };
}

/** Gesamtbeitrag eines Geschäftsjahres ohne Abwahl. */
export function totalDues(dues: Dues): Cents {
    return sumCents([dues.stamm, dues.gau, dues.landesmark, dues.bund]);
}
