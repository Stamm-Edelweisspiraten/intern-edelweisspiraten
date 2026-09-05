import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "$env/dynamic/private";

/**
 * Die Demodaten wirklich anlegen.
 *
 * Sie sind der erste Eindruck eines neuen Stamms und laufen bei der
 * Ersteinrichtung durch ein gutes Dutzend Dienste. Bricht einer davon, merkt
 * das sonst niemand -- bis jemand /setup benutzt.
 *
 * Der Test braucht zweierlei: eine Datenbank UND eine ausdrueckliche
 * Freigabe. Er raeumt hinterher vollstaendig ab; gegen die Arbeitsdatenbank
 * eines Entwicklers waere das ein Datenverlust. Deshalb laeuft er nur mit
 * DEMO_SEED_TEST=1, gedacht fuer einen frischen Container:
 *
 *   docker run -d --name pg-test -p 5433:5432 -e POSTGRES_USER=intern
 *     -e POSTGRES_PASSWORD=intern -e POSTGRES_DB=intern postgres:17-alpine
 *   DATABASE_URL=postgres://intern:intern@localhost:5433/intern npm run db:migrate
 *   DEMO_SEED_TEST=1 DATABASE_URL=... npx vitest run seed/demo.integration
 */
const ready = Boolean(env.DATABASE_URL) && env.DEMO_SEED_TEST === "1";
const maybe = ready ? describe : describe.skip;

maybe("Demodaten", () => {
    let hadData = false;

    beforeAll(async () => {
        const { db } = await import("$lib/server/db");
        const { members } = await import("$lib/server/db/schema");
        const rows = await db.select({ id: members.id }).from(members).limit(1);
        hadData = rows.length > 0;
    });

    afterAll(async () => {
        if (hadData) return;

        // Alles wieder abräumen, was der Lauf angelegt hat.
        const { db } = await import("$lib/server/db");
        const schema = await import("$lib/server/db/schema");

        await db.delete(schema.events);
        await db.delete(schema.folders);
        await db.delete(schema.orders);
        await db.delete(schema.articles);
        await db.delete(schema.journalEntries);
        await db.delete(schema.invoices);
        await db.delete(schema.bills);
        await db.delete(schema.bankAccounts);
        await db.delete(schema.fiscalYears);
        await db.delete(schema.positions);
        await db.delete(schema.members);
        await db.delete(schema.groups);
    });

    it("legt Gruppen, Mitglieder, Ordner und Termine an", async () => {
        if (hadData) {
            // Eine gefüllte Datenbank wird nicht angetastet -- genau das ist
            // die Schutzregel von seedDemoData.
            const { seedDemoData } = await import("./demo");
            const result = await seedDemoData("test");
            expect(result.skipped).toBe(true);
            return;
        }

        const { ensureDefaultRoles } = await import("$lib/server/roleService");
        await ensureDefaultRoles();

        const { seedDemoData } = await import("./demo");
        const result = await seedDemoData("test");

        expect(result.skipped).toBe(false);
        expect(result.groups).toBe(2);
        expect(result.members).toBeGreaterThan(0);
        expect(result.folders).toBe(2);
        expect(result.events).toBe(3);
        expect(result.transactions).toBeGreaterThan(0);
    });

    it("gibt das Amt der Meutenführung die Rolle Gruppenleitung", async () => {
        if (hadData) return;

        const { getAllPositions } = await import("$lib/server/positionService");
        const { getRoleByKey, SYSTEM_ROLE_KEYS } = await import("$lib/server/roleService");

        const leaderRole = await getRoleByKey(SYSTEM_ROLE_KEYS.groupLeader);
        const positions = await getAllPositions();
        const leadership = positions.find((entry) => entry.type === "gruppenleiter");

        expect(leadership).toBeTruthy();
        // Ohne Rolle trüge das Amt keine Rechte -- der Sinn der Demodaten wäre
        // dahin, weil sich der Gruppenbezug nicht vorführen ließe.
        expect(leadership?.roleId).toBe(leaderRole?.id);
        expect(leadership?.groupId).toBeTruthy();
    });

    it("gibt einen Ordner nur für die Meute frei", async () => {
        if (hadData) return;

        const { db } = await import("$lib/server/db");
        const { folders, folderShares } = await import("$lib/server/db/schema");
        const { eq } = await import("drizzle-orm");

        const [folder] = await db
            .select({ id: folders.id })
            .from(folders)
            .where(eq(folders.name, "Meute Wildkatzen"));

        expect(folder).toBeTruthy();

        const shares = await db
            .select()
            .from(folderShares)
            .where(eq(folderShares.folderId, folder.id));

        expect(shares).toHaveLength(1);
        expect(shares[0].targetKind).toBe("group");
        expect(shares[0].canWrite).toBe(true);
    });

    it("legt Rückmeldungen zum Sommerlager an", async () => {
        if (hadData) return;

        const { db } = await import("$lib/server/db");
        const { events } = await import("$lib/server/db/schema");
        const { eq } = await import("drizzle-orm");
        const { listResponses } = await import("$lib/server/eventService");

        const [camp] = await db
            .select({ id: events.id })
            .from(events)
            .where(eq(events.title, "Sommerlager"));

        expect(camp).toBeTruthy();

        const responses = await listResponses(camp.id);
        expect(responses).toHaveLength(3);
        expect(responses.filter((entry) => entry.response === "yes")).toHaveLength(2);
        expect(responses.filter((entry) => entry.response === "no")).toHaveLength(1);
    });
});
