import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "$lib/server/db";
import { isUuid } from "$lib/server/db/ids";
import { toCalendarDate, todayCalendar } from "$lib/server/db/dates";
import { bankAccounts, bookingCategories, recurringSchedules } from "$lib/server/db/schema";
import type { Cents } from "$lib/money";
import { createTransaction } from "./transactionService";
import { getActiveFiscalYear } from "./yearService";
import type { TransactionDirection } from "./types";

/**
 * Wiederkehrende Buchungen.
 *
 * Vorlagen mit Takt und naechstem Faelligkeitstermin. runDueSchedules() wird
 * beim Start aufgerufen und kann zusaetzlich ueber die REST-API angestossen
 * werden, damit ein Cron von aussen die Ausfuehrung erzwingen kann -- ein
 * Portal, das nur beim Start bucht, verpasst sonst jeden Termin, an dem
 * niemand neu startet.
 */

export type RecurringInterval = "monthly" | "quarterly" | "semiannual" | "annual";

export const INTERVAL_LABELS: Record<RecurringInterval, string> = {
    monthly: "monatlich",
    quarterly: "vierteljährlich",
    semiannual: "halbjährlich",
    annual: "jährlich"
};

const INTERVAL_MONTHS: Record<RecurringInterval, number> = {
    monthly: 1,
    quarterly: 3,
    semiannual: 6,
    annual: 12
};

export interface RecurringView {
    id: string;
    name: string;
    interval: RecurringInterval;
    intervalLabel: string;
    amount: Cents;
    direction: TransactionDirection;
    categoryId: string;
    categoryName: string;
    bankAccountId: string;
    bankAccountName: string;
    memberId: string | null;
    note: string;
    startDate: string;
    endDate: string | null;
    nextRunAt: string;
    lastRunAt: string | null;
    runCount: number;
    active: boolean;
}

export async function listRecurring(): Promise<RecurringView[]> {
    const rows = await db
        .select({
            schedule: recurringSchedules,
            categoryName: bookingCategories.name,
            direction: bookingCategories.direction,
            bankName: bankAccounts.name
        })
        .from(recurringSchedules)
        .innerJoin(bookingCategories, eq(bookingCategories.id, recurringSchedules.categoryId))
        .innerJoin(bankAccounts, eq(bankAccounts.id, recurringSchedules.bankAccountId))
        .orderBy(asc(recurringSchedules.nextRunAt));

    return rows.map(({ schedule, categoryName, direction, bankName }) => ({
        id: schedule.id,
        name: schedule.name,
        interval: schedule.interval,
        intervalLabel: INTERVAL_LABELS[schedule.interval],
        amount: schedule.amount,
        direction: direction as TransactionDirection,
        categoryId: schedule.categoryId,
        categoryName,
        bankAccountId: schedule.bankAccountId,
        bankAccountName: bankName,
        memberId: schedule.memberId,
        note: schedule.note,
        startDate: schedule.startDate.toISOString(),
        endDate: schedule.endDate?.toISOString() ?? null,
        nextRunAt: schedule.nextRunAt.toISOString(),
        lastRunAt: schedule.lastRunAt?.toISOString() ?? null,
        runCount: schedule.runCount,
        active: schedule.active
    }));
}

export interface RecurringInput {
    name: string;
    interval: RecurringInterval;
    amount: Cents;
    categoryId: string;
    bankAccountId: string;
    memberId?: string | null;
    note?: string;
    startDate: Date;
    endDate?: Date | null;
    user: string;
}

export async function createRecurring(
    input: RecurringInput
): Promise<{ ok: boolean; error?: string; id?: string }> {
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
        return { ok: false, error: "Bitte einen Betrag größer als 0 angeben." };
    }
    if (!isUuid(input.categoryId)) return { ok: false, error: "Bitte eine Buchungsart auswählen." };
    if (!isUuid(input.bankAccountId)) return { ok: false, error: "Bitte ein Konto auswählen." };
    if (!input.name.trim()) return { ok: false, error: "Bitte eine Bezeichnung angeben." };

    const [row] = await db
        .insert(recurringSchedules)
        .values({
            name: input.name.trim(),
            interval: input.interval,
            amount: input.amount,
            categoryId: input.categoryId,
            bankAccountId: input.bankAccountId,
            memberId: isUuid(input.memberId) ? input.memberId : null,
            note: input.note ?? "",
            startDate: toCalendarDate(input.startDate),
            endDate: input.endDate ? toCalendarDate(input.endDate) : null,
            nextRunAt: toCalendarDate(input.startDate),
            createdBy: input.user
        })
        .returning({ id: recurringSchedules.id });

    return { ok: true, id: row.id };
}

export async function setRecurringActive(id: string, active: boolean): Promise<boolean> {
    if (!isUuid(id)) return false;
    const rows = await db
        .update(recurringSchedules)
        .set({ active })
        .where(eq(recurringSchedules.id, id))
        .returning({ id: recurringSchedules.id });
    return rows.length > 0;
}

export async function deleteRecurring(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    const rows = await db
        .delete(recurringSchedules)
        .where(eq(recurringSchedules.id, id))
        .returning({ id: recurringSchedules.id });
    return rows.length > 0;
}

/** Naechster Termin. Gerechnet wird in UTC, damit kein Tag verrutscht. */
function advance(date: Date, interval: RecurringInterval): Date {
    const next = new Date(date);
    next.setUTCMonth(next.getUTCMonth() + INTERVAL_MONTHS[interval]);
    return next;
}

export interface RunResult {
    executed: number;
    skipped: number;
    errors: string[];
}

/**
 * Fuehrt alle faelligen Vorlagen aus.
 *
 * Holt Termine nach, die waehrend eines Stillstands verstrichen sind -- aber
 * nur solche, die ins aktive Geschaeftsjahr fallen. Ein Nachbuchen in ein
 * abgeschlossenes Jahr wuerde ohnehin am Trigger scheitern.
 */
export async function runDueSchedules(user = "system"): Promise<RunResult> {
    const year = await getActiveFiscalYear();
    if (!year) return { executed: 0, skipped: 0, errors: ["Kein aktives Geschäftsjahr."] };

    const today = todayCalendar();

    const due = await db
        .select()
        .from(recurringSchedules)
        .where(and(eq(recurringSchedules.active, true), lte(recurringSchedules.nextRunAt, today)));

    const result: RunResult = { executed: 0, skipped: 0, errors: [] };

    for (const schedule of due) {
        let cursor = new Date(schedule.nextRunAt);
        let runs = 0;

        // Hoechstens 24 Nachholtermine je Vorlage und Durchlauf -- ein
        // fehlerhaft weit zurueckliegendes Startdatum soll den Start nicht
        // in eine Endlosschleife schicken.
        while (cursor <= today && runs < 24) {
            if (schedule.endDate && cursor > schedule.endDate) break;

            if (cursor.getUTCFullYear() !== year.year) {
                cursor = advance(cursor, schedule.interval);
                result.skipped += 1;
                continue;
            }

            const posted = await createTransaction({
                fiscalYearId: year.id,
                categoryId: schedule.categoryId,
                bankAccountId: schedule.bankAccountId,
                memberId: schedule.memberId,
                date: new Date(cursor),
                amount: schedule.amount,
                source: "recurring",
                note: schedule.note || schedule.name,
                user
            });

            if (posted.ok) {
                result.executed += 1;
                runs += 1;
            } else {
                result.errors.push(`${schedule.name}: ${posted.error}`);
                break;
            }

            cursor = advance(cursor, schedule.interval);
        }

        const finished = schedule.endDate !== null && cursor > schedule.endDate;

        await db
            .update(recurringSchedules)
            .set({
                nextRunAt: cursor,
                lastRunAt: runs > 0 ? new Date() : schedule.lastRunAt,
                runCount: schedule.runCount + runs,
                active: finished ? false : schedule.active
            })
            .where(eq(recurringSchedules.id, schedule.id));
    }

    return result;
}
