import { and, eq } from "drizzle-orm";
import { db, withTransaction } from "$lib/server/db";
import { isUuid } from "$lib/server/db/ids";
import { invoices } from "$lib/server/db/schema";
import { getAllMembers } from "$lib/server/memberService";
import { fullName } from "$lib/format";
import type { Cents } from "$lib/money";
import { calculateMemberDues } from "./dues";
import { createInvoice } from "./invoiceService";
import { getFiscalYear } from "./yearService";
import { getCategoryByName } from "./categoryService";
import { KIND_DUES } from "./types";

/**
 * Anlegen der Jahresbeiträge.
 *
 * Das geschah bisher als Nebenwirkung IM LOAD der Seite "Offene Posten": bei
 * jedem Seitenaufruf lief ein Schreibvorgang pro Mitglied, ohne Sperre. Zwei
 * gleichzeitige Aufrufe -- schon ein Prefetch genügt -- erzeugten doppelte
 * Rechnungen.
 *
 * Jetzt ist es eine ausdrückliche Aktion, sie ist idempotent, und der
 * eindeutige Index auf (Jahr, Mitglied, Art) macht Doppelanlagen auch bei
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
    if (!isUuid(fiscalYearId)) return null;

    const year = await getFiscalYear(fiscalYearId);
    if (!year) return null;

    const [members, existing] = await Promise.all([
        getAllMembers(),
        db
            .select({ memberId: invoices.memberId })
            .from(invoices)
            .where(and(eq(invoices.fiscalYearId, fiscalYearId), eq(invoices.kind, KIND_DUES)))
    ]);

    const existingByMember = new Set(existing.map((row) => row.memberId ?? ""));

    const entries: SeedPreviewEntry[] = members.map((member) => {
        const { payable } = calculateMemberDues(year.dues, member);
        return {
            memberId: member.id,
            member: fullName(member),
            amount: payable,
            existing: existingByMember.has(member.id)
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

export async function seedYearlyDues(fiscalYearId: string, user: string): Promise<SeedResult> {
    if (!isUuid(fiscalYearId)) {
        return { ok: false, error: "Ungültiges Geschäftsjahr.", created: 0, skipped: 0 };
    }

    const year = await getFiscalYear(fiscalYearId);
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
    const category = await getCategoryByName(KIND_DUES);

    let created = 0;

    for (const entry of fresh) {
        try {
            // Jede Forderung fuer sich: schlaegt eine fehl (etwa weil sie in
            // der Zwischenzeit von anderer Seite entstanden ist), laufen die
            // uebrigen weiter.
            await withTransaction((tx) =>
                createInvoice(
                    {
                        fiscalYearId,
                        memberId: entry.memberId,
                        member: entry.member,
                        kind: KIND_DUES,
                        categoryId: category?.id ?? null,
                        revenueAccountId: category?.accountId ?? null,
                        amount: entry.amount,
                        dueDate,
                        createdBy: user
                    },
                    tx
                )
            );
            created += 1;
        } catch (err: unknown) {
            // 23505 = der eindeutige Index hat eine Doppelanlage verhindert.
            if ((err as { code?: string })?.code !== "23505") {
                console.error("Beitrag konnte nicht angelegt werden:", entry.member, err);
            }
        }
    }

    return { ok: true, created, skipped: preview.entries.length - created };
}
