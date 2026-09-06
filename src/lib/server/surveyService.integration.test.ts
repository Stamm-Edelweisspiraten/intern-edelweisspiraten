import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "$env/dynamic/private";

/**
 * Umfragen gegen eine echte Datenbank.
 *
 * Geprüft wird, was sich nur im Zusammenspiel zeigt und deshalb in keinem
 * Unit-Test auffiele: die Sichtbarkeit über Freigaben, der Schutz gegen
 * Mehrfachantworten über `dedupe_key` bzw. `survey_participants`, die Sperre
 * der Fragenliste, sobald Antworten vorliegen -- und dass eine Umfrage das
 * Löschen ihres Termins mitsamt allen Antworten übersteht (ON DELETE SET NULL
 * statt CASCADE).
 *
 * Übersprungen ohne DATABASE_URL. Alle App-Importe sind absichtlich faul: ein
 * Import auf Modulebene würde die Datenbankverbindung schon beim Einsammeln
 * der Dateien aufbauen, also auch dann, wenn dieser Block übersprungen wird.
 */

const ready = Boolean(env.DATABASE_URL);
const maybe = ready ? describe : describe.skip;

maybe("Umfragen", () => {
    const PREFIX = "utest-";

    let meuteId = "";
    let sippeId = "";
    let memberId = "";
    let secondMemberId = "";
    let userId = "";
    let outsiderId = "";
    let eventId = "";

    beforeAll(async () => {
        const { db } = await import("$lib/server/db");
        const schema = await import("$lib/server/db/schema");

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
            .values({ firstname: "Utest", lastname: "Person" })
            .returning({ id: schema.members.id });
        memberId = member.id;

        const [second] = await db
            .insert(schema.members)
            .values({ firstname: "Utest", lastname: "Geschwister" })
            .returning({ id: schema.members.id });
        secondMemberId = second.id;

        await db.insert(schema.memberGroups).values({ memberId, groupId: meuteId });

        const [user] = await db
            .insert(schema.users)
            .values({ name: "Utest", email: `${PREFIX}a@example.org`, passwordHash: "" })
            .returning({ id: schema.users.id });
        userId = user.id;
        await db.insert(schema.userMembers).values({ userId, memberId });
        await db
            .insert(schema.userMembers)
            .values({ userId, memberId: secondMemberId });

        const [outsider] = await db
            .insert(schema.users)
            .values({ name: "Fremd", email: `${PREFIX}b@example.org`, passwordHash: "" })
            .returning({ id: schema.users.id });
        outsiderId = outsider.id;

        const [event] = await db
            .insert(schema.events)
            .values({ title: `${PREFIX}Lager`, startsAt: new Date(Date.now() + 86400000) })
            .returning({ id: schema.events.id });
        eventId = event.id;
    });

    afterAll(async () => {
        const { db } = await import("$lib/server/db");
        const schema = await import("$lib/server/db/schema");
        const { like, eq } = await import("drizzle-orm");

        // Umfragen zuerst: Felder, Antworten, Freigaben und Teilnahmen hängen
        // per CASCADE daran.
        await db.delete(schema.surveys).where(like(schema.surveys.title, `${PREFIX}%`));
        await db.delete(schema.events).where(like(schema.events.title, `${PREFIX}%`));
        await db.delete(schema.users).where(like(schema.users.email, `${PREFIX}%`));
        await db.delete(schema.members).where(eq(schema.members.firstname, "Utest"));
        await db.delete(schema.groups).where(like(schema.groups.name, `${PREFIX}%`));
    });

    /** Der Blick des Testbenutzers -- ohne stammesweites surveys.manage. */
    const asUser = () => ({ id: userId, memberIds: [memberId, secondMemberId] });

    interface Setup {
        title: string;
        audience?: "user" | "member";
        anonymous?: boolean;
        multiplePerUser?: boolean;
        eventId?: string | null;
        closesAt?: Date | null;
        opensAt?: Date | null;
        publish?: boolean;
        fields?: {
            type: "text" | "longtext" | "single" | "multi" | "boolean";
            label: string;
            required?: boolean;
            options?: { label: string }[];
        }[];
    }

    /** Legt eine Umfrage samt Fragen an und liefert sie fertig gelesen zurück. */
    async function makeSurvey(setup: Setup) {
        const { createSurvey, getSurvey, setSurveyFields, setSurveyStatus } = await import(
            "$lib/server/surveyService"
        );

        const created = await createSurvey(
            {
                title: `${PREFIX}${setup.title}`,
                audience: setup.audience ?? "user",
                anonymous: setup.anonymous ?? false,
                multiplePerUser: setup.multiplePerUser ?? false,
                eventId: setup.eventId ?? null,
                opensAt: setup.opensAt ?? null,
                closesAt: setup.closesAt ?? null
            },
            userId
        );

        expect(created.ok, created.error ?? "").toBe(true);

        const fields = setup.fields ?? [{ type: "text" as const, label: "Anmerkung" }];
        const result = await setSurveyFields(created.id!, fields);
        expect(result.ok, result.error ?? "").toBe(true);

        if (setup.publish !== false) {
            const published = await setSurveyStatus(created.id!, "published");
            expect(published.ok, published.error ?? "").toBe(true);
        }

        const entry = await getSurvey(created.id!, {}, { manageAll: true });
        expect(entry).not.toBeNull();
        return entry!;
    }

    // -----------------------------------------------------------------------
    // Sichtbarkeit
    // -----------------------------------------------------------------------

    it("zeigt einen Entwurf nicht, wer ihn nicht verwalten darf", async () => {
        const { listSurveys, getSurvey } = await import("$lib/server/surveyService");
        const entry = await makeSurvey({ title: "Entwurf", publish: false });

        const forUser = await listSurveys(asUser(), { manageGroups: [] });
        expect(forUser.map((row) => row.id)).not.toContain(entry.id);

        // Auch nicht über die direkte Adresse.
        expect(await getSurvey(entry.id, asUser())).toBeNull();

        const forManager = await listSurveys(asUser(), { manageAll: true, manageGroups: null });
        expect(forManager.map((row) => row.id)).toContain(entry.id);
    });

    it("zeigt eine Umfrage ohne Freigabe allen", async () => {
        const { listSurveys } = await import("$lib/server/surveyService");
        const entry = await makeSurvey({ title: "Fuer alle" });

        const forUser = await listSurveys(asUser(), { manageGroups: [] });
        expect(forUser.map((row) => row.id)).toContain(entry.id);

        // Auch ein Zugang ohne Mitglied und ohne Rolle sieht sie.
        const forOutsider = await listSurveys(
            { id: outsiderId, memberIds: [] },
            { manageGroups: [] }
        );
        expect(forOutsider.map((row) => row.id)).toContain(entry.id);
    });

    it("grenzt mit einer Gruppenfreigabe ein", async () => {
        const { listSurveys, setSurveyShares } = await import("$lib/server/surveyService");
        const entry = await makeSurvey({ title: "Nur Sippe" });

        await setSurveyShares(entry.id, [{ targetKind: "group", targetId: sippeId }]);

        // Der Benutzer ist in der Meute, nicht in der Sippe.
        const forUser = await listSurveys(asUser(), { manageGroups: [] });
        expect(forUser.map((row) => row.id)).not.toContain(entry.id);

        await setSurveyShares(entry.id, [{ targetKind: "group", targetId: meuteId }]);

        const nowVisible = await listSurveys(asUser(), { manageGroups: [] });
        expect(nowVisible.map((row) => row.id)).toContain(entry.id);
    });

    it("lässt eine Umfrage ohne Freigabe von einer Gruppenverwaltung nicht verwalten", async () => {
        const { mayManageSurvey, setSurveyShares } = await import("$lib/server/surveyService");
        const entry = await makeSurvey({ title: "Ohne Freigabe" });

        // Bewusst unsymmetrisch: sichtbar für alle, aber nur stammesweit
        // verwaltbar -- sonst änderte eine Meutenführung die Stammesversammlung.
        expect(await mayManageSurvey(entry.id, [meuteId])).toBe(false);
        expect(await mayManageSurvey(entry.id, null)).toBe(true);

        await setSurveyShares(entry.id, [{ targetKind: "group", targetId: meuteId }]);
        expect(await mayManageSurvey(entry.id, [meuteId])).toBe(true);
        expect(await mayManageSurvey(entry.id, [sippeId])).toBe(false);
    });

    // -----------------------------------------------------------------------
    // Antworten
    // -----------------------------------------------------------------------

    it("ersetzt die zweite Antwort desselben Zugangs", async () => {
        const { countResponses, getOwnResponses, submitResponse } = await import(
            "$lib/server/surveyService"
        );
        const entry = await makeSurvey({ title: "Einmal" });
        const field = entry.fields[0];

        const first = await submitResponse({
            surveyId: entry.id,
            userId,
            answers: [{ fieldId: field.id, value: "erste Fassung" }]
        });
        expect(first.ok, first.error ?? "").toBe(true);

        const second = await submitResponse({
            surveyId: entry.id,
            userId,
            answers: [{ fieldId: field.id, value: "zweite Fassung" }]
        });
        expect(second.ok, second.error ?? "").toBe(true);

        expect(await countResponses(entry.id)).toBe(1);

        const own = await getOwnResponses(entry.id, { userId, memberIds: [] });
        expect(own.get(`u:${userId}`)?.[0]?.value).toBe("zweite Fassung");
    });

    it("erlaubt bei multiplePerUser zwei Antworten nebeneinander", async () => {
        const { countResponses, submitResponse } = await import("$lib/server/surveyService");
        const entry = await makeSurvey({ title: "Formular", multiplePerUser: true });
        const field = entry.fields[0];

        for (const value of ["eins", "zwei"]) {
            const result = await submitResponse({
                surveyId: entry.id,
                userId,
                answers: [{ fieldId: field.id, value }]
            });
            expect(result.ok, result.error ?? "").toBe(true);
        }

        // Beide Zeilen tragen dedupe_key NULL -- PostgreSQL behandelt NULLs in
        // einer Eindeutigkeit als verschieden, genau deshalb geht das.
        expect(await countResponses(entry.id)).toBe(2);
    });

    it("speichert eine anonyme Antwort ohne Absender und weist die zweite ab", async () => {
        const { db } = await import("$lib/server/db");
        const schema = await import("$lib/server/db/schema");
        const { eq } = await import("drizzle-orm");
        const { submitResponse } = await import("$lib/server/surveyService");

        const entry = await makeSurvey({ title: "Anonym", anonymous: true });
        const field = entry.fields[0];

        const first = await submitResponse({
            surveyId: entry.id,
            userId,
            answers: [{ fieldId: field.id, value: "geheim" }]
        });
        expect(first.ok, first.error ?? "").toBe(true);

        const rows = await db
            .select()
            .from(schema.surveyResponses)
            .where(eq(schema.surveyResponses.surveyId, entry.id));

        expect(rows).toHaveLength(1);
        expect(rows[0].userId).toBeNull();
        expect(rows[0].memberId).toBeNull();
        expect(rows[0].dedupeKey).toBeNull();

        // Die Teilnahme steht getrennt davon -- ohne Bezug zur Antwort.
        const participants = await db
            .select()
            .from(schema.surveyParticipants)
            .where(eq(schema.surveyParticipants.surveyId, entry.id));

        expect(participants).toHaveLength(1);
        expect(participants[0].subjectId).toBe(userId);

        const second = await submitResponse({
            surveyId: entry.id,
            userId,
            answers: [{ fieldId: field.id, value: "noch geheimer" }]
        });
        expect(second.ok).toBe(false);
        expect(second.error).toBeTruthy();
    });

    it("weist eine Antwort nach dem Ende des Antwortzeitraums ab", async () => {
        const { submitResponse } = await import("$lib/server/surveyService");
        const entry = await makeSurvey({
            title: "Abgelaufen",
            closesAt: new Date(Date.now() - 60000)
        });

        const result = await submitResponse({
            surveyId: entry.id,
            userId,
            answers: [{ fieldId: entry.fields[0].id, value: "zu spät" }]
        });

        expect(result.ok).toBe(false);
        expect(result.error).toBeTruthy();
    });

    it("weist eine Antwort auf eine abgeschlossene Umfrage ab", async () => {
        const { setSurveyStatus, submitResponse } = await import("$lib/server/surveyService");
        const entry = await makeSurvey({ title: "Geschlossen" });

        await setSurveyStatus(entry.id, "closed");

        const result = await submitResponse({
            surveyId: entry.id,
            userId,
            answers: [{ fieldId: entry.fields[0].id, value: "zu spät" }]
        });

        expect(result.ok).toBe(false);
    });

    it("weist einen Optionswert ab, den es nicht gibt", async () => {
        const { submitResponse } = await import("$lib/server/surveyService");
        const entry = await makeSurvey({
            title: "Auswahl",
            fields: [
                {
                    type: "single",
                    label: "Wochentag",
                    required: true,
                    options: [{ label: "Samstag" }, { label: "Sonntag" }]
                }
            ]
        });

        const field = entry.fields[0];
        expect(field.options.map((option) => option.value)).toEqual(["samstag", "sonntag"]);

        const result = await submitResponse({
            surveyId: entry.id,
            userId,
            answers: [{ fieldId: field.id, value: "montag" }]
        });

        expect(result.ok).toBe(false);
        expect(result.fieldErrors?.[field.id]).toBeTruthy();
    });

    it("nimmt im Mitglieder-Modus je Mitglied eine Antwort an", async () => {
        const { countResponses, submitResponse } = await import("$lib/server/surveyService");
        const entry = await makeSurvey({ title: "Je Mitglied", audience: "member" });
        const field = entry.fields[0];

        // Ohne Mitglied geht gar nichts.
        const without = await submitResponse({
            surveyId: entry.id,
            userId,
            answers: [{ fieldId: field.id, value: "ohne" }]
        });
        expect(without.ok).toBe(false);

        for (const id of [memberId, secondMemberId]) {
            const result = await submitResponse({
                surveyId: entry.id,
                userId,
                memberId: id,
                answers: [{ fieldId: field.id, value: `für ${id}` }]
            });
            expect(result.ok, result.error ?? "").toBe(true);
        }

        // Zwei Kinder, zwei Stimmen -- und je Kind bleibt es bei einer.
        expect(await countResponses(entry.id)).toBe(2);

        const again = await submitResponse({
            surveyId: entry.id,
            userId,
            memberId,
            answers: [{ fieldId: field.id, value: "neu" }]
        });
        expect(again.ok, again.error ?? "").toBe(true);
        expect(await countResponses(entry.id)).toBe(2);
    });

    // -----------------------------------------------------------------------
    // Auswertung und Sperre
    // -----------------------------------------------------------------------

    it("zählt die Ergebnisse richtig aus", async () => {
        const { getResults, submitResponse } = await import("$lib/server/surveyService");
        const entry = await makeSurvey({
            title: "Ergebnisse",
            fields: [
                {
                    type: "single",
                    label: "Wochentag",
                    options: [{ label: "Samstag" }, { label: "Sonntag" }]
                },
                {
                    type: "multi",
                    label: "Ausruestung",
                    options: [{ label: "Zelt" }, { label: "Kocher" }]
                },
                { type: "boolean", label: "Dabei?" },
                { type: "text", label: "Anmerkung" }
            ]
        });

        const [single, multi, yesno, text] = entry.fields;

        const first = await submitResponse({
            surveyId: entry.id,
            userId,
            answers: [
                { fieldId: single.id, value: "samstag" },
                { fieldId: multi.id, values: ["zelt", "kocher"] },
                { fieldId: yesno.id, value: "ja" },
                { fieldId: text.id, value: "Bringe Kuchen mit." }
            ]
        });
        expect(first.ok, first.error ?? "").toBe(true);

        const second = await submitResponse({
            surveyId: entry.id,
            userId: outsiderId,
            answers: [
                { fieldId: single.id, value: "samstag" },
                { fieldId: multi.id, values: ["zelt"] },
                { fieldId: yesno.id, value: "nein" }
            ]
        });
        expect(second.ok, second.error ?? "").toBe(true);

        const results = await getResults(entry.id);
        expect(results?.responseCount).toBe(2);

        const singleResult = results!.fields.find((row) => row.field.id === single.id)!;
        expect(singleResult.answered).toBe(2);
        expect(singleResult.counts.find((row) => row.value === "samstag")?.count).toBe(2);
        expect(singleResult.counts.find((row) => row.value === "sonntag")?.count).toBe(0);

        const multiResult = results!.fields.find((row) => row.field.id === multi.id)!;
        expect(multiResult.counts.find((row) => row.value === "zelt")?.count).toBe(2);
        expect(multiResult.counts.find((row) => row.value === "kocher")?.count).toBe(1);

        const yesnoResult = results!.fields.find((row) => row.field.id === yesno.id)!;
        expect(yesnoResult.yes).toBe(1);
        expect(yesnoResult.no).toBe(1);

        const textResult = results!.fields.find((row) => row.field.id === text.id)!;
        // Nur eine der beiden Antworten hat den Freitext ausgefüllt.
        expect(textResult.texts).toHaveLength(1);
        expect(textResult.texts[0].author).toBe("Utest");
    });

    it("nennt bei einer anonymen Umfrage keinen Absender", async () => {
        const { getResults, submitResponse } = await import("$lib/server/surveyService");
        const entry = await makeSurvey({
            title: "Anonyme Auswertung",
            anonymous: true,
            fields: [{ type: "text", label: "Anmerkung" }]
        });

        const result = await submitResponse({
            surveyId: entry.id,
            userId,
            answers: [{ fieldId: entry.fields[0].id, value: "ohne Namen" }]
        });
        expect(result.ok, result.error ?? "").toBe(true);

        const results = await getResults(entry.id);
        expect(results?.fields[0].texts[0].author).toBeNull();
    });

    it("verweigert Löschen und Typwechsel, sobald Antworten vorliegen", async () => {
        const { setSurveyFields, submitResponse, updateSurvey } = await import(
            "$lib/server/surveyService"
        );
        const entry = await makeSurvey({ title: "Gesperrt" });

        const answered = await submitResponse({
            surveyId: entry.id,
            userId,
            answers: [{ fieldId: entry.fields[0].id, value: "da" }]
        });
        expect(answered.ok, answered.error ?? "").toBe(true);

        // Die bestehende Frage fehlt in der Einreichung -- das waere Loeschen.
        const removed = await setSurveyFields(entry.id, [
            { type: "text", label: "Etwas ganz anderes" }
        ]);
        expect(removed.ok).toBe(false);
        expect(removed.error).toContain("Antworten");

        // Dieselbe Frage, aber mit gewechseltem Typ.
        const retyped = await setSurveyFields(entry.id, [
            { id: entry.fields[0].id, type: "number", label: entry.fields[0].label }
        ]);
        expect(retyped.ok).toBe(false);
        expect(retyped.error).toContain("Antworten");

        // Auch „wer antwortet“ und die Anonymität stehen dann fest.
        const switched = await updateSurvey(entry.id, {
            title: entry.title,
            audience: "member"
        });
        expect(switched.ok).toBe(false);

        const anonymised = await updateSurvey(entry.id, {
            title: entry.title,
            audience: entry.audience,
            anonymous: true
        });
        expect(anonymised.ok).toBe(false);

        // Der Titel allein lässt sich weiterhin ändern.
        const renamed = await updateSurvey(entry.id, {
            title: `${PREFIX}Gesperrt, umbenannt`,
            audience: entry.audience,
            anonymous: entry.anonymous
        });
        expect(renamed.ok, renamed.error ?? "").toBe(true);
    });

    /**
     * Die Gegenprobe zum Test darueber -- und der Grund, warum die Regel
     * gelockert wurde: einen Tippfehler zu berichtigen oder eine vergessene
     * Frage nachzureichen darf nicht bedeuten, die ganze Umfrage neu anlegen
     * zu muessen.
     */
    it("erlaubt Ergänzen und Umbenennen, obwohl Antworten vorliegen", async () => {
        const { getSurvey, setSurveyFields, submitResponse, getResults } = await import(
            "$lib/server/surveyService"
        );
        const entry = await makeSurvey({ title: "Wachsend" });

        const answered = await submitResponse({
            surveyId: entry.id,
            userId,
            answers: [{ fieldId: entry.fields[0].id, value: "da" }]
        });
        expect(answered.ok, answered.error ?? "").toBe(true);

        const grown = await setSurveyFields(entry.id, [
            // bestehende Frage, nur umbenannt
            { id: entry.fields[0].id, type: entry.fields[0].type, label: "Neu beschriftet" },
            // und eine, die es vorher nicht gab
            { type: "scale", label: "Wie war es?", minValue: 1, maxValue: 5 }
        ]);
        expect(grown.ok, grown.error ?? "").toBe(true);

        const after = await getSurvey(entry.id, asUser(), { manageAll: true });
        expect(after!.fields).toHaveLength(2);
        expect(after!.fields[0].id).toBe(entry.fields[0].id);
        expect(after!.fields[0].label).toBe("Neu beschriftet");

        // Die vorhandene Antwort haengt weiter an der umbenannten Frage.
        const results = await getResults(entry.id);
        expect(results!.responseCount).toBe(1);
        expect(results!.fields[0].answered).toBe(1);
        // Die neue Frage konnte diese Antwort gar nicht sehen.
        expect(results!.fields[1].answered).toBe(0);
        expect(results!.fields[1].responseCount).toBe(1);
    });

    /**
     * Die Kennung im Formular ist eine Behauptung. Gehoert sie zu einer
     * ANDEREN Umfrage, darf sie deren Frage unter keinen Umstaenden
     * umschreiben -- sie gilt dann als neue Frage.
     */
    it("schreibt mit einer fremden Feldkennung keine fremde Frage um", async () => {
        const { getSurvey, setSurveyFields } = await import("$lib/server/surveyService");

        const fremd = await makeSurvey({ title: "Fremd" });
        const eigen = await makeSurvey({ title: "Eigen" });

        const result = await setSurveyFields(eigen.id, [
            { id: fremd.fields[0].id, type: "text", label: "Untergeschoben" }
        ]);
        expect(result.ok, result.error ?? "").toBe(true);

        // Die fremde Frage steht unveraendert da.
        const after = await getSurvey(fremd.id, asUser(), { manageAll: true });
        expect(after!.fields[0].id).toBe(fremd.fields[0].id);
        expect(after!.fields[0].label).toBe(fremd.fields[0].label);

        // Und in der eigenen Umfrage ist eine NEUE Frage entstanden.
        const own = await getSurvey(eigen.id, asUser(), { manageAll: true });
        expect(own!.fields).toHaveLength(1);
        expect(own!.fields[0].id).not.toBe(fremd.fields[0].id);
        expect(own!.fields[0].label).toBe("Untergeschoben");
    });

    it("verweigert das Veröffentlichen ohne Fragen und ohne Optionen", async () => {
        const { createSurvey, setSurveyFields, setSurveyStatus } = await import(
            "$lib/server/surveyService"
        );

        const created = await createSurvey({ title: `${PREFIX}Leer` }, userId);
        expect(created.ok).toBe(true);

        const withoutFields = await setSurveyStatus(created.id!, "published");
        expect(withoutFields.ok).toBe(false);

        // Eine Auswahl ohne Optionen ist im Formular eine Sackgasse.
        await setSurveyFields(created.id!, [
            { type: "single", label: "Ohne Optionen", options: [] }
        ]);
        const withoutOptions = await setSurveyStatus(created.id!, "published");
        expect(withoutOptions.ok).toBe(false);
    });

    // -----------------------------------------------------------------------
    // Termin und Umfrage
    // -----------------------------------------------------------------------

    it("überlebt das Löschen ihres Termins mit allen Antworten", async () => {
        const { countResponses, getSurvey, submitResponse } = await import(
            "$lib/server/surveyService"
        );
        const { deleteEvent } = await import("$lib/server/eventService");

        const entry = await makeSurvey({ title: "Am Termin", eventId });
        expect(entry.eventId).toBe(eventId);
        expect(entry.eventTitle).toBe(`${PREFIX}Lager`);

        const answered = await submitResponse({
            surveyId: entry.id,
            userId,
            answers: [{ fieldId: entry.fields[0].id, value: "bleibt" }]
        });
        expect(answered.ok, answered.error ?? "").toBe(true);

        expect(await deleteEvent(eventId)).toBe(true);

        // ON DELETE SET NULL, nicht CASCADE: die Ergebnisse einer Umfrage sind
        // eigenständig und dürfen einen gelöschten Termin überleben.
        const after = await getSurvey(entry.id, {}, { manageAll: true });
        expect(after?.eventId).toBeNull();
        expect(after?.eventTitle).toBeNull();
        expect(await countResponses(entry.id)).toBe(1);
    });

    it("liefert die Antworten als CSV mit Kopfzeile", async () => {
        const { exportResponsesCsv, submitResponse } = await import(
            "$lib/server/surveyService"
        );
        const entry = await makeSurvey({
            title: "Ausfuhr",
            fields: [
                {
                    type: "single",
                    label: "Wochentag",
                    options: [{ label: "Samstag" }, { label: "Sonntag" }]
                }
            ]
        });

        await submitResponse({
            surveyId: entry.id,
            userId,
            answers: [{ fieldId: entry.fields[0].id, value: "samstag" }]
        });

        const csv = await exportResponsesCsv(entry.id);

        expect(csv).toContain("Wochentag");
        // In der Datei steht die Beschriftung, nicht der gespeicherte Wert.
        expect(csv).toContain("Samstag");
        expect(csv).toContain("Utest");
    });

    /**
     * Regression: das Absenden endete mit "Umfrage nicht gefunden".
     *
     * Der Fehler steckte nicht im Dienst, sondern darin, dass die Route ihn
     * beim Absenden ANDERS aufrief als beim Anzeigen: das `load` gab
     * `manageAll`/`manageGroups` mit, die Aktion nicht. Eine Umfrage, die nur
     * kraft Verwaltungsrecht sichtbar war -- freigegeben an eine Rolle, die
     * der Betrachter nicht hat --, verschwand dadurch zwischen dem Anzeigen
     * des Formulars und seinem Absenden.
     *
     * Der Test haelt beide Aufrufe nebeneinander fest. Faellt jemand kuenftig
     * wieder auf den Aufruf ohne Optionen zurueck, schlaegt er an.
     */
    it("bleibt beim Absenden sichtbar, wenn sie nur kraft Verwaltung sichtbar ist", async () => {
        const { getSurvey } = await import("$lib/server/surveyService");
        const { db } = await import("$lib/server/db");
        const schema = await import("$lib/server/db/schema");
        const { eq } = await import("drizzle-orm");

        const entry = await makeSurvey({
            title: "Nur fuer eine fremde Rolle",
            publish: true,
            fields: [{ type: "text", label: "Name" }]
        });

        // Eine Rolle, die der Testbenutzer NICHT traegt.
        const [role] = await db
            .insert(schema.roles)
            .values({ key: `${PREFIX}fremd`, name: `${PREFIX}Fremde Rolle`, permissions: [] })
            .returning({ id: schema.roles.id });

        await db
            .insert(schema.surveyShares)
            .values({ surveyId: entry.id, targetKind: "role", targetId: role.id });

        try {
            // Ohne Verwaltungsrecht: die Freigabe passt nicht -> unsichtbar.
            expect(await getSurvey(entry.id, asUser())).toBeNull();

            // Mit stammesweiter Verwaltung: sichtbar -- und genau so muss auch
            // die Aktion beim Absenden aufrufen.
            const managed = await getSurvey(entry.id, asUser(), { manageAll: true });
            expect(managed, "Die Verwaltung muss die Umfrage sehen").not.toBeNull();
            expect(managed!.id).toBe(entry.id);
        } finally {
            await db.delete(schema.roles).where(eq(schema.roles.id, role.id));
        }
    });

    // ---------------------------------------------------------------------
    // Externe Freigabe
    // ---------------------------------------------------------------------

    it("gibt das Token genau einmal heraus und speichert nur den Abdruck", async () => {
        const { createPublicLink, resolvePublicSurvey, getSurvey } = await import(
            "$lib/server/surveyService"
        );
        const { db } = await import("$lib/server/db");
        const schema = await import("$lib/server/db/schema");
        const { eq } = await import("drizzle-orm");

        const entry = await makeSurvey({ title: "Extern", publish: true });

        const link = await createPublicLink(entry.id, { nameMode: "optional" });
        expect(link.ok, link.error ?? "").toBe(true);
        expect(link.token).toBeTruthy();

        const [row] = await db
            .select({ hash: schema.surveys.publicTokenHash })
            .from(schema.surveys)
            .where(eq(schema.surveys.id, entry.id));

        // Das Entscheidende: in der Datenbank steht NICHT das Token.
        expect(row.hash).toBeTruthy();
        expect(row.hash).not.toBe(link.token);

        // Und nach aussen wird der Abdruck nirgends durchgereicht.
        const read = await getSurvey(entry.id, asUser(), { manageAll: true });
        expect(JSON.stringify(read)).not.toContain(row.hash!);

        const resolved = await resolvePublicSurvey(link.token!);
        expect(resolved?.id).toBe(entry.id);
    });

    it("macht das alte Token beim Neuerzeugen ungueltig", async () => {
        const { createPublicLink, resolvePublicSurvey } = await import(
            "$lib/server/surveyService"
        );
        const entry = await makeSurvey({ title: "Extern erneuert", publish: true });

        const first = await createPublicLink(entry.id, {});
        const second = await createPublicLink(entry.id, {});

        expect(await resolvePublicSurvey(first.token!)).toBeNull();
        expect((await resolvePublicSurvey(second.token!))?.id).toBe(entry.id);
    });

    it("loest ein widerrufenes oder abgelaufenes Token nicht mehr auf", async () => {
        const { createPublicLink, revokePublicLink, resolvePublicSurvey, updatePublicLink } =
            await import("$lib/server/surveyService");

        const abgelaufen = await makeSurvey({ title: "Extern abgelaufen", publish: true });
        const alt = await createPublicLink(abgelaufen.id, {});
        await updatePublicLink(abgelaufen.id, { expiresAt: new Date(Date.now() - 60_000) });
        expect(await resolvePublicSurvey(alt.token!)).toBeNull();

        const widerrufen = await makeSurvey({ title: "Extern widerrufen", publish: true });
        const tot = await createPublicLink(widerrufen.id, {});
        await revokePublicLink(widerrufen.id);
        expect(await resolvePublicSurvey(tot.token!)).toBeNull();

        expect(await resolvePublicSurvey("gibt-es-nicht")).toBeNull();
    });

    /**
     * Die Sperre muss im DIENST sitzen, nicht nur in der Oberflaeche: sonst
     * genuegte ein nachgebautes Formular, um sie zu umgehen.
     */
    it("gibt eine Mitglieder-Umfrage nicht extern frei", async () => {
        const { createPublicLink } = await import("$lib/server/surveyService");
        const entry = await makeSurvey({ title: "Je Mitglied extern", audience: "member" });

        const link = await createPublicLink(entry.id, {});
        expect(link.ok).toBe(false);
        expect(link.error).toContain("Mitglied");
    });

    it("nimmt eine Antwort ueber den Link an und weist sie als solche aus", async () => {
        const { createPublicLink, submitResponse, getResults, exportResponsesCsv } =
            await import("$lib/server/surveyService");

        const entry = await makeSurvey({
            title: "Extern beantwortet",
            publish: true,
            fields: [{ type: "text", label: "Lieblingsfarbe" }]
        });
        await createPublicLink(entry.id, { nameMode: "optional" });

        const sent = await submitResponse({
            surveyId: entry.id,
            userId: null,
            source: "link",
            publicName: "Anna von aussen",
            answers: [{ fieldId: entry.fields[0].id, value: "Gruen" }]
        });
        expect(sent.ok, sent.error ?? "").toBe(true);

        const results = await getResults(entry.id);
        expect(results!.linkCount).toBe(1);
        expect(results!.internCount).toBe(0);
        expect(results!.fields[0].texts[0].source).toBe("link");
        expect(results!.fields[0].texts[0].author).toBe("Anna von aussen");

        const csv = await exportResponsesCsv(entry.id);
        expect(csv).toContain("Anna von aussen");
    });

    it("erzwingt den Namen nur bei Pflicht und verwirft ihn bei ohne", async () => {
        const { createPublicLink, submitResponse, getResults } = await import(
            "$lib/server/surveyService"
        );

        const pflicht = await makeSurvey({ title: "Name Pflicht", publish: true });
        await createPublicLink(pflicht.id, { nameMode: "required" });

        const ohneNamen = await submitResponse({
            surveyId: pflicht.id,
            userId: null,
            source: "link",
            answers: [{ fieldId: pflicht.fields[0].id, value: "da" }]
        });
        expect(ohneNamen.ok).toBe(false);

        const ohne = await makeSurvey({ title: "Name ohne", publish: true });
        await createPublicLink(ohne.id, { nameMode: "none" });

        const mitNamen = await submitResponse({
            surveyId: ohne.id,
            userId: null,
            source: "link",
            publicName: "Sollte verschwinden",
            answers: [{ fieldId: ohne.fields[0].id, value: "da" }]
        });
        expect(mitNamen.ok, mitNamen.error ?? "").toBe(true);

        // Ein trotzdem geschickter Name wird STILL verworfen, nicht gespeichert.
        const results = await getResults(ohne.id);
        expect(results!.fields[0].texts[0].author).toBeNull();
    });

    it("laesst ueber den Link mehrfach antworten -- es gibt keine Identitaet", async () => {
        const { createPublicLink, submitResponse, getResults } = await import(
            "$lib/server/surveyService"
        );
        const entry = await makeSurvey({ title: "Extern mehrfach", publish: true });
        await createPublicLink(entry.id, { nameMode: "optional" });

        for (const name of ["Erste", "Zweite"]) {
            const sent = await submitResponse({
                surveyId: entry.id,
                userId: null,
                source: "link",
                publicName: name,
                answers: [{ fieldId: entry.fields[0].id, value: "da" }]
            });
            expect(sent.ok, sent.error ?? "").toBe(true);
        }

        const results = await getResults(entry.id);
        expect(results!.linkCount).toBe(2);
    });

    it("weist eine Antwort ueber einen widerrufenen Link ab", async () => {
        const { createPublicLink, revokePublicLink, submitResponse } = await import(
            "$lib/server/surveyService"
        );
        const entry = await makeSurvey({ title: "Extern tot", publish: true });
        await createPublicLink(entry.id, {});
        await revokePublicLink(entry.id);

        const sent = await submitResponse({
            surveyId: entry.id,
            userId: null,
            source: "link",
            answers: [{ fieldId: entry.fields[0].id, value: "da" }]
        });
        expect(sent.ok).toBe(false);
    });
});
