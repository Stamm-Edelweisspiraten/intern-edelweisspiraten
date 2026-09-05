import { ObjectId } from "mongodb";
import { fiscalInvoices, fiscalYears } from "$lib/server/db/collections";
import { getAllMembers } from "$lib/server/memberService";
import { calculateMemberDues } from "./dues";
import { KIND_DUES } from "./types";
import { fullName } from "$lib/format";
import type { Cents } from "$lib/money";

/**
 * Anlegen der Jahresbeiträge.
 *
 * Das geschah bisher als Nebenwirkung IM LOAD der Seite "Offene Posten": bei
 * jedem Seitenaufruf lief ein Schreibvorgang pro Mitglied, ohne Sperre. Zwei
 * gleichzeitige Aufrufe -- schon ein Prefetch genügt -- erzeugten doppelte
 * Rechnungen.
 *
 * Jetzt ist es eine ausdrückliche Aktion, sie ist idempotent, und der
 * eindeutige Teilindex auf (Jahr, Mitglied, Art) macht Doppelanlagen auch bei
 * gleichzeitiger Ausführung unmöglich.
 */

export interface SeedPreviewEntry {
    memberId: string;
    member: string;
    amount: Cents;
    existing: boolean;
}

export interface SeedPreview {
    entries: SeedPreviewEntry[];
    newCount: number;
    existingCount: number;
    newTotal: Cents;
}

/** Zeigt, was ein Lauf bewirken würde -- ohne zu schreiben. */
export async function previewDuesSeeding(fiscalYearId: string): Promise<SeedPreview | null> {
    if (!ObjectId.isValid(fiscalYearId)) return null;

    const yearId = new ObjectId(fiscalYearId);
    const year = await fiscalYears().findOne({ _id: yearId });
    if (!year) return null;

    const [members, existing] = await Promise.all([
        getAllMembers(),
        fiscalInvoices().find({ fiscalYearId: yearId, kind: KIND_DUES }).toArray()
    ]);

    const existingByMember = new Set(existing.map((invoice) => invoice.memberId ?? ""));

    const entries: SeedPreviewEntry[] = members.map((member: Record<string, unknown>) => {
        const memberId = String(member._id);
        const { payable } = calculateMemberDues(year.dues, member as never);

        return {
            memberId,
            member: fullName(member as { firstname?: string; lastname?: string }),
            amount: payable,
            existing: existingByMember.has(memberId)
        };
    });

    const fresh = entries.filter((entry) => !entry.existing && entry.amount > 0);

    return {
        entries,
        newCount: fresh.length,
        existingCount: entries.length - fresh.length,
        newTotal: fresh.reduce((sum, entry) => sum + entry.amount, 0)
    };
}

export interface SeedResult {
    ok: boolean;
    error?: string;
    created: number;
    skipped: number;
}

export async function seedYearlyDues(
    fiscalYearId: string,
    user: string
): Promise<SeedResult> {
    if (!ObjectId.isValid(fiscalYearId)) {
        return { ok: false, error: "Ungültiges Geschäftsjahr.", created: 0, skipped: 0 };
    }

    const yearId = new ObjectId(fiscalYearId);
    const year = await fiscalYears().findOne({ _id: yearId });
    if (!year) return { ok: false, error: "Geschäftsjahr nicht gefunden.", created: 0, skipped: 0 };
    if (year.status !== "active") {
        return {
            ok: false,
            error: "Abgeschlossene Geschäftsjahre können nicht mehr bebucht werden.",
            created: 0,
            skipped: 0
        };
    }

    const preview = await previewDuesSeeding(fiscalYearId);
    if (!preview) return { ok: false, error: "Vorschau fehlgeschlagen.", created: 0, skipped: 0 };

    const fresh = preview.entries.filter((entry) => !entry.existing && entry.amount > 0);
    if (fresh.length === 0) {
        return { ok: true, created: 0, skipped: preview.entries.length };
    }

    // Fälligkeit: 31. März des Geschäftsjahres.
    const dueDate = new Date(Date.UTC(year.year, 2, 31));
    const now = new Date();

    const operations = fresh.map((entry) => ({
        updateOne: {
            filter: { fiscalYearId: yearId, memberId: entry.memberId, kind: KIND_DUES },
            update: {
                $setOnInsert: {
                    fiscalYearId: yearId,
                    memberId: entry.memberId,
                    member: entry.member,
                    kind: KIND_DUES,
                    amount: entry.amount,
                    paidAmount: 0,
                    date: now,
                    dueDate,
                    note: "",
                    orderId: null,
                    status: "open",
                    createdBy: user,
                    createdAt: now
                }
            },
            upsert: true
        }
    }));

    const result = await fiscalInvoices().bulkWrite(operations as never, { ordered: false });

    return {
        ok: true,
        created: result.upsertedCount ?? 0,
        skipped: preview.entries.length - (result.upsertedCount ?? 0)
    };
}
