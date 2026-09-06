import crypto from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, withTransaction } from "$lib/server/db";
import { isUuid, onlyUuids } from "$lib/server/db/ids";
import {
    events,
    members,
    surveyAnswers,
    surveyFields,
    surveyParticipants,
    surveyResponses,
    surveyShares,
    surveys,
    users
} from "$lib/server/db/schema";
import {
    matchesTargets,
    resolveShareTargets,
    resolveTargetNames,
    sharesGrantGroupScope,
    type ShareTargetKind
} from "$lib/server/shareService";
import {
    allowsOther,
    BOOLEAN_LABELS,
    BOOLEAN_VALUES,
    expectsAnswer,
    hasRange,
    isChoiceType,
    mergeOptionValues,
    needsOptions,
    OTHER_VALUE,
    scaleRange,
    scaleSteps,
    type SurveyFieldType
} from "$lib/surveys/fields";
import { csvDocument } from "$lib/server/csv";

/**
 * Umfragen und Formulare.
 *
 * Sichtbarkeit wie bei Terminen und Ordnern: eine Umfrage ohne Freigabe gilt
 * für alle, sonst zählt eine Freigabe auf eine Gruppe, ein Amt, eine Rolle
 * oder die Person selbst. Entwürfe sieht nur die zuständige Verwaltung;
 * abgeschlossene Umfragen bleiben sichtbar -- ein Ergebnis, das verschwindet,
 * erreicht niemanden.
 *
 * Drei Regeln, die dieser Dienst durchsetzt und die man dem Schema allein
 * nicht ansieht:
 *
 *   1. Der `value` einer Option ist STABIL. Er entsteht einmal aus dem Label
 *      (`mergeOptionValues` in `$lib/surveys/fields`) und überlebt jedes
 *      Umbenennen. Die Antwort speichert den Wert, nie das Label.
 *
 *   2. `dedupeKey` trägt `u:<zugang>` bzw. `m:<mitglied>`, solange die
 *      Umfrage genau eine Antwort je Teilnehmer zulässt, und ist NULL bei
 *      anonymen Umfragen und bei `multiplePerUser`. PostgreSQL behandelt
 *      NULL-Werte in einer Eindeutigkeit als verschieden -- genau deshalb
 *      dürfen beliebig viele nebeneinander stehen.
 *
 *   3. Anonym heißt wirklich anonym: die Antwortzeile trägt weder `user_id`
 *      noch `member_id`. Wer teilgenommen hat, steht ohne Bezug zur Antwort in
 *      `survey_participants`. Folge, die die Oberfläche aussprechen muss: eine
 *      anonyme Antwort lässt sich weder ändern noch zurücknehmen.
 *
 *   4. Der öffentliche Link ersetzt die Anmeldung, mehr nicht. Gespeichert
 *      wird nur der sha256-Abdruck (wie bei Sitzungen und Kalender-Abos), das
 *      Token ist genau einmal sichtbar, und eine Umfrage mit
 *      `audience = "member"` lässt sich gar nicht freigeben -- ohne Anmeldung
 *      ist kein Mitglied bekannt, für das geantwortet werden könnte. Antworten
 *      über den Link tragen `source = "link"` und lassen sich deshalb in der
 *      Auswertung getrennt lesen.
 *
 * Die Prüfung der Antworten steht als REINE Funktion `validateAnswers`
 * daneben. Sie ist der einzige Ort, an dem Feldfehler entstehen, und lässt
 * sich ohne Datenbank prüfen -- ein Formular, das an einer Regel scheitert,
 * ist sonst nur mit einer laufenden Datenbank nachzustellen.
 */

export type SurveyStatus = "draft" | "published" | "closed";
export type SurveyAudience = "user" | "member";
export type { SurveyFieldType };

/** Woher eine Antwort kam: aus dem Portal oder über den öffentlichen Link. */
export type SurveySource = "intern" | "link";

/** Wie der Absender beim Antworten über den Link erfasst wird. */
export type PublicNameMode = "required" | "optional" | "none";

export const PUBLIC_NAME_MODES: readonly PublicNameMode[] = ["required", "optional", "none"];

/**
 * Beschriftung der Herkunft -- damit Auswertung und CSV dieselben Wörter
 * benutzen und niemand sie an zwei Stellen erfindet.
 */
export const SOURCE_LABELS: Record<SurveySource, string> = {
    intern: "Portal",
    link: "Link"
};

/**
 * Der Namensmodus als Text in der Datenbank statt als pgEnum -- ein weiterer
 * Modus soll ohne die Transaktionsfalle von `ALTER TYPE ... ADD VALUE`
 * dazukommen dürfen. Der Preis dafür ist diese Funktion: ein unbekannter Wert
 * fällt auf `optional` zurück, statt die Oberfläche mit einem Modus zu
 * versorgen, den sie nicht kennt.
 */
export function normalizeNameMode(value: string | null | undefined): PublicNameMode {
    return PUBLIC_NAME_MODES.includes(value as PublicNameMode)
        ? (value as PublicNameMode)
        : "optional";
}

/** Beschriftung der Zeile „Sonstiges“ in Auswertung und CSV. */
const OTHER_LABEL = "Sonstiges";

export interface SurveyShare {
    id: string;
    targetKind: ShareTargetKind;
    targetId: string;
    targetName: string;
}

export interface SurveyFieldEntry {
    id: string;
    position: number;
    type: SurveyFieldType;
    label: string;
    help: string;
    required: boolean;
    /** Nur bei `single`/`multi`: zusätzliche Zeile „Sonstiges“ mit Freitext. */
    allowOther: boolean;
    /** Bei `number` die erlaubte Spanne, bei `scale` die Skala selbst. */
    minValue: number | null;
    maxValue: number | null;
    options: { value: string; label: string }[];
}

export interface SurveyEntry {
    id: string;
    title: string;
    description: string;
    status: SurveyStatus;
    audience: SurveyAudience;
    anonymous: boolean;
    multiplePerUser: boolean;
    eventId: string | null;
    eventTitle: string | null;
    opensAt: Date | null;
    closesAt: Date | null;
    /** Nimmt die Umfrage Antworten über den öffentlichen Link an? */
    publicEnabled: boolean;
    publicNameMode: PublicNameMode;
    publicExpiresAt: Date | null;
    /**
     * Liegt ein Abdruck vor? Der Abdruck selbst verlässt diesen Dienst NIE --
     * ein Feld, das ihn trüge, landete früher oder später im Seitenzustand.
     */
    hasPublicLink: boolean;
    fields: SurveyFieldEntry[];
    shares: SurveyShare[];
    responseCount: number;
    createdAt: Date;
}

/** Eine abgegebene Antwort auf ein Feld -- `values` nur bei `multi`. */
export interface SubmittedAnswer {
    fieldId: string;
    value?: string;
    values?: string[];
    /** Der Freitext neben „Sonstiges“ -- nur bei `single`/`multi`. */
    otherValue?: string;
}

export interface SurveyResultField {
    field: SurveyFieldEntry;
    /** Wie viele Antworten dieses Feld überhaupt ausgefüllt haben. */
    answered: number;
    /**
     * Alle Antworten der Umfrage -- an jedem Feld wiederholt, damit die
     * Auswertung „von X der Y Antworten beantwortet“ schreiben kann, ohne
     * jedes Mal auf den Kopf des Ergebnisses zurückzugreifen. Eine nachträglich
     * ergänzte Frage sieht sonst aus, als hätte die Hälfte sie übersprungen.
     */
    responseCount: number;
    /** Auszählung der Auswahl-, Ja/Nein- und Skalenfelder. */
    counts: { value: string; label: string; count: number; share: number }[];
    yes: number;
    no: number;
    /** Mittelwert einer Skala; sonst und ohne Antwort null. */
    average: number | null;
    /** Freitexte, in der Reihenfolge der Abgabe. */
    texts: { value: string; author: string | null; source: SurveySource; submittedAt: Date }[];
    /**
     * Die Freitexte neben „Sonstiges“ -- getrennt von `texts`.
     *
     * Sie gehören zu einem Auswahlfeld, dessen Stimmen in `counts` stehen. Sie
     * dort hineinzumischen hieße, eine Auszählung mit Fließtext zu vermengen;
     * die Auswertung zeigt sie deshalb als Liste unter der Tabelle.
     */
    otherTexts: {
        value: string;
        author: string | null;
        source: SurveySource;
        submittedAt: Date;
    }[];
}

export interface SurveyResults {
    surveyId: string;
    responseCount: number;
    /** Aus dem Portal bzw. über den öffentlichen Link -- getrennt gezählt. */
    internCount: number;
    linkCount: number;
    fields: SurveyResultField[];
}

interface Viewer {
    id?: string;
    memberIds?: string[];
}

/** Höchstlängen der beiden Textfelder -- abweisen, nicht kürzen. */
const MAX_TEXT = 500;
const MAX_LONGTEXT = 5000;

/** Der Freitext neben „Sonstiges“ ist eine Ergänzung, kein Aufsatz. */
const MAX_OTHER = 500;

/**
 * Der selbst angegebene Name beim Antworten über den Link wird GEKÜRZT, nicht
 * abgewiesen: er ist kein Inhalt der Umfrage, und ein Formular, das wegen
 * eines zu langen Namens scheitert, verliert die ganze Antwort.
 */
const MAX_PUBLIC_NAME = 120;

/** Weniger Ziffern trägt keine Rufnummer, mit der sich jemand erreichen ließe. */
const MIN_PHONE_DIGITS = 5;

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

interface ReadOptions {
    /** `surveys.manage` stammesweit: sieht alles, auch Entwürfe. */
    manageAll?: boolean;
    /**
     * Gruppen, für die der Betrachter `surveys.manage` hält -- genau der
     * Rückgabewert von `groupsWithPermission()`.
     *
     * `null` steht für "stammesweit" und wirkt wie `manageAll`, `[]` und
     * `undefined` für "kein Recht". Ein Entwurf wird damit auch für eine
     * Meutenführung sichtbar, sobald er auf ihre Meute freigegeben ist.
     */
    manageGroups?: string[] | null;
}

interface ListOptions extends ReadOptions {
    status?: SurveyStatus;
}

type SurveyRow = typeof surveys.$inferSelect;
type FieldRow = typeof surveyFields.$inferSelect;

function toFieldEntry(row: FieldRow): SurveyFieldEntry {
    return {
        id: row.id,
        position: row.position,
        type: row.type,
        label: row.label,
        help: row.help,
        required: row.required,
        allowOther: row.allowOther,
        minValue: row.minValue,
        maxValue: row.maxValue,
        options: row.options ?? []
    };
}

/**
 * Alle für den Benutzer sichtbaren Umfragen.
 *
 * Vier Abfragen unabhängig von der Anzahl: Umfragen (mit dem Titel des
 * verknüpften Termins), Felder, Freigaben, Antwortzählung. Die Sichtbarkeit
 * wird danach im Speicher entschieden -- als SQL wäre sie eine Kette aus vier
 * ODER-Zweigen über drei Zuordnungstabellen, und der Bestand eines Stamms ist
 * klein. Die Namen der Freigabeziele holt EIN `resolveTargetNames` am Ende.
 */
export async function listSurveys(
    viewer: Viewer,
    options: ListOptions = {}
): Promise<SurveyEntry[]> {
    const conditions = [];
    if (options.status) conditions.push(eq(surveys.status, options.status));

    /**
     * Wer überhaupt einen Entwurf sehen KÖNNTE, wird hier grob entschieden;
     * ob ein einzelner Entwurf in die verwaltete Gruppe fällt, klärt erst die
     * Freigabeprüfung weiter unten -- dafür müssen die Freigaben geladen sein.
     */
    const maySeeAnyDraft =
        options.manageAll === true ||
        options.manageGroups === null ||
        (options.manageGroups?.length ?? 0) > 0;

    if (!maySeeAnyDraft) {
        conditions.push(inArray(surveys.status, ["published", "closed"]));
    }

    const [rows, targets] = await Promise.all([
        db
            .select({ survey: surveys, eventTitle: events.title })
            .from(surveys)
            .leftJoin(events, eq(events.id, surveys.eventId))
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(surveys.createdAt)),
        resolveShareTargets(viewer)
    ]);

    if (rows.length === 0) return [];

    const ids = rows.map((row) => row.survey.id);

    const [fieldRows, shareRows, countRows] = await Promise.all([
        db
            .select()
            .from(surveyFields)
            .where(inArray(surveyFields.surveyId, ids))
            .orderBy(asc(surveyFields.position), asc(surveyFields.id)),
        db
            .select({
                id: surveyShares.id,
                surveyId: surveyShares.surveyId,
                targetKind: surveyShares.targetKind,
                targetId: surveyShares.targetId
            })
            .from(surveyShares)
            .where(inArray(surveyShares.surveyId, ids)),
        db
            .select({
                surveyId: surveyResponses.surveyId,
                count: sql<number>`count(*)::int`
            })
            .from(surveyResponses)
            .where(inArray(surveyResponses.surveyId, ids))
            .groupBy(surveyResponses.surveyId)
    ]);

    const fieldsBySurvey = new Map<string, FieldRow[]>();
    for (const row of fieldRows) {
        const list = fieldsBySurvey.get(row.surveyId) ?? [];
        list.push(row);
        fieldsBySurvey.set(row.surveyId, list);
    }

    const sharesBySurvey = new Map<string, typeof shareRows>();
    for (const share of shareRows) {
        const list = sharesBySurvey.get(share.surveyId) ?? [];
        list.push(share);
        sharesBySurvey.set(share.surveyId, list);
    }

    const countBySurvey = new Map<string, number>();
    for (const row of countRows) countBySurvey.set(row.surveyId, Number(row.count));

    const visible = rows.filter((row) => {
        const shares = sharesBySurvey.get(row.survey.id) ?? [];
        const manages =
            options.manageAll === true ||
            sharesGrantGroupScope(shares, options.manageGroups ?? []);

        // Ein Entwurf ist nur für die zuständige Verwaltung da.
        if (row.survey.status === "draft" && !manages) return false;
        if (options.manageAll) return true;
        // Ohne Freigabe: für alle bestimmt.
        if (shares.length === 0) return true;
        if (shares.some((share) => matchesTargets(targets, share))) return true;
        // Wer verwalten darf, sieht die Umfrage auch ohne eigene Freigabe.
        return manages;
    });

    const visibleIds = new Set(visible.map((row) => row.survey.id));
    const targetNames = await resolveTargetNames(
        shareRows.filter((share) => visibleIds.has(share.surveyId))
    );

    return visible.map((row) =>
        toEntry(
            row.survey,
            row.eventTitle,
            fieldsBySurvey.get(row.survey.id) ?? [],
            sharesBySurvey.get(row.survey.id) ?? [],
            targetNames,
            countBySurvey.get(row.survey.id) ?? 0
        )
    );
}

function toEntry(
    row: SurveyRow,
    eventTitle: string | null,
    fieldRows: FieldRow[],
    shareRows: { id: string; targetKind: ShareTargetKind; targetId: string }[],
    targetNames: Map<string, string>,
    responseCount: number
): SurveyEntry {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        status: row.status,
        audience: row.audience,
        anonymous: row.anonymous,
        multiplePerUser: row.multiplePerUser,
        eventId: row.eventId,
        eventTitle,
        opensAt: row.opensAt,
        closesAt: row.closesAt,
        publicEnabled: row.publicEnabled,
        publicNameMode: normalizeNameMode(row.publicNameMode),
        publicExpiresAt: row.publicExpiresAt,
        hasPublicLink: Boolean(row.publicTokenHash),
        fields: fieldRows.map(toFieldEntry),
        shares: shareRows.map((share) => ({
            id: share.id,
            targetKind: share.targetKind,
            targetId: share.targetId,
            targetName: targetNames.get(share.targetId) ?? "Unbekannt"
        })),
        responseCount,
        createdAt: row.createdAt
    };
}

/**
 * Eine einzelne Umfrage, wenn sie sichtbar ist.
 *
 * Bewusst nicht über `listSurveys` mit einem Filter: die Sichtbarkeitsregel
 * steht damit zwar zweimal da, aber der Aufruf bleibt eine Handvoll Abfragen
 * statt der ganzen Liste.
 */
export async function getSurvey(
    id: string,
    viewer: Viewer,
    options: ReadOptions = {}
): Promise<SurveyEntry | null> {
    if (!isUuid(id)) return null;

    const [row] = await db
        .select({ survey: surveys, eventTitle: events.title })
        .from(surveys)
        .leftJoin(events, eq(events.id, surveys.eventId))
        .where(eq(surveys.id, id))
        .limit(1);

    if (!row) return null;

    const [fieldRows, shareRows, targets, countRows] = await Promise.all([
        db
            .select()
            .from(surveyFields)
            .where(eq(surveyFields.surveyId, id))
            .orderBy(asc(surveyFields.position), asc(surveyFields.id)),
        db
            .select({
                id: surveyShares.id,
                targetKind: surveyShares.targetKind,
                targetId: surveyShares.targetId
            })
            .from(surveyShares)
            .where(eq(surveyShares.surveyId, id)),
        resolveShareTargets(viewer),
        db
            .select({ count: sql<number>`count(*)::int` })
            .from(surveyResponses)
            .where(eq(surveyResponses.surveyId, id))
    ]);

    const manages =
        options.manageAll === true ||
        sharesGrantGroupScope(shareRows, options.manageGroups ?? []);

    if (!manages) {
        if (row.survey.status === "draft") return null;
        // Ohne Freigabe ist die Umfrage für alle bestimmt.
        const allowed =
            shareRows.length === 0 ||
            shareRows.some((share) => matchesTargets(targets, share));
        if (!allowed) return null;
    }

    const targetNames = await resolveTargetNames(shareRows);

    return toEntry(
        row.survey,
        row.eventTitle,
        fieldRows,
        shareRows,
        targetNames,
        Number(countRows[0]?.count ?? 0)
    );
}

/**
 * Darf jemand mit dieser Gruppenbindung diese Umfrage verwalten?
 *
 * `allowedGroups` ist der Rückgabewert von `groupsWithPermission()`. Die
 * Regel selbst steht in `sharesGrantGroupScope` und ist bewusst
 * unsymmetrisch: eine Umfrage ohne Freigabe ist für alle SICHTBAR, aber von
 * einer gruppengebundenen Verwaltung NICHT verwaltbar.
 */
export async function mayManageSurvey(
    id: string,
    allowedGroups: string[] | null
): Promise<boolean> {
    if (!isUuid(id)) return false;

    const [row] = await db
        .select({ id: surveys.id })
        .from(surveys)
        .where(eq(surveys.id, id))
        .limit(1);
    if (!row) return false;

    if (allowedGroups === null) return true;
    if (allowedGroups.length === 0) return false;

    const shareRows = await db
        .select({ targetKind: surveyShares.targetKind, targetId: surveyShares.targetId })
        .from(surveyShares)
        .where(eq(surveyShares.surveyId, id));

    return sharesGrantGroupScope(shareRows, allowedGroups);
}

/** Wie viele Antworten liegen vor? Entscheidet über die Sperre der Feldliste. */
export async function countResponses(surveyId: string): Promise<number> {
    if (!isUuid(surveyId)) return 0;

    const rows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(surveyResponses)
        .where(eq(surveyResponses.surveyId, surveyId));

    return Number(rows[0]?.count ?? 0);
}

// ---------------------------------------------------------------------------
// Schreiben: Kopf, Freigaben, Felder
// ---------------------------------------------------------------------------

export interface SurveyInput {
    title: string;
    description?: string;
    audience?: SurveyAudience;
    eventId?: string | null;
    opensAt?: Date | null;
    closesAt?: Date | null;
    anonymous?: boolean;
    multiplePerUser?: boolean;
}

export interface SurveyFieldInput {
    /**
     * Die Kennung einer BESTEHENDEN Frage. Ohne sie entsteht eine neue Frage.
     *
     * Das ist der ganze Unterschied zwischen „umbenennen“ und „löschen und neu
     * anlegen“ -- und damit die Voraussetzung dafür, dass sich eine Umfrage mit
     * Antworten überhaupt noch bearbeiten lässt.
     */
    id?: string;
    type: SurveyFieldType;
    label: string;
    help?: string;
    required?: boolean;
    /** Zusätzliche Zeile „Sonstiges“ mit Freitext; nur `single`/`multi`. */
    allowOther?: boolean;
    /** Grenzen bei `number`, Skala bei `scale`; sonst ohne Wirkung. */
    minValue?: number | null;
    maxValue?: number | null;
    /**
     * Optionen als Zeilen des Editors. Ein mitgeschickter `value` gehört zu
     * einer bestehenden Option und bleibt erhalten; ohne `value` entsteht ein
     * neuer Schlüssel aus dem Label.
     */
    options?: { value?: string | null; label: string }[];
}

function validateInput(input: SurveyInput): string | null {
    if (!input.title?.trim()) return "Bitte einen Titel angeben.";

    const opensAt = validDate(input.opensAt);
    const closesAt = validDate(input.closesAt);

    if (opensAt && closesAt && closesAt.getTime() <= opensAt.getTime()) {
        return "Das Ende des Antwortzeitraums muss nach dem Beginn liegen.";
    }

    return null;
}

function validDate(value: Date | null | undefined): Date | null {
    if (!value) return null;
    return Number.isNaN(value.getTime()) ? null : value;
}

/**
 * Legt eine Umfrage an -- immer als Entwurf.
 *
 * Der Status ist hier bewusst kein Eingabewert: eine frisch angelegte Umfrage
 * hat noch keine Frage, und `setSurveyStatus("published")` würde sie ohnehin
 * abweisen. Veröffentlicht wird erst, wenn der Fragebogen steht.
 */
export async function createSurvey(
    input: SurveyInput,
    createdBy: string | null
): Promise<{ ok: boolean; id?: string; error?: string }> {
    const error = validateInput(input);
    if (error) return { ok: false, error };

    const [row] = await db
        .insert(surveys)
        .values({
            title: input.title.trim(),
            description: input.description?.trim() ?? "",
            status: "draft",
            audience: input.audience ?? "user",
            eventId: isUuid(input.eventId) ? input.eventId : null,
            opensAt: validDate(input.opensAt),
            closesAt: validDate(input.closesAt),
            anonymous: input.anonymous ?? false,
            multiplePerUser: input.multiplePerUser ?? false,
            createdBy: isUuid(createdBy) ? createdBy : null
        })
        .returning({ id: surveys.id });

    return { ok: true, id: row.id };
}

/**
 * Ändert den Kopf einer Umfrage.
 *
 * Der Status bleibt außen vor: er läuft ausschließlich über
 * `setSurveyStatus`, damit die Prüfungen beim Veröffentlichen nicht über ein
 * verstecktes Formularfeld zu umgehen sind.
 *
 * `audience` und `anonymous` sind gesperrt, sobald Antworten vorliegen -- ein
 * Wechsel würde die bereits abgegebenen Antworten still umdeuten: aus einer
 * Stimme je Zugang würde eine je Mitglied, und aus einer namentlichen Antwort
 * eine, die nur so aussieht wie eine anonyme.
 */
export async function updateSurvey(
    id: string,
    input: SurveyInput
): Promise<{ ok: boolean; error?: string }> {
    if (!isUuid(id)) return { ok: false, error: "Ungültige Kennung." };

    const error = validateInput(input);
    if (error) return { ok: false, error };

    const [current] = await db
        .select({
            audience: surveys.audience,
            anonymous: surveys.anonymous,
            publicEnabled: surveys.publicEnabled,
            publicTokenHash: surveys.publicTokenHash
        })
        .from(surveys)
        .where(eq(surveys.id, id))
        .limit(1);

    if (!current) return { ok: false, error: "Die Umfrage wurde nicht gefunden." };

    const audience = input.audience ?? current.audience;
    const anonymous = input.anonymous ?? current.anonymous;

    /**
     * Die Gegenrichtung zu `createPublicLink`: dort wird `member` gar nicht
     * erst freigegeben, hier lässt sich eine freigegebene Umfrage nicht
     * nachträglich auf `member` umstellen. Ohne diese Sperre bliebe ein Link
     * stehen, über den niemand mehr antworten könnte.
     */
    if (audience === "member" && audience !== current.audience && hasLink(current)) {
        return {
            ok: false,
            error: "Solange der öffentliche Link aktiv ist, lässt sich die Umfrage nicht auf „je Mitglied“ umstellen. Widerrufe zuerst den Link."
        };
    }

    if (audience !== current.audience || anonymous !== current.anonymous) {
        if ((await countResponses(id)) > 0) {
            return {
                ok: false,
                error:
                    audience !== current.audience
                        ? "Sobald Antworten vorliegen, lässt sich nicht mehr ändern, wer antwortet. Lege dafür eine neue Umfrage an."
                        : "Sobald Antworten vorliegen, lässt sich die Anonymität nicht mehr ändern. Lege dafür eine neue Umfrage an."
            };
        }
    }

    await db
        .update(surveys)
        .set({
            title: input.title.trim(),
            description: input.description?.trim() ?? "",
            audience,
            anonymous,
            eventId: isUuid(input.eventId) ? input.eventId : null,
            opensAt: validDate(input.opensAt),
            closesAt: validDate(input.closesAt),
            multiplePerUser: input.multiplePerUser ?? false,
            updatedAt: new Date()
        })
        .where(eq(surveys.id, id));

    return { ok: true };
}

/**
 * Status setzen -- mit den Prüfungen, die zum Veröffentlichen gehören.
 *
 * Eine Umfrage ohne Frage oder mit einer Auswahl ohne Optionen ist im
 * Formular eine Sackgasse. Sie fällt niemandem auf, solange sie ein Entwurf
 * ist; sie fällt allen auf, sobald sie veröffentlicht wurde.
 */
export async function setSurveyStatus(
    id: string,
    status: SurveyStatus
): Promise<{ ok: boolean; error?: string }> {
    if (!isUuid(id)) return { ok: false, error: "Ungültige Kennung." };

    if (status === "published") {
        const fieldRows = await db
            .select()
            .from(surveyFields)
            .where(eq(surveyFields.surveyId, id))
            .orderBy(asc(surveyFields.position), asc(surveyFields.id));

        if (fieldRows.length === 0) {
            return {
                ok: false,
                error: "Eine Umfrage ohne Fragen lässt sich nicht veröffentlichen. Lege zuerst mindestens eine Frage an."
            };
        }

        const empty = fieldRows.find(
            (row) => needsOptions(row.type) && (row.options ?? []).length === 0
        );

        if (empty) {
            return {
                ok: false,
                error: `Die Frage „${empty.label}“ ist eine Auswahl ohne Optionen und ließe sich nicht beantworten.`
            };
        }
    }

    const rows = await db
        .update(surveys)
        .set({ status, updatedAt: new Date() })
        .where(eq(surveys.id, id))
        .returning({ id: surveys.id });

    if (rows.length === 0) return { ok: false, error: "Die Umfrage wurde nicht gefunden." };
    return { ok: true };
}

export async function deleteSurvey(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    const rows = await db.delete(surveys).where(eq(surveys.id, id)).returning({ id: surveys.id });
    return rows.length > 0;
}

export async function setSurveyShares(
    surveyId: string,
    shares: { targetKind: ShareTargetKind; targetId: string }[]
): Promise<void> {
    if (!isUuid(surveyId)) return;

    await withTransaction(async (tx) => {
        await tx.delete(surveyShares).where(eq(surveyShares.surveyId, surveyId));

        const valid = shares.filter((share) => isUuid(share.targetId));
        if (valid.length === 0) return;

        await tx
            .insert(surveyShares)
            .values(valid.map((share) => ({ surveyId, ...share })))
            .onConflictDoNothing();
    });
}

// ---------------------------------------------------------------------------
// Öffentlicher Link
// ---------------------------------------------------------------------------

/**
 * Der Abdruck des Tokens -- dieselbe Bauart wie bei Sitzungen und
 * Kalender-Abos. Ein Lesezugriff auf die Datenbank ergibt damit keinen
 * benutzbaren Link.
 */
function hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
}

/** Trägt die Umfrage einen Link, über den geantwortet werden kann? */
function hasLink(row: { publicEnabled: boolean; publicTokenHash: string | null }): boolean {
    return row.publicEnabled && row.publicTokenHash !== null;
}

/**
 * Die Meldung steht an drei Stellen und deshalb genau einmal hier: beim
 * Freigeben, beim Ändern der Freigabe und beim Antworten über den Link.
 */
const MEMBER_NOT_PUBLIC =
    "Eine Umfrage, die je Mitglied beantwortet wird, lässt sich nicht extern freigeben -- ohne Anmeldung ist kein Mitglied bekannt. Stelle sie auf „je Zugang“ um.";

export interface PublicLinkInput {
    nameMode?: PublicNameMode;
    /** `null` hebt einen Ablauf auf, `undefined` lässt ihn stehen. */
    expiresAt?: Date | null;
}

/**
 * Erzeugt (oder ersetzt) den öffentlichen Link.
 *
 * Das Token wird GENAU EINMAL zurückgegeben und danach nirgends mehr lesbar --
 * gespeichert ist nur sein Abdruck. Wer den Link verliert, erzeugt einen
 * neuen; der alte stirbt dabei, weil sein Abdruck überschrieben wird. Das ist
 * kein Mangel, sondern der Sinn: ein Link, der sich jederzeit nachschlagen
 * lässt, ist ein Passwort im Klartext.
 */
export async function createPublicLink(
    surveyId: string,
    input: PublicLinkInput = {}
): Promise<{ ok: boolean; token?: string; error?: string }> {
    if (!isUuid(surveyId)) return { ok: false, error: "Ungültige Kennung." };

    const [current] = await db
        .select({
            audience: surveys.audience,
            publicNameMode: surveys.publicNameMode,
            publicExpiresAt: surveys.publicExpiresAt
        })
        .from(surveys)
        .where(eq(surveys.id, surveyId))
        .limit(1);

    if (!current) return { ok: false, error: "Die Umfrage wurde nicht gefunden." };
    if (current.audience === "member") return { ok: false, error: MEMBER_NOT_PUBLIC };

    // 32 Byte, base64url -- lang genug, dass Raten aussichtslos ist.
    const token = crypto.randomBytes(32).toString("base64url");

    await db
        .update(surveys)
        .set({
            publicEnabled: true,
            publicTokenHash: hashToken(token),
            publicNameMode: normalizeNameMode(input.nameMode ?? current.publicNameMode),
            publicExpiresAt:
                input.expiresAt === undefined
                    ? current.publicExpiresAt
                    : validDate(input.expiresAt),
            updatedAt: new Date()
        })
        .where(eq(surveys.id, surveyId));

    return { ok: true, token };
}

/**
 * Ändert Namensmodus und Ablauf, ohne ein neues Token zu erzeugen.
 *
 * Bewusst getrennt von `createPublicLink`: wer nur den Ablauf verschiebt, will
 * nicht, dass der Link, den er gerade verschickt hat, dabei stirbt.
 */
export async function updatePublicLink(
    surveyId: string,
    input: PublicLinkInput
): Promise<{ ok: boolean; error?: string }> {
    if (!isUuid(surveyId)) return { ok: false, error: "Ungültige Kennung." };

    const [current] = await db
        .select({
            audience: surveys.audience,
            publicEnabled: surveys.publicEnabled,
            publicTokenHash: surveys.publicTokenHash,
            publicNameMode: surveys.publicNameMode,
            publicExpiresAt: surveys.publicExpiresAt
        })
        .from(surveys)
        .where(eq(surveys.id, surveyId))
        .limit(1);

    if (!current) return { ok: false, error: "Die Umfrage wurde nicht gefunden." };
    if (current.audience === "member") return { ok: false, error: MEMBER_NOT_PUBLIC };
    if (!current.publicTokenHash) {
        return {
            ok: false,
            error: "Für diese Umfrage gibt es noch keinen öffentlichen Link. Erzeuge zuerst einen."
        };
    }

    await db
        .update(surveys)
        .set({
            publicNameMode: normalizeNameMode(input.nameMode ?? current.publicNameMode),
            publicExpiresAt:
                input.expiresAt === undefined
                    ? current.publicExpiresAt
                    : validDate(input.expiresAt),
            updatedAt: new Date()
        })
        .where(eq(surveys.id, surveyId));

    return { ok: true };
}

/**
 * Schaltet die Freigabe ab und löscht den Abdruck.
 *
 * Der Abdruck muss weg, nicht nur das Häkchen: bliebe er stehen, wäre der alte
 * Link mit einem erneuten Freischalten wieder gültig -- und niemand wüsste
 * mehr, wer ihn inzwischen hat. Der Ablauf fällt mit, damit ein später neu
 * erzeugter Link nicht eine längst vergangene Frist erbt.
 */
export async function revokePublicLink(
    surveyId: string
): Promise<{ ok: boolean; error?: string }> {
    if (!isUuid(surveyId)) return { ok: false, error: "Ungültige Kennung." };

    const rows = await db
        .update(surveys)
        .set({
            publicEnabled: false,
            publicTokenHash: null,
            publicExpiresAt: null,
            updatedAt: new Date()
        })
        .where(eq(surveys.id, surveyId))
        .returning({ id: surveys.id });

    if (rows.length === 0) return { ok: false, error: "Die Umfrage wurde nicht gefunden." };
    return { ok: true };
}

/**
 * Löst ein Token auf.
 *
 * KEINE Rechteprüfung -- das Token IST der Ausweis. Geprüft wird nur, ob der
 * Link überhaupt noch gilt: unbekannt, abgeschaltet oder abgelaufen ergibt
 * `null`. Ob die Umfrage gerade Antworten annimmt (Entwurf, abgeschlossen,
 * Zeitfenster), entscheidet die Route: sie soll einen Entwurf als „noch nicht
 * verfügbar“ anzeigen können, statt eine Seite zu zeigen, die einen falschen
 * Link vermuten lässt. `submitResponse` prüft dasselbe noch einmal selbst.
 *
 * Die Freigabeliste bleibt hier LEER: Gruppen-, Amts- und Rollennamen gehen
 * niemanden etwas an, der die Umfrage nur über den Link kennt.
 */
export async function resolvePublicSurvey(token: string): Promise<SurveyEntry | null> {
    if (!token) return null;

    const [row] = await db
        .select({ survey: surveys, eventTitle: events.title })
        .from(surveys)
        .leftJoin(events, eq(events.id, surveys.eventId))
        .where(eq(surveys.publicTokenHash, hashToken(token)))
        .limit(1);

    if (!row) return null;
    if (!row.survey.publicEnabled) return null;
    if (row.survey.publicExpiresAt && row.survey.publicExpiresAt.getTime() < Date.now()) {
        return null;
    }

    const [fieldRows, countRows] = await Promise.all([
        db
            .select()
            .from(surveyFields)
            .where(eq(surveyFields.surveyId, row.survey.id))
            .orderBy(asc(surveyFields.position), asc(surveyFields.id)),
        db
            .select({ count: sql<number>`count(*)::int` })
            .from(surveyResponses)
            .where(eq(surveyResponses.surveyId, row.survey.id))
    ]);

    return toEntry(
        row.survey,
        row.eventTitle,
        fieldRows,
        [],
        new Map(),
        Number(countRows[0]?.count ?? 0)
    );
}

/** Eine ganze Zahl aus dem Formular -- alles andere wird zu `null`. */
function intOrNull(value: number | null | undefined): number | null {
    return Number.isInteger(value) ? (value as number) : null;
}

/** Die Spalten einer Frage, wie sie aus einer Eingabe hervorgehen. */
function fieldColumns(field: SurveyFieldInput) {
    return {
        type: field.type,
        label: field.label.trim(),
        help: field.help?.trim() ?? "",
        required: field.required ?? false,
        allowOther: allowsOther(field.type) ? (field.allowOther ?? false) : false,
        minValue: hasRange(field.type) ? intOrNull(field.minValue) : null,
        maxValue: hasRange(field.type) ? intOrNull(field.maxValue) : null,
        options: needsOptions(field.type) ? mergeOptionValues(field.options ?? []) : []
    };
}

/**
 * Setzt die Fragenliste neu.
 *
 * Ohne Antworten ist alles erlaubt -- die Liste ist dann nichts als ein
 * Entwurf. Sobald Antworten vorliegen, gilt Punkt 4 aus dem Schemakommentar:
 * die Liste darf WACHSEN, aber nicht schrumpfen.
 *
 *   - Eintrag MIT bekannter `id`: Beschriftung, Hilfetext, Pflicht, Optionen,
 *     „Sonstiges“ und Grenzen dürfen sich ändern. Der TYP nicht -- eine
 *     Auswahl, die nachträglich zum Datum wird, macht aus jeder bereits
 *     abgegebenen Antwort einen Wert, den es in diesem Feld nie geben konnte.
 *   - Eintrag OHNE `id`: eine neue Frage, immer erlaubt. Die Auswertung weist
 *     sie als „von X der Y Antworten beantwortet“ aus.
 *   - Eine bekannte `id`, die FEHLT: das wäre Löschen und wird abgewiesen,
 *     samt Nennung der Frage -- sonst stünden Antworten ohne Feld da.
 *
 * Eine `id`, die zu einer ANDEREN Umfrage gehört, gilt als „ohne id“. Ein
 * Formular darf unter keinen Umständen fremde Felder umschreiben.
 *
 * Alles in EINER Transaktion, Positionen lückenlos ab 0 neu vergeben: eine
 * halb geschriebene Fragenliste wäre nicht zu reparieren.
 */
export async function setSurveyFields(
    surveyId: string,
    fields: SurveyFieldInput[]
): Promise<{ ok: boolean; error?: string }> {
    if (!isUuid(surveyId)) return { ok: false, error: "Ungültige Kennung." };

    const wanted = fields.filter((field) => field.label?.trim());

    const broken = wanted.find((field) => {
        const columns = fieldColumns(field);
        return (
            columns.minValue !== null &&
            columns.maxValue !== null &&
            columns.minValue > columns.maxValue
        );
    });

    if (broken) {
        return {
            ok: false,
            error: `Bei der Frage „${broken.label.trim()}“ liegt der kleinste Wert über dem größten. So ließe sie sich nicht beantworten.`
        };
    }

    return withTransaction(async (tx) => {
        const existing = await tx
            .select()
            .from(surveyFields)
            .where(eq(surveyFields.surveyId, surveyId))
            .orderBy(asc(surveyFields.position), asc(surveyFields.id));

        const answered = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(surveyResponses)
            .where(eq(surveyResponses.surveyId, surveyId));

        const locked = Number(answered[0]?.count ?? 0) > 0;
        const byId = new Map(existing.map((row) => [row.id, row]));

        /**
         * Eine Kennung zählt nur beim ERSTEN Mal. Wer sie zweimal schickt,
         * bekommt beim zweiten Mal eine neue Frage -- zwei Zeilen unter
         * derselben Kennung gäbe es sonst gar nicht erst zu schreiben.
         */
        const taken = new Set<string>();
        const plan = wanted.map((field) => {
            const id =
                isUuid(field.id) && byId.has(field.id) && !taken.has(field.id)
                    ? field.id
                    : null;
            if (id) taken.add(id);
            return { id, columns: fieldColumns(field) };
        });

        if (locked) {
            for (const entry of plan) {
                if (!entry.id) continue;
                const before = byId.get(entry.id)!;
                if (before.type !== entry.columns.type) {
                    return {
                        ok: false,
                        error: `Die Frage „${before.label}“ lässt sich nicht in einen anderen Typ ändern, weil bereits Antworten vorliegen.`
                    };
                }
            }

            const missing = existing.find((row) => !taken.has(row.id));
            if (missing) {
                return {
                    ok: false,
                    error: `Die Frage „${missing.label}“ lässt sich nicht mehr löschen, weil bereits Antworten vorliegen. Du kannst sie umbenennen oder weitere Fragen ergänzen.`
                };
            }
        }

        const removed = existing.filter((row) => !taken.has(row.id)).map((row) => row.id);
        if (removed.length > 0) {
            await tx.delete(surveyFields).where(inArray(surveyFields.id, removed));
        }

        const inserts: (typeof surveyFields.$inferInsert)[] = [];

        for (const [position, entry] of plan.entries()) {
            if (entry.id) {
                await tx
                    .update(surveyFields)
                    .set({ ...entry.columns, position })
                    .where(
                        and(
                            eq(surveyFields.id, entry.id),
                            eq(surveyFields.surveyId, surveyId)
                        )
                    );
                continue;
            }

            inserts.push({ surveyId, position, ...entry.columns });
        }

        if (inserts.length > 0) await tx.insert(surveyFields).values(inserts);

        return { ok: true };
    });
}

// ---------------------------------------------------------------------------
// Antworten
// ---------------------------------------------------------------------------

/**
 * Prüft die abgegebenen Antworten gegen die Feldliste -- ohne Datenbank.
 *
 * Der Rückgabewert ist `null`, wenn alles passt, sonst eine Zuordnung von
 * Feldkennung auf einen deutschen Satz, den die Oberfläche direkt unter dem
 * Feld anzeigt.
 *
 * Eine UNBEKANNTE Feldkennung wird still übergangen. Das ist Absicht: ein
 * Formular, das offen lag, während jemand ein Feld gelöscht hat, muss sich
 * trotzdem absenden lassen. Der umgekehrte Weg -- ein Fehler auf ein Feld,
 * das es nicht mehr gibt -- führte zu einem Formular, das sich nicht mehr
 * abschicken lässt und dessen Fehlermeldung nirgends erscheint.
 *
 * Zu lange Texte werden ABGEWIESEN und nicht gekürzt: ein still abgeschnittener
 * Text sieht in der Auswertung aus wie eine vollständige Antwort.
 */
export function validateAnswers(
    fields: SurveyFieldEntry[],
    answers: SubmittedAnswer[]
): Record<string, string> | null {
    const errors: Record<string, string> = {};
    const byField = new Map<string, SubmittedAnswer>();

    for (const answer of answers) {
        if (!fields.some((field) => field.id === answer.fieldId)) continue;
        byField.set(answer.fieldId, answer);
    }

    for (const field of fields) {
        /**
         * Ein Abschnitt ist eine Zwischenüberschrift und kein Eingabefeld.
         * `required` bleibt daran wirkungslos -- sonst ließe sich ein Formular
         * mit einer Überschrift als Pflichtfeld nie absenden.
         */
        if (!expectsAnswer(field.type)) continue;

        const answer = byField.get(field.id);
        const text = (answer?.value ?? "").trim();
        const chosen = chosenValues(answer);
        const allowed = new Set(
            field.type === "boolean"
                ? (BOOLEAN_VALUES as readonly string[])
                : field.options.map((option) => option.value)
        );

        // „Sonstiges“ ist ein gültiger Wert, sobald die Frage ihn anbietet.
        const other = allowsOther(field.type) && field.allowOther;
        if (other) allowed.add(OTHER_VALUE);

        switch (field.type) {
            case "text":
            case "longtext": {
                const limit = field.type === "text" ? MAX_TEXT : MAX_LONGTEXT;
                if (!text) {
                    if (field.required) errors[field.id] = "Bitte ausfüllen.";
                } else if (text.length > limit) {
                    errors[field.id] = `Höchstens ${limit} Zeichen, aktuell ${text.length}.`;
                }
                break;
            }

            case "single": {
                if (chosen.length === 0) {
                    if (field.required) errors[field.id] = "Bitte eine Antwort auswählen.";
                } else if (chosen.length > 1) {
                    errors[field.id] = "Bitte genau eine Antwort auswählen.";
                } else if (!allowed.has(chosen[0])) {
                    errors[field.id] = "Diese Antwort steht nicht zur Auswahl.";
                }
                break;
            }

            case "multi": {
                if (chosen.length === 0) {
                    if (field.required) {
                        errors[field.id] = "Bitte mindestens eine Antwort auswählen.";
                    }
                } else if (chosen.some((value) => !allowed.has(value))) {
                    errors[field.id] = "Eine der gewählten Antworten steht nicht zur Auswahl.";
                }
                break;
            }

            case "boolean": {
                if (chosen.length === 0) {
                    if (field.required) errors[field.id] = "Bitte „Ja“ oder „Nein“ wählen.";
                } else if (chosen.length > 1 || !allowed.has(chosen[0])) {
                    errors[field.id] = "Bitte „Ja“ oder „Nein“ wählen.";
                }
                break;
            }

            case "number": {
                if (!text) {
                    if (field.required) errors[field.id] = "Bitte eine Zahl angeben.";
                    break;
                }

                if (!INTEGER_PATTERN.test(text)) {
                    errors[field.id] = "Bitte eine ganze Zahl angeben.";
                    break;
                }

                const number = Number(text);
                if (field.minValue !== null && number < field.minValue) {
                    errors[field.id] = `Bitte einen Wert ab ${field.minValue} angeben.`;
                } else if (field.maxValue !== null && number > field.maxValue) {
                    errors[field.id] = `Bitte einen Wert bis ${field.maxValue} angeben.`;
                }
                break;
            }

            case "date": {
                if (!text) {
                    if (field.required) errors[field.id] = "Bitte ein Datum angeben.";
                    break;
                }

                if (!DATE_PATTERN.test(text)) {
                    errors[field.id] = "Bitte ein Datum im Format JJJJ-MM-TT angeben.";
                } else if (!isRealDay(text)) {
                    errors[field.id] = "Diesen Kalendertag gibt es nicht.";
                }
                break;
            }

            case "email": {
                if (!text) {
                    if (field.required) errors[field.id] = "Bitte eine E-Mail-Adresse angeben.";
                } else if (text.length > MAX_TEXT) {
                    errors[field.id] = `Höchstens ${MAX_TEXT} Zeichen, aktuell ${text.length}.`;
                } else if (!EMAIL_PATTERN.test(text)) {
                    errors[field.id] = "Bitte eine gültige E-Mail-Adresse angeben.";
                }
                break;
            }

            case "phone": {
                if (!text) {
                    if (field.required) errors[field.id] = "Bitte eine Telefonnummer angeben.";
                } else if (!PHONE_PATTERN.test(text)) {
                    errors[field.id] =
                        "Eine Telefonnummer darf nur Ziffern, Leerzeichen, +, /, - und Klammern enthalten.";
                } else if ((text.match(/\d/g) ?? []).length < MIN_PHONE_DIGITS) {
                    errors[field.id] =
                        `Bitte eine vollständige Telefonnummer mit mindestens ${MIN_PHONE_DIGITS} Ziffern angeben.`;
                }
                break;
            }

            case "scale": {
                const { min, max } = scaleRange(field);

                if (!text) {
                    if (field.required) {
                        errors[field.id] = `Bitte einen Wert zwischen ${min} und ${max} wählen.`;
                    }
                    break;
                }

                const step = Number(text);
                if (!INTEGER_PATTERN.test(text) || step < min || step > max) {
                    errors[field.id] = `Bitte einen Wert zwischen ${min} und ${max} wählen.`;
                }
                break;
            }
        }

        /**
         * Der Freitext neben „Sonstiges“ zählt nur, wenn „Sonstiges“ auch
         * gewählt wurde. Ein Text zu einer nicht gewählten Zeile ist ein
         * Überbleibsel im Formular und kein Fehler -- er wird verworfen
         * (`storableAnswers`), nicht beanstandet.
         */
        if (other && !errors[field.id] && chosen.includes(OTHER_VALUE)) {
            const extra = (answer?.otherValue ?? "").trim();
            if (!extra) {
                errors[field.id] = "Bitte ergänze deine Antwort neben „Sonstiges“.";
            } else if (extra.length > MAX_OTHER) {
                errors[field.id] = `Höchstens ${MAX_OTHER} Zeichen, aktuell ${extra.length}.`;
            }
        }
    }

    return Object.keys(errors).length > 0 ? errors : null;
}

/** Ganze Zahl, wahlweise mit Vorzeichen -- „1.5“ und „ “ fallen durch. */
const INTEGER_PATTERN = /^[+-]?\d+$/;

/** Die Form, die ein `<input type="date">` liefert. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Schlichte Formprüfung, wie sonst im Portal auch: etwas, ein Klammeraffe,
 * etwas mit Punkt. Mehr ist an einer Adresse ohne Zustellversuch nicht zu
 * erkennen -- ein strengerer Ausdruck weist am Ende nur gültige Adressen ab.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Ziffern, Leerzeichen, +, /, - und Klammern -- wie überall notiert. */
const PHONE_PATTERN = /^[0-9 +/()-]+$/;

/**
 * Gibt es diesen Kalendertag wirklich?
 *
 * `new Date("2026-02-31")` ergibt lautlos den 3. März. Deshalb wird
 * zurückgerechnet: nur wenn Jahr, Monat und Tag die Umrechnung unverändert
 * überstehen, war das Datum echt.
 */
function isRealDay(value: string): boolean {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    );
}

/**
 * Die gewählten Werte einer Antwort, egal ob sie als `value` oder als
 * `values` ankamen.
 *
 * Beide Wege zusammenzuführen ist kein Entgegenkommen an ein schlampiges
 * Formular, sondern die Absicherung: nur so fällt auf, wenn jemand einer
 * Einfachauswahl zwei Werte unterschiebt.
 */
function chosenValues(answer: SubmittedAnswer | undefined): string[] {
    if (!answer) return [];
    const raw = [...(answer.values ?? []), ...(answer.value ? [answer.value] : [])];
    return raw.map((value) => value.trim()).filter(Boolean);
}

/** Signalisiert eine Teilnahme, die zwischen Prüfung und Schreiben eintraf. */
class DuplicateParticipation extends Error {}

export interface SubmitInput {
    surveyId: string;
    userId: string | null;
    memberId?: string | null;
    answers: SubmittedAnswer[];
    /** `"link"` steht für eine Antwort ohne Anmeldung; Vorgabe `"intern"`. */
    source?: SurveySource;
    /** Der selbst angegebene Name -- nur bei `source: "link"` von Belang. */
    publicName?: string;
}

/** Feldschlüssel des Namensfeldes im öffentlichen Formular. */
export const PUBLIC_NAME_FIELD = "__name";

/**
 * Eine Antwort abgeben.
 *
 * Die Reihenfolge ist wichtig und steht deshalb ausgeschrieben da:
 *
 *   1. Kennungen prüfen -- eine krumme UUID wirft in PostgreSQL sonst 22P02.
 *   2. Umfrage laden: gefunden, veröffentlicht, im Antwortzeitraum?
 *   3. Bei `source: "link"`: gilt der Link noch, und passt der Name?
 *   4. Passt der Antwortende zur `audience`?
 *   5. Schon geantwortet? Anonym über `survey_participants`, sonst über den
 *      `dedupeKey` -- und dort wird ersetzt statt abgewiesen.
 *   6. Felder laden und `validateAnswers`.
 *   7. Alles Schreiben in EINER Transaktion.
 *
 * Punkt 7 ist der eigentliche Grund für diese Ordnung: eine Antwortzeile ohne
 * ihre Antworten oder eine Teilnahmemarke ohne Antwort würde die Auswertung
 * dauerhaft vergiften, und niemand würde es bemerken.
 *
 * Das Formular ist dabei keine Absicherung -- jede dieser Prüfungen muss auch
 * dann halten, wenn jemand das Formular nachbaut. Beim öffentlichen Link gilt
 * das doppelt: dort gibt es keine Anmeldung, die vorher etwas ausgeschlossen
 * hätte.
 */
export async function submitResponse(input: SubmitInput): Promise<{
    ok: boolean;
    id?: string;
    error?: string;
    fieldErrors?: Record<string, string>;
}> {
    if (!isUuid(input.surveyId)) return { ok: false, error: "Ungültige Kennung." };
    if (input.userId !== null && !isUuid(input.userId)) {
        return { ok: false, error: "Ungültige Kennung." };
    }
    if (input.memberId != null && !isUuid(input.memberId)) {
        return { ok: false, error: "Ungültige Kennung." };
    }

    const [survey] = await db
        .select()
        .from(surveys)
        .where(eq(surveys.id, input.surveyId))
        .limit(1);

    if (!survey) return { ok: false, error: "Die Umfrage wurde nicht gefunden." };
    if (survey.status === "draft") {
        return { ok: false, error: "Diese Umfrage ist noch ein Entwurf und nimmt keine Antworten an." };
    }
    if (survey.status === "closed") {
        return { ok: false, error: "Diese Umfrage ist abgeschlossen und nimmt keine Antworten mehr an." };
    }

    const now = Date.now();
    if (survey.opensAt && survey.opensAt.getTime() > now) {
        return { ok: false, error: "Diese Umfrage ist noch nicht geöffnet." };
    }
    if (survey.closesAt && survey.closesAt.getTime() < now) {
        return { ok: false, error: "Der Antwortzeitraum ist abgelaufen." };
    }

    const memberId = isUuid(input.memberId) ? input.memberId : null;
    const source: SurveySource = input.source === "link" ? "link" : "intern";

    /**
     * Der selbst angegebene Name -- nur über den Link, und nur wenn er
     * überhaupt erhoben wird.
     *
     * Bei einer ANONYMEN Umfrage wird er verworfen wie bei `none`: ein Name in
     * der Antwortzeile hebt die Anonymität auf, und Regel 3 dieses Dienstes
     * kennt dafür keine Ausnahme.
     */
    let publicName = "";

    if (source === "link") {
        if (!hasLink(survey)) {
            return { ok: false, error: "Dieser Link ist nicht mehr gültig." };
        }
        if (survey.publicExpiresAt && survey.publicExpiresAt.getTime() < now) {
            return { ok: false, error: "Dieser Link ist nicht mehr gültig." };
        }
        if (survey.audience !== "user") {
            return { ok: false, error: MEMBER_NOT_PUBLIC };
        }

        const nameMode = survey.anonymous ? "none" : normalizeNameMode(survey.publicNameMode);

        if (nameMode !== "none") {
            publicName = (input.publicName ?? "").trim().slice(0, MAX_PUBLIC_NAME);
        }

        if (nameMode === "required" && !publicName) {
            return {
                ok: false,
                error: "Bitte die markierten Felder prüfen.",
                fieldErrors: { [PUBLIC_NAME_FIELD]: "Bitte gib deinen Namen an." }
            };
        }
    }

    if (survey.audience === "member" && !memberId) {
        return {
            ok: false,
            error: "Diese Umfrage wird je Mitglied beantwortet. Mit deinem Zugang ist dafür kein Mitglied verknüpft."
        };
    }
    if (survey.audience === "user" && !input.userId && source !== "link") {
        return { ok: false, error: "Für diese Umfrage ist eine Anmeldung nötig." };
    }

    /**
     * Wer als Teilnehmer zählt: bei `member` das Mitglied, sonst der Zugang.
     * Über den Link gibt es KEINEN Teilnehmer -- dort ist niemand bekannt,
     * dessen zweite Antwort sich verlässlich erkennen ließe.
     */
    const subjectId =
        source === "link" ? null : survey.audience === "member" ? memberId! : input.userId!;

    /**
     * Der Schlüssel gegen Mehrfachantworten -- oder NULL.
     *
     * NULL bei anonymen Umfragen (dort zählt `survey_participants`), bei
     * `multiplePerUser` (dort ist die zweite Antwort erwünscht) und bei jeder
     * Antwort über den Link: ohne Anmeldung ist mehrfaches Absenden nicht
     * sicher zu verhindern, und ein Schlüssel, der es nur so aussehen ließe
     * (Adresse, Browser, Name), wäre eine Zusage, die nicht hält. Wer das
     * braucht, verschickt keinen offenen Link. PostgreSQL behandelt NULLs in
     * der Eindeutigkeit als verschieden; genau deshalb dürfen sie beliebig oft
     * nebeneinander stehen.
     */
    const dedupeKey =
        subjectId === null || survey.anonymous || survey.multiplePerUser
            ? null
            : `${survey.audience === "member" ? "m" : "u"}:${subjectId}`;

    if (survey.anonymous && subjectId) {
        const [taken] = await db
            .select({ subjectId: surveyParticipants.subjectId })
            .from(surveyParticipants)
            .where(
                and(
                    eq(surveyParticipants.surveyId, survey.id),
                    eq(surveyParticipants.subjectKind, survey.audience),
                    eq(surveyParticipants.subjectId, subjectId)
                )
            )
            .limit(1);

        if (taken) {
            return {
                ok: false,
                error: "Du hast an dieser anonymen Umfrage bereits teilgenommen. Eine anonyme Antwort lässt sich nicht ändern."
            };
        }
    }

    const fieldRows = await db
        .select()
        .from(surveyFields)
        .where(eq(surveyFields.surveyId, survey.id))
        .orderBy(asc(surveyFields.position), asc(surveyFields.id));

    const fields = fieldRows.map(toFieldEntry);

    const fieldErrors = validateAnswers(fields, input.answers);
    if (fieldErrors) {
        return {
            ok: false,
            error: "Bitte die markierten Felder prüfen.",
            fieldErrors
        };
    }

    const rows = storableAnswers(fields, input.answers);

    try {
        const id = await withTransaction(async (tx) => {
            /**
             * Anonym heißt: KEIN Absender in der Antwortzeile. Weder `userId`
             * noch `memberId` -- eine Anonymität, die den Absender speichert
             * und ihn nur beim Anzeigen weglässt, hält bis zur ersten
             * Fehlersuche.
             */
            if (survey.anonymous && subjectId) {
                const marked = await tx
                    .insert(surveyParticipants)
                    .values({
                        surveyId: survey.id,
                        subjectKind: survey.audience,
                        subjectId
                    })
                    .onConflictDoNothing()
                    .returning({ subjectId: surveyParticipants.subjectId });

                // Zwei gleichzeitige Absendungen: die zweite verliert hier.
                if (marked.length === 0) throw new DuplicateParticipation();
            }

            if (dedupeKey) {
                // Die vorhandene Antwort wird ERSETZT, nicht ergänzt.
                await tx
                    .delete(surveyResponses)
                    .where(
                        and(
                            eq(surveyResponses.surveyId, survey.id),
                            eq(surveyResponses.dedupeKey, dedupeKey)
                        )
                    );
            }

            const [response] = await tx
                .insert(surveyResponses)
                .values({
                    surveyId: survey.id,
                    // Über den Link gibt es keinen Zugang, den man vermerken könnte.
                    userId: survey.anonymous || source === "link" ? null : input.userId,
                    memberId: survey.anonymous || source === "link" ? null : memberId,
                    dedupeKey,
                    source,
                    publicName,
                    submittedAt: new Date()
                })
                .returning({ id: surveyResponses.id });

            if (rows.length > 0) {
                await tx
                    .insert(surveyAnswers)
                    .values(rows.map((row) => ({ responseId: response.id, ...row })));
            }

            return response.id;
        });

        return { ok: true, id };
    } catch (err) {
        if (err instanceof DuplicateParticipation) {
            return {
                ok: false,
                error: "Du hast an dieser anonymen Umfrage bereits teilgenommen. Eine anonyme Antwort lässt sich nicht ändern."
            };
        }
        throw err;
    }
}

/**
 * Aus den geprüften Antworten die Zeilen für `survey_answers`.
 *
 * Leere Antworten auf freiwillige Felder werden gar nicht erst geschrieben:
 * die Auswertung zählt damit „ausgefüllt“ ohne Sonderfall, und eine leere
 * Zeile trüge keine Information.
 *
 * Der Freitext neben „Sonstiges“ wird nur mitgeschrieben, wenn „Sonstiges“
 * auch gewählt ist -- sonst bliebe im Ergebnis ein Text stehen, zu dem es
 * keine Stimme gibt.
 */
function storableAnswers(
    fields: SurveyFieldEntry[],
    answers: SubmittedAnswer[]
): { fieldId: string; value: string; values: string[]; otherValue: string }[] {
    const byField = new Map(answers.map((answer) => [answer.fieldId, answer]));
    const rows: { fieldId: string; value: string; values: string[]; otherValue: string }[] = [];

    for (const field of fields) {
        // Ein Abschnitt trägt keine Antwort -- auch keine untergeschobene.
        if (!expectsAnswer(field.type)) continue;

        const answer = byField.get(field.id);
        if (!answer) continue;

        const other = (value: readonly string[]) =>
            allowsOther(field.type) && field.allowOther && value.includes(OTHER_VALUE)
                ? (answer.otherValue ?? "").trim().slice(0, MAX_OTHER)
                : "";

        if (field.type === "multi") {
            const values = [...new Set(chosenValues(answer))];
            if (values.length === 0) continue;
            rows.push({ fieldId: field.id, value: "", values, otherValue: other(values) });
            continue;
        }

        const value =
            field.type === "text" || field.type === "longtext"
                ? (answer.value ?? "").trim()
                : (chosenValues(answer)[0] ?? "");

        if (!value) continue;
        rows.push({ fieldId: field.id, value, values: [], otherValue: other([value]) });
    }

    return rows;
}

/**
 * Nimmt eine Antwort zurück.
 *
 * Anonyme Umfragen sind ausgenommen -- dort gibt es keinen Weg von der Person
 * zur Antwort, und genau das ist der Sinn. Die Oberfläche sagt das vorher.
 */
export async function withdrawResponse(
    surveyId: string,
    subject: { userId?: string | null; memberId?: string | null }
): Promise<{ ok: boolean; error?: string }> {
    if (!isUuid(surveyId)) return { ok: false, error: "Ungültige Kennung." };

    const [survey] = await db
        .select({ anonymous: surveys.anonymous, audience: surveys.audience })
        .from(surveys)
        .where(eq(surveys.id, surveyId))
        .limit(1);

    if (!survey) return { ok: false, error: "Die Umfrage wurde nicht gefunden." };
    if (survey.anonymous) {
        return {
            ok: false,
            error: "Eine anonyme Antwort lässt sich nicht zurücknehmen -- sie ist keinem Zugang zugeordnet."
        };
    }

    const id = survey.audience === "member" ? subject.memberId : subject.userId;
    if (!isUuid(id)) return { ok: false, error: "Ungültige Kennung." };

    const key = `${survey.audience === "member" ? "m" : "u"}:${id}`;

    const rows = await db
        .delete(surveyResponses)
        .where(
            and(eq(surveyResponses.surveyId, surveyId), eq(surveyResponses.dedupeKey, key))
        )
        .returning({ id: surveyResponses.id });

    if (rows.length === 0) {
        return { ok: false, error: "Es liegt keine Antwort vor, die sich zurücknehmen ließe." };
    }

    return { ok: true };
}

/**
 * Die eigenen Antworten, je Teilnehmer -- zum Vorbelegen des Formulars.
 *
 * Der Schlüssel ist `u:<zugang>` bzw. `m:<mitglied>`, dieselbe Form wie der
 * `dedupeKey`. Anonyme Umfragen liefern nichts: ihre Antworten tragen keinen
 * Absender, und ein Formular mit vorbelegten Werten würde eine Änderbarkeit
 * vortäuschen, die es dort nicht gibt.
 */
export async function getOwnResponses(
    surveyId: string,
    subject: { userId: string | null; memberIds: string[] }
): Promise<Map<string, SubmittedAnswer[]>> {
    const result = new Map<string, SubmittedAnswer[]>();
    if (!isUuid(surveyId)) return result;

    const memberIds = onlyUuids(subject.memberIds ?? []);
    const userId = isUuid(subject.userId) ? subject.userId : null;
    if (!userId && memberIds.length === 0) return result;

    const [survey] = await db
        .select({ anonymous: surveys.anonymous })
        .from(surveys)
        .where(eq(surveys.id, surveyId))
        .limit(1);

    if (!survey || survey.anonymous) return result;

    const responseRows = await db
        .select({
            id: surveyResponses.id,
            userId: surveyResponses.userId,
            memberId: surveyResponses.memberId
        })
        .from(surveyResponses)
        .where(eq(surveyResponses.surveyId, surveyId))
        .orderBy(asc(surveyResponses.submittedAt));

    /**
     * Je Teilnehmer bleibt die JÜNGSTE Antwort stehen. Ohne `multiplePerUser`
     * gibt es ohnehin nur eine; mit `multiplePerUser` wäre alles andere ein
     * Formular, in dem sich mehrere Abgaben übereinanderlegen.
     */
    const keyByResponse = new Map<string, string>();
    const responseByKey = new Map<string, string>();

    for (const row of responseRows) {
        const key = row.memberId
            ? memberIds.includes(row.memberId)
                ? `m:${row.memberId}`
                : null
            : row.userId && row.userId === userId
              ? `u:${row.userId}`
              : null;

        if (!key) continue;
        responseByKey.set(key, row.id);
    }

    for (const [key, responseId] of responseByKey) {
        keyByResponse.set(responseId, key);
        result.set(key, []);
    }

    if (keyByResponse.size === 0) return result;

    const answerRows = await db
        .select({
            responseId: surveyAnswers.responseId,
            fieldId: surveyAnswers.fieldId,
            value: surveyAnswers.value,
            values: surveyAnswers.values
        })
        .from(surveyAnswers)
        .where(inArray(surveyAnswers.responseId, [...keyByResponse.keys()]));

    for (const row of answerRows) {
        const key = keyByResponse.get(row.responseId);
        if (!key) continue;

        result
            .get(key)
            ?.push(
                row.values.length > 0
                    ? { fieldId: row.fieldId, values: row.values }
                    : { fieldId: row.fieldId, value: row.value }
            );
    }

    return result;
}

// ---------------------------------------------------------------------------
// Auswertung
// ---------------------------------------------------------------------------

/** Name eines Mitglieds, wie überall im Portal geschrieben. */
function memberName(row: {
    firstname: string;
    lastname: string;
    fahrtenname: string | null;
}): string {
    return row.fahrtenname
        ? `${row.firstname} „${row.fahrtenname}“ ${row.lastname}`
        : `${row.firstname} ${row.lastname}`;
}

/**
 * Auswertung einer Umfrage.
 *
 * Drei Abfragen und die Auszählung im Speicher: ein Stamm hat Dutzende
 * Antworten, keine Millionen, und in SQL bräuchte allein die Mehrfachauswahl
 * ein `unnest` mit eigener Gruppierung.
 *
 * `author` ist bei anonymen Umfragen null, WEIL die Spalte null ist -- nicht
 * weil hier etwas weggelassen würde. Ein Mapper, der den Absender nur beim
 * Anzeigen unterschlägt, ist keine Anonymität.
 */
export async function getResults(surveyId: string): Promise<SurveyResults | null> {
    if (!isUuid(surveyId)) return null;

    const [survey] = await db
        .select({ id: surveys.id })
        .from(surveys)
        .where(eq(surveys.id, surveyId))
        .limit(1);

    if (!survey) return null;

    const [fieldRows, responseRows] = await Promise.all([
        db
            .select()
            .from(surveyFields)
            .where(eq(surveyFields.surveyId, surveyId))
            .orderBy(asc(surveyFields.position), asc(surveyFields.id)),
        db
            .select({
                id: surveyResponses.id,
                submittedAt: surveyResponses.submittedAt,
                source: surveyResponses.source,
                publicName: surveyResponses.publicName,
                userName: users.name,
                firstname: members.firstname,
                lastname: members.lastname,
                fahrtenname: members.fahrtenname
            })
            .from(surveyResponses)
            .leftJoin(users, eq(users.id, surveyResponses.userId))
            .leftJoin(members, eq(members.id, surveyResponses.memberId))
            .where(eq(surveyResponses.surveyId, surveyId))
            .orderBy(asc(surveyResponses.submittedAt))
    ]);

    const responseIds = responseRows.map((row) => row.id);

    const answerRows =
        responseIds.length === 0
            ? []
            : await db
                  .select({
                      responseId: surveyAnswers.responseId,
                      fieldId: surveyAnswers.fieldId,
                      value: surveyAnswers.value,
                      values: surveyAnswers.values,
                      otherValue: surveyAnswers.otherValue
                  })
                  .from(surveyAnswers)
                  .where(inArray(surveyAnswers.responseId, responseIds));

    const responseById = new Map(responseRows.map((row) => [row.id, row]));

    /**
     * Wer geantwortet hat -- oder null.
     *
     * Bei einer Antwort über den Link ist das ein SELBST ANGEGEBENER Name.
     * Er wird hier nicht von einem geprüften Zugangsnamen unterschieden;
     * das erledigt die Anzeige über `source`. Ein Name aus dem Link, der
     * ungekennzeichnet neben einem geprüften stünde, wäre eine Behauptung,
     * die das Portal nicht deckt.
     */
    const authorOf = (response: (typeof responseRows)[number]): string | null => {
        if (response.source === "link") return response.publicName || null;
        if (response.firstname && response.lastname) {
            return memberName({
                firstname: response.firstname,
                lastname: response.lastname,
                fahrtenname: response.fahrtenname
            });
        }
        return response.userName ?? null;
    };

    const byField = new Map<string, typeof answerRows>();
    for (const row of answerRows) {
        const list = byField.get(row.fieldId) ?? [];
        list.push(row);
        byField.set(row.fieldId, list);
    }

    const responseCount = responseRows.length;

    const fields: SurveyResultField[] = fieldRows.map((fieldRow) => {
        const field = toFieldEntry(fieldRow);
        const rows = byField.get(field.id) ?? [];

        const texts: SurveyResultField["texts"] = [];
        const otherTexts: SurveyResultField["otherTexts"] = [];
        const tally = new Map<string, number>();
        let answered = 0;
        /** Nur für die Skala: Summe der Stufen und ihre Anzahl. */
        let scaleSum = 0;
        let scaleCount = 0;

        /*
         * Eine Zwischenüberschrift wird nie beantwortet. Sie bleibt trotzdem
         * in der Liste, damit die Auswertung dieselbe Gliederung liest wie der
         * Fragebogen -- nur eben ohne Zahlen.
         */
        if (field.type !== "section") {
            for (const row of rows) {
                const response = responseById.get(row.responseId);
                if (!response) continue;

                // Der Freitext neben „Sonstiges“ zählt nicht als eigene
                // Antwort -- die Stimme steckt schon in der Auswahl.
                if (row.otherValue) {
                    otherTexts.push({
                        value: row.otherValue,
                        author: authorOf(response),
                        source: response.source === "link" ? "link" : "intern",
                        submittedAt: response.submittedAt
                    });
                }

                if (field.type === "multi") {
                    if (row.values.length === 0) continue;
                    answered += 1;
                    for (const value of row.values) {
                        tally.set(value, (tally.get(value) ?? 0) + 1);
                    }
                    continue;
                }

                if (!row.value) continue;
                answered += 1;

                if (field.type === "scale") {
                    // Die Stufen werden gezählt UND gemittelt: die Verteilung
                    // zeigt die Streuung, der Mittelwert die Tendenz.
                    tally.set(row.value, (tally.get(row.value) ?? 0) + 1);
                    const step = Number(row.value);
                    if (Number.isFinite(step)) {
                        scaleSum += step;
                        scaleCount += 1;
                    }
                    continue;
                }

                if (isChoiceType(field.type)) {
                    tally.set(row.value, (tally.get(row.value) ?? 0) + 1);
                } else {
                    texts.push({
                        value: row.value,
                        author: authorOf(response),
                        source: response.source === "link" ? "link" : "intern",
                        submittedAt: response.submittedAt
                    });
                }
            }
        }

        /**
         * Der Anteil bezieht sich auf die Zahl der AUSGEFÜLLTEN Antworten,
         * nicht auf alle Antworten. Sonst summierte eine Mehrfachauswahl auf
         * mehr als 100 %, und ein freiwilliges Feld sähe schlechter aus, als
         * es beantwortet wurde.
         */
        const counts = countsFor(field, tally, answered);

        return {
            field,
            answered,
            responseCount,
            counts,
            yes: tally.get("ja") ?? 0,
            no: tally.get("nein") ?? 0,
            average: scaleCount > 0 ? scaleSum / scaleCount : null,
            texts,
            otherTexts
        };
    });

    const linkCount = responseRows.filter((row) => row.source === "link").length;

    return {
        surveyId,
        responseCount,
        internCount: responseCount - linkCount,
        linkCount,
        fields
    };
}

/**
 * Auszählung eines Feldes in der Reihenfolge seiner Optionen.
 *
 * Optionen ohne Stimme bleiben mit 0 stehen -- eine Auswahl, die niemand
 * gewählt hat, ist ein Ergebnis und keine Lücke. Werte, die es nicht mehr
 * gibt (eine gelöschte Option), hängen hinten an, damit keine Stimme
 * verschwindet.
 */
function countsFor(
    field: SurveyFieldEntry,
    tally: Map<string, number>,
    answered: number
): SurveyResultField["counts"] {
    if (!isChoiceType(field.type)) return [];

    const known =
        field.type === "boolean"
            ? BOOLEAN_VALUES.map((value) => ({ value, label: BOOLEAN_LABELS[value] }))
            : field.options;

    const counts = known.map((option) => ({
        value: option.value,
        label: option.label,
        count: tally.get(option.value) ?? 0,
        share: 0
    }));

    const seen = new Set(counts.map((entry) => entry.value));
    for (const [value, count] of tally) {
        if (seen.has(value)) continue;
        counts.push({ value, label: `${value} (entfernt)`, count, share: 0 });
    }

    for (const entry of counts) {
        entry.share = answered > 0 ? entry.count / answered : 0;
    }

    return counts;
}

/**
 * Alle Antworten als CSV -- eine Zeile je Antwort, eine Spalte je Frage.
 *
 * Trenner, Anführungszeichen, BOM und der Schutz vor Formeln kommen aus
 * `$lib/server/csv`; die Regeln stehen im Projekt nur dort.
 *
 * Bei einer anonymen Umfrage entfällt die Spalte „Von“ ganz. Eine leere
 * Spalte sähe aus, als wären Daten verloren gegangen -- es gibt sie schlicht
 * nicht.
 */
export async function exportResponsesCsv(surveyId: string): Promise<string> {
    if (!isUuid(surveyId)) return csvDocument([]);

    const [survey] = await db
        .select({ title: surveys.title, anonymous: surveys.anonymous })
        .from(surveys)
        .where(eq(surveys.id, surveyId))
        .limit(1);

    if (!survey) return csvDocument([]);

    const [fieldRows, responseRows] = await Promise.all([
        db
            .select()
            .from(surveyFields)
            .where(eq(surveyFields.surveyId, surveyId))
            .orderBy(asc(surveyFields.position), asc(surveyFields.id)),
        db
            .select({
                id: surveyResponses.id,
                submittedAt: surveyResponses.submittedAt,
                source: surveyResponses.source,
                publicName: surveyResponses.publicName,
                userName: users.name,
                firstname: members.firstname,
                lastname: members.lastname,
                fahrtenname: members.fahrtenname
            })
            .from(surveyResponses)
            .leftJoin(users, eq(users.id, surveyResponses.userId))
            .leftJoin(members, eq(members.id, surveyResponses.memberId))
            .where(eq(surveyResponses.surveyId, surveyId))
            .orderBy(asc(surveyResponses.submittedAt))
    ]);

    const responseIds = responseRows.map((row) => row.id);

    const answerRows =
        responseIds.length === 0
            ? []
            : await db
                  .select({
                      responseId: surveyAnswers.responseId,
                      fieldId: surveyAnswers.fieldId,
                      value: surveyAnswers.value,
                      values: surveyAnswers.values
                  })
                  .from(surveyAnswers)
                  .where(inArray(surveyAnswers.responseId, responseIds));

    const answersByResponse = new Map<string, Map<string, string>>();
    for (const row of answerRows) {
        const field = fieldRows.find((entry) => entry.id === row.fieldId);
        const cell =
            field?.type === "multi"
                ? row.values.map((value) => optionLabel(field, value)).join(", ")
                : field && isChoiceType(field.type)
                  ? optionLabel(field, row.value)
                  : row.value;

        const map = answersByResponse.get(row.responseId) ?? new Map<string, string>();
        map.set(row.fieldId, cell);
        answersByResponse.set(row.responseId, map);
    }

    /*
     * Die Spalte „Herkunft“ erscheint nur, wenn es überhaupt eine Antwort über
     * den Link gibt. Bei einer rein internen Umfrage wäre sie eine Spalte, in
     * der immer dasselbe steht.
     */
    const hasLinkAnswers = responseRows.some((row) => row.source === "link");

    const header = ["Nr.", "Abgegeben am"];
    if (hasLinkAnswers) header.push("Herkunft");
    if (!survey.anonymous) header.push("Von");
    /*
     * Eine Zwischenüberschrift bekommt keine Spalte -- sie wird nie
     * beantwortet, und eine dauerhaft leere Spalte je Gliederungspunkt ist
     * nichts als Rauschen in der Tabelle.
     */
    const columns = fieldRows.filter((field) => field.type !== "section");
    for (const field of columns) header.push(field.label);

    const rows: (string | number | null | undefined)[][] = [[survey.title], [], header];

    responseRows.forEach((response, index) => {
        const answers = answersByResponse.get(response.id) ?? new Map<string, string>();

        const cells: (string | number | null | undefined)[] = [
            index + 1,
            response.submittedAt.toLocaleString("de-DE")
        ];

        if (hasLinkAnswers) cells.push(SOURCE_LABELS[response.source === "link" ? "link" : "intern"]);

        if (!survey.anonymous) {
            /*
             * Bei einer Antwort über den Link ist der Name SELBST ANGEGEBEN.
             * Der Zusatz steht ausdrücklich dabei: ungekennzeichnet neben einem
             * geprüften Zugangsnamen wäre er eine Behauptung, für die das
             * Portal nicht einsteht.
             */
            if (response.source === "link") {
                cells.push(response.publicName ? `${response.publicName} (eigene Angabe)` : "");
            } else if (response.firstname && response.lastname) {
                cells.push(
                    memberName({
                        firstname: response.firstname,
                        lastname: response.lastname,
                        fahrtenname: response.fahrtenname
                    })
                );
            } else {
                cells.push(response.userName ?? "");
            }
        }

        for (const field of columns) cells.push(answers.get(field.id) ?? "");
        rows.push(cells);
    });

    return csvDocument(rows);
}

/** Beschriftung zu einem gespeicherten Wert -- der Wert selbst als Rückfall. */
function optionLabel(field: FieldRow, value: string): string {
    if (!value) return "";
    if (field.type === "boolean") return BOOLEAN_LABELS[value] ?? value;
    return (field.options ?? []).find((option) => option.value === value)?.label ?? value;
}
