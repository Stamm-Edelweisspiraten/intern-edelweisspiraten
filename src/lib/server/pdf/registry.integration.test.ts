import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "$env/dynamic/private";

/**
 * Erzeugt jede Vorlage einmal wirklich.
 *
 * Der Wert liegt darin, dass pdfkit erst beim Zeichnen merkt, wenn etwas
 * fehlt -- eine Spaltenbreite von null, ein Bild in einem Format, das es
 * nicht kennt, eine Tabelle ohne Zeilen. Ein Schema-Test findet davon nichts.
 *
 * Übersprungen ohne DATABASE_URL.
 */

const ready = Boolean(env.DATABASE_URL);
const maybe = ready ? describe : describe.skip;

/** Ein PDF beginnt mit %PDF- und endet mit %%EOF. */
function looksLikePdf(buffer: Buffer): boolean {
    if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") return false;
    return buffer.subarray(-1024).toString("latin1").includes("%%EOF");
}

maybe("PDF-Erzeugung", () => {
    const PREFIX = "ptest-";

    let memberId = "";
    let groupId = "";
    let eventId = "";
    let userId = "";

    beforeAll(async () => {
        const { db } = await import("$lib/server/db");
        const schema = await import("$lib/server/db/schema");
        const { createEvent, respond } = await import("$lib/server/eventService");

        const [group] = await db
            .insert(schema.groups)
            .values({ name: `${PREFIX}Meute`, type: "meute", description: "Testgruppe" })
            .returning({ id: schema.groups.id });
        groupId = group.id;

        const [member] = await db
            .insert(schema.members)
            .values({
                firstname: "Ptest",
                lastname: "Person",
                fahrtenname: "Fuchs",
                birthday: "2012-05-10",
                street: "Musterweg 1",
                zip: "12345",
                city: "Musterstadt",
                stand: "Jungpfadfinder"
            })
            .returning({ id: schema.members.id });
        memberId = member.id;
        await db.insert(schema.memberGroups).values({ memberId, groupId });
        await db
            .insert(schema.memberEmails)
            .values({ memberId, label: "Eltern", email: "ptest@example.org" });
        await db
            .insert(schema.memberPhones)
            .values({ memberId, label: "Mobil", number: "0170 1234567" });

        const [user] = await db
            .insert(schema.users)
            .values({ name: "Ptest", email: `${PREFIX}a@example.org`, passwordHash: "" })
            .returning({ id: schema.users.id });
        userId = user.id;

        const result = await createEvent(
            {
                title: `${PREFIX}Sommerlager`,
                description: "Zelten am See.",
                location: "Zeltplatz Musterheide",
                startsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            },
            userId
        );
        eventId = result.id!;
        await respond({ eventId, memberId, response: "yes", note: "kommt", respondedBy: userId });
    });

    afterAll(async () => {
        const { db } = await import("$lib/server/db");
        const schema = await import("$lib/server/db/schema");
        const { like, eq } = await import("drizzle-orm");

        await db.delete(schema.events).where(like(schema.events.title, `${PREFIX}%`));
        await db.delete(schema.users).where(like(schema.users.email, `${PREFIX}%`));
        await db.delete(schema.members).where(eq(schema.members.firstname, "Ptest"));
        await db.delete(schema.groups).where(like(schema.groups.name, `${PREFIX}%`));
    });

    it("erzeugt ein Einladungsschreiben", async () => {
        const { renderPdf } = await import("./registry");
        const result = await renderPdf("invite", { memberId });
        expect(looksLikePdf(result.buffer)).toBe(true);
        expect(result.filename).toMatch(/\.pdf$/);
    });

    it("erzeugt die Gruppen-Mitgliederliste", async () => {
        const { renderPdf } = await import("./registry");
        const result = await renderPdf("group-members", { groupId });
        expect(looksLikePdf(result.buffer)).toBe(true);
    });

    it("erzeugt die Mitgliederliste, mit und ohne Kontaktdaten", async () => {
        const { renderPdf } = await import("./registry");

        const plain = await renderPdf("member-list", {});
        expect(looksLikePdf(plain.buffer)).toBe(true);

        const withContact = await renderPdf("member-list", {
            groupIds: [groupId],
            includeContact: true
        });
        expect(looksLikePdf(withContact.buffer)).toBe(true);
    });

    it("erzeugt die Termin-Teilnehmerliste", async () => {
        const { renderPdf } = await import("./registry");
        const result = await renderPdf("event-attendees", { eventId });
        expect(looksLikePdf(result.buffer)).toBe(true);
    });

    it("erzeugt jede Art des Kassenberichts, die ohne Konto auskommt", async () => {
        const { renderPdf } = await import("./registry");

        for (const kind of ["guv", "bilanz", "offene-posten"]) {
            const result = await renderPdf("finance-report", {
                kind,
                from: "2026-01-01",
                to: "2026-12-31"
            });
            expect(looksLikePdf(result.buffer), kind).toBe(true);
        }
    });

    it("meldet ein fehlendes Konto beim Kassenbericht", async () => {
        const { renderPdf, PdfNotFoundError } = await import("./registry");
        await expect(renderPdf("finance-report", { kind: "kassenbericht" })).rejects.toBeInstanceOf(
            PdfNotFoundError
        );
    });

    it("meldet eine unbekannte Vorlage", async () => {
        const { renderPdf, PdfNotFoundError } = await import("./registry");
        await expect(renderPdf("gibt-es-nicht", {})).rejects.toBeInstanceOf(PdfNotFoundError);
    });

    it("meldet ein unbekanntes Mitglied statt ein leeres PDF zu liefern", async () => {
        const { renderPdf, PdfNotFoundError } = await import("./registry");
        await expect(
            renderPdf("invite", { memberId: "11111111-1111-4111-8111-111111111111" })
        ).rejects.toBeInstanceOf(PdfNotFoundError);
    });

    it("bricht eine lange Tabelle auf mehrere Seiten um", async () => {
        const { db } = await import("$lib/server/db");
        const schema = await import("$lib/server/db/schema");
        const { renderPdf } = await import("./registry");

        // Genug Zeilen, dass eine Seite nicht reicht.
        const rows = Array.from({ length: 60 }, (_, index) => ({
            firstname: "Ptest",
            lastname: `Viele ${String(index).padStart(2, "0")}`,
            birthday: "2010-01-01"
        }));
        const created = await db
            .insert(schema.members)
            .values(rows)
            .returning({ id: schema.members.id });

        await db
            .insert(schema.memberGroups)
            .values(created.map((row) => ({ memberId: row.id, groupId })));

        const result = await renderPdf("group-members", { groupId });
        expect(looksLikePdf(result.buffer)).toBe(true);

        // Mehr als eine Seite: das Seitenobjekt taucht mehrfach auf.
        const text = result.buffer.toString("latin1");
        const pages = (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
        expect(pages).toBeGreaterThan(1);
    });
});
