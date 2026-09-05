import { and, asc, eq, gte, inArray, lte, ne, sql, type SQL } from "drizzle-orm";
import { db } from "$lib/server/db";
import { isUuid } from "$lib/server/db/ids";
import { todayCalendar } from "$lib/server/db/dates";
import { accounts, bankAccounts, invoices, journalEntries, journalLines } from "$lib/server/db/schema";
import type { Cents } from "$lib/money";
import { getAccount } from "./accountService";
import { getBankAccount } from "./bankAccountService";
import type {
    AccountLedgerReport,
    AccountSphere,
    AgingReport,
    BalanceSheetReport,
    CashBookReport,
    MonthlyReport,
    MonthlyRow,
    ProfitAndLossReport,
    ReportRow,
    TrialBalanceReport,
    TrialBalanceRow
} from "./types";

/**
 * Auswertungen.
 *
 * Bisher gab es genau eine: einen CSV-Export der Buchungen eines Jahres.
 * Alle Berichte hier lesen ausschliesslich aus den Buchungszeilen -- es gibt
 * keine zweite Wahrheit, die auseinanderlaufen koennte.
 *
 * Stornierte Buchungssaetze werden NICHT ausgeblendet: Storno und Original
 * heben sich in der Summe auf. Sie herauszufiltern waere falsch, weil dann
 * nur die Gegenbuchung stehenbliebe.
 */

/**
 * Tagesdatum als JJJJ-MM-TT.
 *
 * Alle Zeitraeume kommen als Kalendertage herein, also auf UTC-Mitternacht
 * normiert (siehe $lib/server/db/dates). Deshalb ist toISOString hier
 * richtig -- bei einem aus Ortszeit gebauten Datum waere es das nicht.
 */
function dateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Gewinn- und Verlustrechnung
// ---------------------------------------------------------------------------

export async function profitAndLoss(from: Date, to: Date): Promise<ProfitAndLossReport> {
    const rows = await db
        .select({
            accountId: accounts.id,
            number: accounts.number,
            name: accounts.name,
            type: accounts.type,
            sphere: accounts.sphere,
            debit: sql<string>`coalesce(sum(${journalLines.debit})::bigint, 0)`,
            credit: sql<string>`coalesce(sum(${journalLines.credit})::bigint, 0)`
        })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
        .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
        .where(
            and(
                inArray(accounts.type, ["income", "expense"]),
                gte(journalEntries.date, from),
                lte(journalEntries.date, to)
            )
        )
        .groupBy(accounts.id, accounts.number, accounts.name, accounts.type, accounts.sphere)
        .orderBy(asc(accounts.number));

    const income: ReportRow[] = [];
    const expense: ReportRow[] = [];
    const spheres = new Map<AccountSphere, { income: Cents; expense: Cents }>();

    for (const row of rows) {
        const debit = Number(row.debit);
        const credit = Number(row.credit);
        // Ertraege stehen im Haben, Aufwendungen im Soll.
        const amount = row.type === "income" ? credit - debit : debit - credit;
        if (amount === 0) continue;

        const entry: ReportRow = {
            accountId: row.accountId,
            number: row.number,
            name: row.name,
            sphere: row.sphere,
            amount
        };

        const bucket = spheres.get(row.sphere) ?? { income: 0, expense: 0 };
        if (row.type === "income") {
            income.push(entry);
            bucket.income += amount;
        } else {
            expense.push(entry);
            bucket.expense += amount;
        }
        spheres.set(row.sphere, bucket);
    }

    const incomeTotal = income.reduce((sum, row) => sum + row.amount, 0);
    const expenseTotal = expense.reduce((sum, row) => sum + row.amount, 0);

    return {
        from: dateOnly(from),
        to: dateOnly(to),
        income,
        expense,
        incomeTotal,
        expenseTotal,
        result: incomeTotal - expenseTotal,
        bySphere: Array.from(spheres.entries()).map(([sphere, value]) => ({
            sphere,
            income: value.income,
            expense: value.expense,
            result: value.income - value.expense
        }))
    };
}

// ---------------------------------------------------------------------------
// Bilanz / Vermoegensuebersicht
// ---------------------------------------------------------------------------

export async function balanceSheet(at: Date, from?: Date): Promise<BalanceSheetReport> {
    const rows = await db
        .select({
            accountId: accounts.id,
            number: accounts.number,
            name: accounts.name,
            type: accounts.type,
            sphere: accounts.sphere,
            debit: sql<string>`coalesce(sum(${journalLines.debit})::bigint, 0)`,
            credit: sql<string>`coalesce(sum(${journalLines.credit})::bigint, 0)`
        })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
        .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
        .where(
            and(
                inArray(accounts.type, ["asset", "liability", "equity"]),
                lte(journalEntries.date, at)
            )
        )
        .groupBy(accounts.id, accounts.number, accounts.name, accounts.type, accounts.sphere)
        .orderBy(asc(accounts.number));

    const assets: ReportRow[] = [];
    const liabilities: ReportRow[] = [];
    const equity: ReportRow[] = [];

    for (const row of rows) {
        const debit = Number(row.debit);
        const credit = Number(row.credit);
        // Aktiva im Soll, Passiva und Eigenkapital im Haben.
        const amount = row.type === "asset" ? debit - credit : credit - debit;
        if (amount === 0) continue;

        const entry: ReportRow = {
            accountId: row.accountId,
            number: row.number,
            name: row.name,
            sphere: row.sphere,
            amount
        };

        if (row.type === "asset") assets.push(entry);
        else if (row.type === "liability") liabilities.push(entry);
        else equity.push(entry);
    }

    // Das noch nicht auf das Eigenkapital gebuchte Ergebnis schliesst die
    // Bilanz rechnerisch: Aktiva = Passiva + Eigenkapital + Ergebnis.
    const periodStart = from ?? new Date(at.getFullYear(), 0, 1);
    const { result } = await profitAndLoss(periodStart, at);

    return {
        at: dateOnly(at),
        assets,
        liabilities,
        equity,
        assetsTotal: assets.reduce((sum, row) => sum + row.amount, 0),
        liabilitiesTotal: liabilities.reduce((sum, row) => sum + row.amount, 0),
        equityTotal: equity.reduce((sum, row) => sum + row.amount, 0),
        result
    };
}

// ---------------------------------------------------------------------------
// Kassenbericht
// ---------------------------------------------------------------------------

export async function cashBook(
    bankAccountId: string,
    from: Date,
    to: Date
): Promise<CashBookReport | null> {
    const bank = await getBankAccount(bankAccountId);
    if (!bank) return null;

    const opening = await accountBalanceBefore(bank.accountId, from);

    const rows = await db
        .select({
            date: journalEntries.date,
            entryNo: journalEntries.entryNo,
            description: journalEntries.description,
            entryId: journalEntries.id,
            debit: journalLines.debit,
            credit: journalLines.credit
        })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
        .where(
            and(
                eq(journalLines.accountId, bank.accountId),
                gte(journalEntries.date, from),
                lte(journalEntries.date, to)
            )
        )
        .orderBy(asc(journalEntries.date), asc(journalEntries.entryNo));

    const counterparts = await counterAccounts(rows.map((row) => row.entryId), bank.accountId);

    let balance = bank.openingBalance + opening;
    let incomeTotal = 0;
    let expenseTotal = 0;

    const entries = rows.map((row) => {
        balance += row.debit - row.credit;
        incomeTotal += row.debit;
        expenseTotal += row.credit;

        return {
            date: row.date.toISOString(),
            entryNo: row.entryNo,
            description: row.description,
            counterAccount: counterparts.get(row.entryId) ?? "",
            income: row.debit,
            expense: row.credit,
            balance
        };
    });

    return {
        bankAccountId: bank.id,
        bankAccountName: bank.name,
        from: dateOnly(from),
        to: dateOnly(to),
        openingBalance: bank.openingBalance + opening,
        closingBalance: balance,
        incomeTotal,
        expenseTotal,
        entries
    };
}

// ---------------------------------------------------------------------------
// Kontenblatt
// ---------------------------------------------------------------------------

export async function accountLedger(
    accountId: string,
    from: Date,
    to: Date
): Promise<AccountLedgerReport | null> {
    const account = await getAccount(accountId);
    if (!account) return null;

    const openingRaw = await accountBalanceBefore(accountId, from);
    // Vorzeichen nach Kontoart, damit die Spalte "Saldo" sich normal verhaelt.
    const sign = account.type === "asset" || account.type === "expense" ? 1 : -1;
    let balance = openingRaw * 1;

    const rows = await db
        .select({
            date: journalEntries.date,
            entryNo: journalEntries.entryNo,
            description: journalEntries.description,
            entryId: journalEntries.id,
            debit: journalLines.debit,
            credit: journalLines.credit
        })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
        .where(
            and(
                eq(journalLines.accountId, accountId),
                gte(journalEntries.date, from),
                lte(journalEntries.date, to)
            )
        )
        .orderBy(asc(journalEntries.date), asc(journalEntries.entryNo));

    const counterparts = await counterAccounts(rows.map((row) => row.entryId), accountId);

    const entries = rows.map((row) => {
        balance += row.debit - row.credit;
        return {
            date: row.date.toISOString(),
            entryNo: row.entryNo,
            description: row.description,
            counterAccount: counterparts.get(row.entryId) ?? "",
            debit: row.debit,
            credit: row.credit,
            balance: balance * sign
        };
    });

    return {
        account,
        from: dateOnly(from),
        to: dateOnly(to),
        openingBalance: openingRaw * sign,
        closingBalance: balance * sign,
        entries
    };
}

/** Soll minus Haben eines Kontos vor einem Stichtag. */
async function accountBalanceBefore(accountId: string, before: Date): Promise<Cents> {
    const [row] = await db
        .select({
            debit: sql<string>`coalesce(sum(${journalLines.debit})::bigint, 0)`,
            credit: sql<string>`coalesce(sum(${journalLines.credit})::bigint, 0)`
        })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
        .where(and(eq(journalLines.accountId, accountId), sql`${journalEntries.date} < ${dateOnly(before)}`));

    return Number(row?.debit ?? 0) - Number(row?.credit ?? 0);
}

/**
 * Gegenkonten je Buchungssatz -- die Spalte, die ein Kontenblatt lesbar
 * macht. Bei mehr als einem Gegenkonto steht dort "Sammelbuchung".
 */
async function counterAccounts(
    entryIds: string[],
    ownAccountId: string
): Promise<Map<string, string>> {
    const ids = Array.from(new Set(entryIds));
    if (ids.length === 0) return new Map();

    const rows = await db
        .select({
            entryId: journalLines.entryId,
            number: accounts.number,
            name: accounts.name
        })
        .from(journalLines)
        .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
        .where(and(inArray(journalLines.entryId, ids), ne(journalLines.accountId, ownAccountId)));

    const grouped = new Map<string, string[]>();
    for (const row of rows) {
        const list = grouped.get(row.entryId) ?? [];
        list.push(`${row.number} ${row.name}`);
        grouped.set(row.entryId, list);
    }

    return new Map(
        Array.from(grouped.entries()).map(([entryId, list]) => {
            const unique = Array.from(new Set(list));
            return [entryId, unique.length === 1 ? unique[0] : "Sammelbuchung"];
        })
    );
}

// ---------------------------------------------------------------------------
// Faelligkeitsstaffel
// ---------------------------------------------------------------------------

const AGING_BUCKETS = [
    { label: "Noch nicht fällig", fromDays: -1 },
    { label: "1 – 30 Tage", fromDays: 1 },
    { label: "31 – 60 Tage", fromDays: 31 },
    { label: "61 – 90 Tage", fromDays: 61 },
    { label: "Über 90 Tage", fromDays: 91 }
];

export async function agingReport(options: { fiscalYearIds?: string[] } = {}): Promise<AgingReport> {
    const conditions: SQL[] = [inArray(invoices.status, ["open", "partial"])];
    const years = (options.fiscalYearIds ?? []).filter(isUuid);
    if (years.length > 0) conditions.push(inArray(invoices.fiscalYearId, years));

    const rows = await db
        .select({
            amount: invoices.amount,
            paidAmount: invoices.paidAmount,
            dueDate: invoices.dueDate
        })
        .from(invoices)
        .where(and(...conditions));

    const today = todayCalendar();
    const buckets = AGING_BUCKETS.map((bucket) => ({ ...bucket, amount: 0, count: 0 }));

    for (const row of rows) {
        const outstanding = Math.max(0, row.amount - row.paidAmount);
        if (outstanding === 0) continue;

        const overdueDays = row.dueDate
            ? Math.floor((today.getTime() - row.dueDate.getTime()) / (24 * 60 * 60 * 1000))
            : -1;

        // Von hinten suchen: der letzte passende Bereich gewinnt.
        let index = 0;
        for (let i = buckets.length - 1; i >= 0; i--) {
            if (overdueDays >= buckets[i].fromDays) {
                index = i;
                break;
            }
        }
        if (overdueDays <= 0) index = 0;

        buckets[index].amount += outstanding;
        buckets[index].count += 1;
    }

    return {
        at: dateOnly(today),
        buckets,
        total: buckets.reduce((sum, bucket) => sum + bucket.amount, 0),
        count: buckets.reduce((sum, bucket) => sum + bucket.count, 0)
    };
}

// ---------------------------------------------------------------------------
// Salden aller Bankkonten -- fuer Kacheln
// ---------------------------------------------------------------------------

export async function bankBalances(): Promise<{ id: string; name: string; balance: Cents }[]> {
    const rows = await db
        .select({
            id: bankAccounts.id,
            name: bankAccounts.name,
            openingBalance: bankAccounts.openingBalance,
            debit: sql<string>`coalesce(sum(${journalLines.debit})::bigint, 0)`,
            credit: sql<string>`coalesce(sum(${journalLines.credit})::bigint, 0)`
        })
        .from(bankAccounts)
        .leftJoin(journalLines, eq(journalLines.accountId, bankAccounts.accountId))
        .where(eq(bankAccounts.active, true))
        .groupBy(bankAccounts.id, bankAccounts.name, bankAccounts.openingBalance, bankAccounts.sortOrder)
        .orderBy(asc(bankAccounts.sortOrder));

    return rows.map((row) => ({
        id: row.id,
        name: row.name,
        balance: row.openingBalance + Number(row.debit) - Number(row.credit)
    }));
}

// ---------------------------------------------------------------------------
// Summen- und Saldenliste
// ---------------------------------------------------------------------------

/**
 * Je Konto: Anfangsbestand, Bewegungen im Zeitraum, Schlusssaldo.
 *
 * Die klassische Kontrolluebersicht einer Buchhaltung. Sie beantwortet in
 * einem Blick, was die GuV und die Bilanz jeweils nur zur Haelfte zeigen --
 * und sie ist die Probe: die Summe der Soll-Bewegungen MUSS der Summe der
 * Haben-Bewegungen entsprechen. Weicht sie ab, ist ein Buchungssatz kaputt.
 *
 * Zwei Abfragen statt einer je Konto: eine fuer alles VOR dem Zeitraum, eine
 * fuer alles DARIN. Bei einem Kontenrahmen mit gut hundert Konten waeren
 * hundert Einzelabfragen die naheliegende, aber falsche Loesung.
 */
export async function trialBalance(from: Date, to: Date): Promise<TrialBalanceReport> {
    /**
     * Drei Abfragen: die Konten, die Summen VOR dem Zeitraum, die Summen
     * DARIN. Zusammengefuehrt wird im Speicher.
     *
     * Der naheliegende Weg -- ein LEFT JOIN von accounts auf die Zeilen mit
     * dem Zeitraum in der JOIN-Bedingung -- war falsch: ein Konto mit
     * Anfangsbestand, aber ohne Bewegung im Zeitraum fiel dabei ganz aus der
     * Liste. Genau dieses Konto muss eine Summen- und Saldenliste aber
     * zeigen, sonst fehlt der Vortrag.
     */
    const [accountRows, openingRows, periodRows] = await Promise.all([
        db
            .select({
                id: accounts.id,
                number: accounts.number,
                name: accounts.name,
                type: accounts.type,
                sphere: accounts.sphere
            })
            .from(accounts)
            .orderBy(asc(accounts.number)),

        db
            .select({
                accountId: journalLines.accountId,
                debit: sql<string>`coalesce(sum(${journalLines.debit})::bigint, 0)`,
                credit: sql<string>`coalesce(sum(${journalLines.credit})::bigint, 0)`
            })
            .from(journalLines)
            .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
            .where(sql`${journalEntries.date} < ${dateOnly(from)}`)
            .groupBy(journalLines.accountId),

        db
            .select({
                accountId: journalLines.accountId,
                debit: sql<string>`coalesce(sum(${journalLines.debit})::bigint, 0)`,
                credit: sql<string>`coalesce(sum(${journalLines.credit})::bigint, 0)`
            })
            .from(journalLines)
            .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
            .where(and(gte(journalEntries.date, from), lte(journalEntries.date, to)))
            .groupBy(journalLines.accountId)
    ]);

    const openingByAccount = new Map<string, number>();
    for (const row of openingRows) {
        openingByAccount.set(row.accountId, Number(row.debit) - Number(row.credit));
    }

    const periodByAccount = new Map<string, { debit: number; credit: number }>();
    for (const row of periodRows) {
        periodByAccount.set(row.accountId, {
            debit: Number(row.debit),
            credit: Number(row.credit)
        });
    }

    const rows: TrialBalanceRow[] = [];
    let debitTotal = 0;
    let creditTotal = 0;

    for (const account of accountRows) {
        const movement = periodByAccount.get(account.id) ?? { debit: 0, credit: 0 };
        const openingRaw = openingByAccount.get(account.id) ?? 0;

        /**
         * Vorzeichen nach Kontoart: Aktiva und Aufwendungen wachsen im Soll,
         * Passiva, Eigenkapital und Ertraege im Haben. Ohne diese Umkehr
         * stuenden die Ertraege negativ in der Liste.
         */
        const sign = account.type === "asset" || account.type === "expense" ? 1 : -1;

        /**
         * Erfolgskonten tragen KEINEN Anfangsbestand.
         *
         * Ertraege und Aufwendungen beginnen jede Periode bei null -- genau
         * dafuer wird ein Geschaeftsjahr abgeschlossen. Wuerde man ihren
         * Saldo vortragen, stuende im Kontenblatt des laufenden Jahres die
         * Spende des Vorjahres mit drin und die Liste waere wertlos.
         *
         * Bestandskonten (Aktiva, Passiva, Eigenkapital) tragen ihn dagegen
         * vor -- ohne den Vortrag stimmte die Bilanz nicht.
         */
        const isResultAccount = account.type === "income" || account.type === "expense";

        const opening = isResultAccount ? 0 : openingRaw * sign;
        const closing = isResultAccount
            ? (movement.debit - movement.credit) * sign
            : (openingRaw + movement.debit - movement.credit) * sign;

        debitTotal += movement.debit;
        creditTotal += movement.credit;

        // Konten ohne Bestand und ohne Bewegung wuerden die Liste nur
        // aufblaehen -- ein Kontenrahmen hat mehr Konten als ein Stamm nutzt.
        if (opening === 0 && movement.debit === 0 && movement.credit === 0) continue;

        rows.push({
            accountId: account.id,
            number: account.number,
            name: account.name,
            type: account.type,
            sphere: account.sphere,
            opening,
            debit: movement.debit,
            credit: movement.credit,
            closing
        });
    }

    return {
        from: dateOnly(from),
        to: dateOnly(to),
        rows,
        debitTotal,
        creditTotal,
        balanced: debitTotal === creditTotal
    };
}

// ---------------------------------------------------------------------------
// Monatsuebersicht
// ---------------------------------------------------------------------------

const MONTH_LABELS = [
    "Januar",
    "Februar",
    "März",
    "April",
    "Mai",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "Dezember"
];

/**
 * Ertraege, Aufwendungen und Ergebnis je Monat eines Jahres.
 *
 * Grundlage des Balkendiagramms auf der Uebersicht -- und fuer sich genommen
 * schon nuetzlich: die GuV zeigt das Jahr als eine Zahl, hier sieht man, dass
 * im Juli das Lager bezahlt wurde.
 *
 * ALLE zwoelf Monate stehen in der Liste, auch leere. Ein Diagramm mit
 * Luecken taeuscht sonst einen Verlauf vor, den es nicht gibt.
 */
export async function monthlyOverview(year: number): Promise<MonthlyReport> {
    const from = new Date(Date.UTC(year, 0, 1));
    const to = new Date(Date.UTC(year, 11, 31));

    const rows = await db
        .select({
            month: sql<string>`to_char(${journalEntries.date}, 'YYYY-MM')`,
            type: accounts.type,
            debit: sql<string>`coalesce(sum(${journalLines.debit})::bigint, 0)`,
            credit: sql<string>`coalesce(sum(${journalLines.credit})::bigint, 0)`
        })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
        .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
        .where(
            and(
                inArray(accounts.type, ["income", "expense"]),
                gte(journalEntries.date, from),
                lte(journalEntries.date, to)
            )
        )
        .groupBy(sql`to_char(${journalEntries.date}, 'YYYY-MM')`, accounts.type);

    const months: MonthlyRow[] = Array.from({ length: 12 }, (_, index) => ({
        month: `${year}-${String(index + 1).padStart(2, "0")}`,
        label: MONTH_LABELS[index],
        income: 0,
        expense: 0,
        result: 0
    }));

    const byMonth = new Map(months.map((entry) => [entry.month, entry]));

    for (const row of rows) {
        const entry = byMonth.get(row.month);
        if (!entry) continue;

        const debit = Number(row.debit);
        const credit = Number(row.credit);

        // Ertraege stehen im Haben, Aufwendungen im Soll.
        if (row.type === "income") entry.income += credit - debit;
        else entry.expense += debit - credit;
    }

    for (const entry of months) entry.result = entry.income - entry.expense;

    const incomeTotal = months.reduce((sum, entry) => sum + entry.income, 0);
    const expenseTotal = months.reduce((sum, entry) => sum + entry.expense, 0);

    return {
        year,
        months,
        incomeTotal,
        expenseTotal,
        result: incomeTotal - expenseTotal
    };
}

/**
 * Die groessten Aufwandskonten eines Zeitraums.
 *
 * Fuer das waagerechte Balkendiagramm. Bewusst eine eigene Funktion statt
 * eines Aufrufs von profitAndLoss mit anschliessendem slice(): die Grenze
 * gehoert in die Abfrage, nicht in die Seite.
 */
export async function topExpenses(
    from: Date,
    to: Date,
    limit = 10
): Promise<ReportRow[]> {
    const report = await profitAndLoss(from, to);
    return [...report.expense].sort((a, b) => b.amount - a.amount).slice(0, limit);
}
