import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "$env/dynamic/private";

/**
 * Termine gegen eine echte Datenbank: Sichtbarkeit, Rückmeldung und Frist.
 *
 * Übersprungen ohne DATABASE_URL.
 */

const ready = Boolean(env.DATABASE_URL);
const maybe = ready ? describe : describe.skip;

maybe("Termine", () => {
    const PREFIX = "etest-";

    let meuteId = "";
    let sippeId = "";
    let memberId = "";
    let userId = "";
    let outsiderId = "";
    let outsiderMemberId = "";

    let openId = "";
    let meuteOnlyId = "";
    let draftId = "";
    let pastId = "";

    beforeAll(async () => {
        const { db } = await import("$lib/server/db");
        const schema = await import("$lib/server/db/schema");
        const { createEvent, setEventShares } = await import("$lib/server/eventService");

        const [meute] = await db
            .insert(schema.groups)
            .values({ name: `${PREFIX}Meute`, type: "meute" })
            .returning({ id: schema.groups.id });
        meuteId = meute.id;

        const [sippe] = await db
            .insert(schema.groups)
            .values({ name: `${PREFIX}Sippe`, type: "sippe" })
            .returning({ id: schema.groups.id });
        sippeId = sippe.id;

        const [member] = await db
            .insert(schema.members)
            .values({ firstname: "Etest", lastname: "Kind" })
            .returning({ id: schema.members.id });
        memberId = member.id;
        await db.insert(schema.memberGroups).values({ memberId, groupId: meuteId });

        const [other] = await db
            .insert(schema.members)
            .values({ firstname: "Etest", lastname: "Fremd" })
            .returning({ id: schema.members.id });
        outsiderMemberId = other.id;
        await db
            .insert(schema.memberGroups)
            .values({ memberId: outsiderMemberId, groupId: sippeId });

        const [user] = await db
            .insert(schema.users)
            .values({ name: "Etest", email: `${PREFIX}a@example.org`, passwordHash: "" })
            .returning({ id: schema.users.id });
        userId = user.id;
        await db.insert(schema.userMembers).values({ userId, memberId });

        const [outsider] = await db
            .insert(schema.users)
            .values({ name: "Fremd", email: `${PREFIX}b@example.org`, passwordHash: "" })
            .returning({ id: schema.users.id });
        outsiderId = outsider.id;
        await db
            .insert(schema.userMembers)
            .values({ userId: outsiderId, memberId: outsiderMemberId });

        const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const open = await createEvent({ title: `${PREFIX}Offen`, startsAt: future }, userId);
        openId = open.id!;

        const meuteOnly = await createEvent(
            { title: `${PREFIX}Nur Meute`, startsAt: future },
            userId
        );
        meuteOnlyId = meuteOnly.id!;
        await setEventShares(meuteOnlyId, [{ targetKind: "group", targetId: meuteId }]);

        const draft = await createEvent(
            { title: `${PREFIX}Entwurf`, startsAt: future, status: "draft" },
            userId
        );
        draftId = draft.id!;

        const passed = await createEvent({ title: `${PREFIX}Vorbei`, startsAt: past }, userId);
        pastId = passed.id!;
    });

    afterAll(async () => {
        const { db } = await import("$lib/server/db");
        const schema = await import("$lib/server/db/schema");
        const { like, eq } = await import("drizzle-orm");

        await db.delete(schema.events).where(like(schema.events.title, `${PREFIX}%`));
        await db.delete(schema.users).where(like(schema.users.email, `${PREFIX}%`));
        await db.delete(schema.members).where(eq(schema.members.firstname, "Etest"));
        await db.delete(schema.groups).where(like(schema.groups.name, `${PREFIX}%`));
    });

    it("zeigt einen Termin ohne Freigabe allen", async () => {
        const { listEvents } = await import("$lib/server/eventService");

        for (const viewer of [
            { id: userId, memberIds: [memberId] },
            { id: outsiderId, memberIds: [outsiderMemberId] }
        ]) {
            const ids = (await listEvents(viewer, { range: "upcoming" })).map((e) => e.id);
            expect(ids).toContain(openId);
        }
    });

    it("beschränkt einen freigegebenen Termin auf seine Gruppe", async () => {
        const { listEvents, getEvent } = await import("$lib/server/eventService");

        const mine = await listEvents({ id: userId, memberIds: [memberId] }, { range: "upcoming" });
        expect(mine.map((e) => e.id)).toContain(meuteOnlyId);

        const theirs = await listEvents(
            { id: outsiderId, memberIds: [outsiderMemberId] },
            { range: "upcoming" }
        );
        expect(theirs.map((e) => e.id)).not.toContain(meuteOnlyId);

        // Auch nicht über die direkte Adresse.
        expect(
            await getEvent(meuteOnlyId, { id: outsiderId, memberIds: [outsiderMemberId] })
        ).toBeNull();
    });

    it("versteckt Entwürfe vor allen außer der Verwaltung", async () => {
        const { listEvents, getEvent } = await import("$lib/server/eventService");

        const normal = await listEvents(
            { id: userId, memberIds: [memberId] },
            { range: "upcoming" }
        );
        expect(normal.map((e) => e.id)).not.toContain(draftId);
        expect(await getEvent(draftId, { id: userId, memberIds: [memberId] })).toBeNull();

        const managing = await listEvents(
            { id: userId, memberIds: [memberId] },
            { range: "upcoming", manageAll: true }
        );
        expect(managing.map((e) => e.id)).toContain(draftId);
    });

    it("trennt kommende von vergangenen Terminen", async () => {
        const { listEvents } = await import("$lib/server/eventService");
        const viewer = { id: userId, memberIds: [memberId] };

        const upcoming = (await listEvents(viewer, { range: "upcoming" })).map((e) => e.id);
        const past = (await listEvents(viewer, { range: "past" })).map((e) => e.id);

        expect(upcoming).toContain(openId);
        expect(upcoming).not.toContain(pastId);
        expect(past).toContain(pastId);
        expect(past).not.toContain(openId);
    });

    it("speichert eine Rückmeldung und ersetzt sie beim zweiten Mal", async () => {
        const { respond, listResponses, getEvent } = await import("$lib/server/eventService");

        expect(
            (await respond({ eventId: openId, memberId, response: "yes", respondedBy: userId })).ok
        ).toBe(true);

        expect(
            (
                await respond({
                    eventId: openId,
                    memberId,
                    response: "no",
                    note: "doch nicht",
                    respondedBy: userId
                })
            ).ok
        ).toBe(true);

        const responses = await listResponses(openId);
        // Nicht zwei Zeilen, sondern eine geänderte.
        expect(responses).toHaveLength(1);
        expect(responses[0].response).toBe("no");
        expect(responses[0].note).toBe("doch nicht");

        const entry = await getEvent(openId, { id: userId, memberIds: [memberId] });
        expect(entry?.counts).toEqual({ yes: 0, no: 1, maybe: 0 });
    });

    it("nimmt eine Rückmeldung zurück", async () => {
        const { withdrawResponse, listResponses } = await import("$lib/server/eventService");
        await withdrawResponse(openId, memberId);
        expect(await listResponses(openId)).toHaveLength(0);
    });

    it("weist eine Rückmeldung nach der Frist ab", async () => {
        const { createEvent, respond } = await import("$lib/server/eventService");

        const result = await createEvent(
            {
                title: `${PREFIX}Frist`,
                startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                responseDeadline: new Date(Date.now() - 60_000)
            },
            userId
        );

        const response = await respond({
            eventId: result.id!,
            memberId,
            response: "yes",
            respondedBy: userId
        });

        expect(response.ok).toBe(false);
        expect(response.error).toBe("Die Rückmeldefrist ist abgelaufen.");
    });

    it("weist eine Rückmeldung auf einen vergangenen Termin ab", async () => {
        const { respond } = await import("$lib/server/eventService");
        const result = await respond({
            eventId: pastId,
            memberId,
            response: "yes",
            respondedBy: userId
        });
        expect(result.ok).toBe(false);
    });

    it("weist eine Rückmeldung auf einen abgesagten Termin ab", async () => {
        const { createEvent, cancelEvent, respond } = await import("$lib/server/eventService");

        const result = await createEvent(
            { title: `${PREFIX}Abgesagt`, startsAt: new Date(Date.now() + 86_400_000) },
            userId
        );
        await cancelEvent(result.id!);

        const response = await respond({
            eventId: result.id!,
            memberId,
            response: "yes",
            respondedBy: userId
        });

        expect(response.ok).toBe(false);
    });

    it("lässt einen abgesagten Termin sichtbar", async () => {
        const { createEvent, cancelEvent, listEvents } = await import("$lib/server/eventService");

        const result = await createEvent(
            { title: `${PREFIX}Sichtbar abgesagt`, startsAt: new Date(Date.now() + 86_400_000) },
            userId
        );
        await cancelEvent(result.id!);

        const entries = await listEvents(
            { id: userId, memberIds: [memberId] },
            { range: "upcoming" }
        );
        const entry = entries.find((e) => e.id === result.id);

        expect(entry).toBeTruthy();
        expect(entry?.status).toBe("cancelled");
    });

    it("weist ein Ende vor dem Beginn ab", async () => {
        const { createEvent } = await import("$lib/server/eventService");
        const start = new Date(Date.now() + 86_400_000);

        const result = await createEvent(
            {
                title: `${PREFIX}Falsch`,
                startsAt: start,
                endsAt: new Date(start.getTime() - 3_600_000)
            },
            userId
        );

        expect(result.ok).toBe(false);
    });

    it("weist eine Rückmeldung ab, wenn der Termin keine erfasst", async () => {
        const { createEvent, respond, listResponses } = await import("$lib/server/eventService");

        const result = await createEvent(
            {
                title: `${PREFIX}Ohne Rückmeldung`,
                startsAt: new Date(Date.now() + 86_400_000),
                responsesEnabled: false
            },
            userId
        );

        const response = await respond({
            eventId: result.id!,
            memberId,
            response: "yes",
            respondedBy: userId
        });

        expect(response.ok).toBe(false);
        expect(response.error).toBe("Für diesen Termin werden keine Rückmeldungen erfasst.");

        // Das Ausblenden im Formular genügt nicht -- der Server muss halten.
        expect(await listResponses(result.id!)).toHaveLength(0);
    });

    it("liefert keine Teilnehmerliste, wenn die Rückmeldung abgeschaltet wird", async () => {
        const { createEvent, respond, listResponses, updateEvent } = await import(
            "$lib/server/eventService"
        );

        const startsAt = new Date(Date.now() + 86_400_000);
        const result = await createEvent({ title: `${PREFIX}Erst ja`, startsAt }, userId);

        expect(
            (await respond({ eventId: result.id!, memberId, response: "yes", respondedBy: userId }))
                .ok
        ).toBe(true);
        expect(await listResponses(result.id!)).toHaveLength(1);

        await updateEvent(result.id!, {
            title: `${PREFIX}Erst ja`,
            startsAt,
            responsesEnabled: false
        });

        // Die alte Zeile steht noch in der Tabelle, gehört aber nicht mehr in
        // die Anzeige.
        expect(await listResponses(result.id!)).toHaveLength(0);
    });

    it("normalisiert die Farbe beim Anlegen und Ändern", async () => {
        const { createEvent, getEvent, updateEvent } = await import("$lib/server/eventService");
        const viewer = { id: userId, memberIds: [memberId] };
        const startsAt = new Date(Date.now() + 86_400_000);

        const unknown = await createEvent(
            { title: `${PREFIX}Farbe unbekannt`, startsAt, color: "magenta" },
            userId
        );
        expect((await getEvent(unknown.id!, viewer))?.color).toBe("blau");

        const shouty = await createEvent(
            { title: `${PREFIX}Farbe laut`, startsAt, color: "  ROT " },
            userId
        );
        expect((await getEvent(shouty.id!, viewer))?.color).toBe("rot");

        await updateEvent(shouty.id!, { title: `${PREFIX}Farbe laut`, startsAt, color: "Gruen" });
        expect((await getEvent(shouty.id!, viewer))?.color).toBe("gruen");
    });

    it("bindet die Verwaltung an die freigegebenen Gruppen", async () => {
        const { mayManageEvent } = await import("$lib/server/eventService");

        // Stammesweit: immer ja.
        expect(await mayManageEvent(meuteOnlyId, null)).toBe(true);
        expect(await mayManageEvent(openId, null)).toBe(true);

        // Kein Recht: immer nein.
        expect(await mayManageEvent(meuteOnlyId, [])).toBe(false);

        // Passende Gruppe ja, fremde Gruppe nein.
        expect(await mayManageEvent(meuteOnlyId, [meuteId])).toBe(true);
        expect(await mayManageEvent(meuteOnlyId, [sippeId])).toBe(false);

        /**
         * Bewusst unsymmetrisch: ein Termin ohne jede Freigabe ist für alle
         * SICHTBAR, aber für eine gruppengebundene Verwaltung nicht
         * verwaltbar -- sonst dürfte eine Meutenführung die stammesweite
         * Stammesversammlung ändern.
         */
        expect(await mayManageEvent(openId, [meuteId])).toBe(false);
    });

    it("zeigt einen Entwurf der eigenen Gruppe der zuständigen Verwaltung", async () => {
        const { createEvent, getEvent, listEvents, setEventShares } = await import(
            "$lib/server/eventService"
        );

        const result = await createEvent(
            {
                title: `${PREFIX}Entwurf Meute`,
                startsAt: new Date(Date.now() + 86_400_000),
                status: "draft"
            },
            userId
        );
        await setEventShares(result.id!, [{ targetKind: "group", targetId: meuteId }]);

        const viewer = { id: userId, memberIds: [memberId] };

        // Ohne Verwaltungsrecht bleibt der Entwurf unsichtbar.
        expect((await listEvents(viewer, { range: "upcoming" })).map((e) => e.id)).not.toContain(
            result.id
        );
        expect(await getEvent(result.id!, viewer)).toBeNull();

        // Mit dem Recht für die Meute erscheint er.
        const managing = await listEvents(viewer, {
            range: "upcoming",
            manageGroups: [meuteId]
        });
        expect(managing.map((e) => e.id)).toContain(result.id);
        expect(await getEvent(result.id!, viewer, { manageGroups: [meuteId] })).not.toBeNull();

        // Mit dem Recht für eine fremde Gruppe nicht.
        const foreign = await listEvents(viewer, {
            range: "upcoming",
            manageGroups: [sippeId]
        });
        expect(foreign.map((e) => e.id)).not.toContain(result.id);
    });

    it("löscht mit dem Termin auch sein Titelbild", async () => {
        const { db } = await import("$lib/server/db");
        const schema = await import("$lib/server/db/schema");
        const { eq } = await import("drizzle-orm");
        const { createEvent, deleteEvent } = await import("$lib/server/eventService");
        const { storeFile } = await import("$lib/server/fileStore");

        const fileId = await storeFile({
            filename: `${PREFIX}titelbild.png`,
            contentType: "image/png",
            content: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        });

        const result = await createEvent(
            {
                title: `${PREFIX}Mit Bild`,
                startsAt: new Date(Date.now() + 86_400_000),
                coverFileId: fileId
            },
            userId
        );

        expect(await db.select().from(schema.files).where(eq(schema.files.id, fileId))).toHaveLength(
            1
        );

        expect(await deleteEvent(result.id!)).toBe(true);

        /**
         * Der Fremdschlüssel steht auf ON DELETE SET NULL und räumt deshalb
         * nichts ab -- ohne den Schritt in `deleteEvent` bliebe hier eine
         * verwaiste Zeile samt Objekt im Speicher liegen.
         */
        expect(await db.select().from(schema.files).where(eq(schema.files.id, fileId))).toHaveLength(
            0
        );
    });

    it("weist eine Frist nach dem Termin ab", async () => {
        const { createEvent } = await import("$lib/server/eventService");
        const start = new Date(Date.now() + 86_400_000);

        const result = await createEvent(
            {
                title: `${PREFIX}Frist danach`,
                startsAt: start,
                responseDeadline: new Date(start.getTime() + 3_600_000)
            },
            userId
        );

        expect(result.ok).toBe(false);
    });
});
