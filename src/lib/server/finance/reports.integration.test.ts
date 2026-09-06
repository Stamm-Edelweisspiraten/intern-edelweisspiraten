import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "$env/dynamic/private";

/**
 * Summen- und Saldenliste und Monatsübersicht gegen echte Buchungen.
 *
 * Die Proben, auf die es ankommt:
 *
 *   - Soll = Haben über alle Bewegungen (sonst ist ein Buchungssatz kaputt),
 *   - die Monatsübersicht summiert sich zur GuV desselben Zeitraums,
 *   - Erträge stehen positiv, obwohl sie im Haben gebucht werden.
 *
 * Übersprungen ohne DATABASE_URL.
 */

const ready = Boolean(env.DATABASE_URL);
const maybe = ready ? describe : describe.skip;

maybe("Kassenberichte", () => {
    const YEAR = 2087; // Weit weg vom Bestand, damit nichts hineinfunkt.

    let fiscalYearId = "";
    let bankAccountId = "";
    let donationAccountId = "";
    let materialAccountId = "";
    let bankLedgerId = "";

    beforeAll(async () => {
        const { db } = await import("$lib/server/db");
        const schema = await import("$lib/server/db/schema");
        const { ensureChartOfAccounts } = await import("./chartOfAccounts");
        const { createFiscalYear } = await import("./yearService");
        const { createBankAccount } = await import("./bankAccountService");
        const { postEntry } = await import("./journalService");
        const { eq, or } = await import("drizzle-orm");

        await ensureChartOfAccounts();

        const year = await createFiscalYear({
            year: YEAR,
            dues: { stamm: 3000, gau: 1200, landesmark: 900, bund: 1500 },
            createdBy: "test"
        });
        if (!year.year) throw new Error(`Geschäftsjahr: ${year.error ?? "?"}`);
        fiscalYearId = year.year.id;

        const created = await createBankAccount({
            name: `Testkonto ${YEAR}`,
            openingBalance: 0
        });
        if (!created.ok || !created.id) {
            throw new Error(`Bankkonto: ${created.error ?? "?"}`);
        }
        bankAccountId = created.id;

        const { getBankAccount } = await import("./bankAccountService");
        const bank = await getBankAccount(bankAccountId);
        // Das Sachkonto entsteht beim Anlegen mit; ohne es geht keine Buchung.
        bankLedgerId = bank!.accountId;

        const accountRows = await db
            .select({ id: schema.accounts.id, number: schema.accounts.number })
            .from(schema.accounts)
            .where(or(eq(schema.accounts.type, "income"), eq(schema.accounts.type, "expense")));

        const accountRowsWithType = await db
            .select({
                id: schema.accounts.id,
                number: schema.accounts.number,
                type: schema.accounts.type
            })
            .from(schema.accounts);

        // Irgendein Ertrags- und irgendein Aufwandskonto; die Nummern des
        // Kontenrahmens sind hier nicht die Aussage.
        const income = accountRowsWithType.find((row) => row.type === "income");
        const expense = accountRowsWithType.find((row) => row.type === "expense");
        donationAccountId = income!.id;
        materialAccountId = expense!.id;
        void accountRows;

        /**
         * Drei Buchungen in drei Monaten: zwei Erträge, ein Aufwand. Die
         * Zahlen sind so gewählt, dass jede Summe von Hand nachrechenbar ist.
         */
        const posted1 = await postEntry({
            date: new Date(Date.UTC(YEAR, 2, 15)),
            description: "Spende März",
            fiscalYearId,
            source: "manual",
            user: "test",
            lines: [
                { accountId: bankLedgerId, debit: 10_000, credit: 0 },
                { accountId: donationAccountId, debit: 0, credit: 10_000 }
            ]
        });
        if (!posted1.ok) throw new Error(`Buchung 1: ${posted1.error}`);

        const posted2 = await postEntry({
            date: new Date(Date.UTC(YEAR, 5, 1)),
            description: "Spende Juni",
            fiscalYearId,
            source: "manual",
            user: "test",
            lines: [
                { accountId: bankLedgerId, debit: 25_000, credit: 0 },
                { accountId: donationAccountId, debit: 0, credit: 25_000 }
            ]
        });
        if (!posted2.ok) throw new Error(`Buchung 2: ${posted2.error}`);

        const posted3 = await postEntry({
            date: new Date(Date.UTC(YEAR, 5, 20)),
            description: "Material Juni",
            fiscalYearId,
            source: "manual",
            user: "test",
            lines: [
                { accountId: materialAccountId, debit: 4_000, credit: 0 },
                { accountId: bankLedgerId, debit: 0, credit: 4_000 }
            ]
        });
        if (!posted3.ok) throw new Error(`Buchung 3: ${posted3.error}`);
    });

    afterAll(async () => {
        const { db } = await import("$lib/server/db");
        const schema = await import("$lib/server/db/schema");
        const { eq } = await import("drizzle-orm");

        // Die Zeilen hängen am Buchungssatz und fallen mit.
        await db.delete(schema.journalEntries).where(eq(schema.journalEntries.fiscalYearId, fiscalYearId));
        await db.delete(schema.bankAccounts).where(eq(schema.bankAccounts.id, bankAccountId));
        await db.delete(schema.fiscalYears).where(eq(schema.fiscalYears.id, fiscalYearId));
    });

    const from = new Date(Date.UTC(YEAR, 0, 1));
    const to = new Date(Date.UTC(YEAR, 11, 31));

    it("hält Soll und Haben in der Summen- und Saldenliste gleich", async () => {
        const { trialBalance } = await import("./reportService");
        const report = await trialBalance(from, to);

        expect(report.debitTotal).toBe(report.creditTotal);
        expect(report.balanced).toBe(true);
        // 10.000 + 25.000 + 4.000 auf jeder Seite.
        expect(report.debitTotal).toBe(39_000);
    });

    it("zeigt Erträge positiv, obwohl sie im Haben stehen", async () => {
        const { trialBalance } = await import("./reportService");
        const report = await trialBalance(from, to);

        const donation = report.rows.find((row) => row.accountId === donationAccountId);
        expect(donation?.credit).toBe(35_000);
        expect(donation?.closing).toBe(35_000);
    });

    it("führt Aufwendungen im Soll", async () => {
        const { trialBalance } = await import("./reportService");
        const report = await trialBalance(from, to);

        const material = report.rows.find((row) => row.accountId === materialAccountId);
        expect(material?.debit).toBe(4_000);
        expect(material?.closing).toBe(4_000);
    });

    it("summiert das Bankkonto richtig", async () => {
        const { trialBalance } = await import("./reportService");
        const report = await trialBalance(from, to);

        const bank = report.rows.find((row) => row.accountId === bankLedgerId);
        expect(bank?.debit).toBe(35_000);
        expect(bank?.credit).toBe(4_000);
        expect(bank?.closing).toBe(31_000);
    });

    it("lässt Konten ohne Bewegung und ohne Bestand weg", async () => {
        const { trialBalance } = await import("./reportService");
        const report = await trialBalance(from, to);

        for (const row of report.rows) {
            const touched = row.opening !== 0 || row.debit !== 0 || row.credit !== 0;
            expect(touched, `${row.number} ${row.name}`).toBe(true);
        }
    });

    it("trägt den Anfangsbestand ins Folgejahr vor", async () => {
        const { trialBalance } = await import("./reportService");

        const next = await trialBalance(
            new Date(Date.UTC(YEAR + 1, 0, 1)),
            new Date(Date.UTC(YEAR + 1, 11, 31))
        );

        const bank = next.rows.find((row) => row.accountId === bankLedgerId);
        expect(bank?.opening).toBe(31_000);
        // Im Folgejahr keine Bewegungen.
        expect(bank?.debit).toBe(0);
        expect(bank?.closing).toBe(31_000);
    });

    it("verteilt die Monatsübersicht auf die richtigen Monate", async () => {
        const { monthlyOverview } = await import("./reportService");
        const report = await monthlyOverview(YEAR);

        expect(report.months).toHaveLength(12);

        const march = report.months.find((month) => month.month === `${YEAR}-03`);
        expect(march?.income).toBe(10_000);
        expect(march?.expense).toBe(0);
        expect(march?.result).toBe(10_000);

        const june = report.months.find((month) => month.month === `${YEAR}-06`);
        expect(june?.income).toBe(25_000);
        expect(june?.expense).toBe(4_000);
        expect(june?.result).toBe(21_000);
    });

    it("liefert alle zwölf Monate, auch leere", async () => {
        const { monthlyOverview } = await import("./reportService");
        const report = await monthlyOverview(YEAR);

        const january = report.months.find((month) => month.month === `${YEAR}-01`);
        expect(january).toBeTruthy();
        expect(january?.income).toBe(0);
        expect(january?.result).toBe(0);
    });

    it("stimmt mit der GuV desselben Zeitraums überein", async () => {
        const { monthlyOverview, profitAndLoss } = await import("./reportService");

        const monthly = await monthlyOverview(YEAR);
        const guv = await profitAndLoss(from, to);

        expect(monthly.incomeTotal).toBe(guv.incomeTotal);
        expect(monthly.expenseTotal).toBe(guv.expenseTotal);
        expect(monthly.result).toBe(guv.result);
    });

    it("nennt die größten Aufwandskonten zuerst", async () => {
        const { topExpenses } = await import("./reportService");
        const rows = await topExpenses(from, to, 5);

        expect(rows.length).toBeGreaterThan(0);
        expect(rows[0].accountId).toBe(materialAccountId);

        for (let index = 1; index < rows.length; index += 1) {
            expect(rows[index - 1].amount).toBeGreaterThanOrEqual(rows[index].amount);
        }
    });
});
