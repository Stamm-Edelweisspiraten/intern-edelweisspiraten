import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db, withTransaction, type Executor } from "$lib/server/db";
import { isUuid, onlyUuids } from "$lib/server/db/ids";
import {
    files,
    memberEmails,
    memberGroups,
    memberLogs,
    memberPhones,
    members
} from "$lib/server/db/schema";

/**
 * Mitgliederverwaltung.
 *
 * Die Mehrfachfelder (E-Mail, Telefon, Gruppen) liegen jetzt in eigenen
 * Tabellen. Damit entfallen die Umschreibungen beim Lesen, die frueher noetig
 * waren, weil aeltere Datensaetze noch ein einzelnes Feld `group` statt
 * `groups[]` hatten -- und die Abfrage in getMembersByGroupIds, die sowohl
 * gegen Zeichenketten als auch gegen ObjectIds suchen musste, weil beide
 * Formen nebeneinander in der Datenbank standen.
 */

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export interface MemberEmail {
    label: string;
    email: string;
}

export interface MemberNumber {
    label: string;
    number: string;
}

export interface MemberAddress {
    street: string;
    zip: string;
    city: string;
}

export interface MemberFileMeta {
    id: string;
    filename: string;
    contentType: string;
    size: number;
    uploadedAt: string;
}

/** Ansichtsmodell, wie es Routen und PDFs erwarten. */
export interface Member {
    id: string;
    firstname: string;
    lastname: string;
    fahrtenname: string;
    birthday: string;
    address: MemberAddress;
    stand: string;
    status: string;
    emails: MemberEmail[];
    numbers: MemberNumber[];
    /** Gruppen-Kennungen. */
    groups: string[];
    entryDate: string;
    isSecondMember: boolean;
    contributionDues: {
        stamm: boolean;
        gau: boolean;
        landesmark: boolean;
        bund: boolean;
    };
    mediaConsent: {
        socialMedia: boolean;
        website: boolean;
        print: boolean;
    };
    consentFile?: MemberFileMeta;
    applicationFile?: MemberFileMeta;
    inviteCode?: string;
    inviteCodeIssuedAt?: string;
    inviteCodeExpiresAt?: string;
    updatedAt: string;
    updatedBy: string;
}

export interface MemberLogEntry {
    memberId: string;
    action: "create" | "update" | "delete";
    changes: { field: string; before: unknown; after: unknown }[];
    createdAt: string;
    user: string;
}

/** Eingabe fuer Anlegen und Aendern. Alle Felder sind optional aenderbar. */
export interface MemberInput {
    firstname?: string;
    lastname?: string;
    fahrtenname?: string;
    birthday?: string;
    address?: Partial<MemberAddress>;
    stand?: string;
    status?: string;
    emails?: MemberEmail[];
    numbers?: MemberNumber[];
    groups?: string[];
    entryDate?: string;
    isSecondMember?: boolean;
    contributionDues?: Partial<Member["contributionDues"]>;
    mediaConsent?: Partial<Member["mediaConsent"]>;
    consentFileId?: string | null;
    applicationFileId?: string | null;
}

// ---------------------------------------------------------------------------
// Abbildung Datenbank -> Ansichtsmodell
// ---------------------------------------------------------------------------

type MemberRow = typeof members.$inferSelect;
type FileRow = typeof files.$inferSelect;

function toFileMeta(row: Pick<FileRow, "id" | "filename" | "contentType" | "size" | "uploadedAt"> | null) {
    if (!row) return undefined;
    return {
        id: row.id,
        filename: row.filename,
        contentType: row.contentType,
        size: row.size,
        uploadedAt: row.uploadedAt.toISOString()
    };
}

async function hydrate(rows: MemberRow[]): Promise<Member[]> {
    if (rows.length === 0) return [];

    const ids = rows.map((row) => row.id);
    const fileIds = onlyUuids(
        rows.flatMap((row) => [row.consentFileId, row.applicationFileId])
    );

    const [emailRows, phoneRows, groupRows, fileRows] = await Promise.all([
        db
            .select()
            .from(memberEmails)
            .where(inArray(memberEmails.memberId, ids))
            .orderBy(asc(memberEmails.position)),
        db
            .select()
            .from(memberPhones)
            .where(inArray(memberPhones.memberId, ids))
            .orderBy(asc(memberPhones.position)),
        db.select().from(memberGroups).where(inArray(memberGroups.memberId, ids)),
        fileIds.length > 0
            ? db
                  .select({
                      id: files.id,
                      filename: files.filename,
                      contentType: files.contentType,
                      size: files.size,
                      uploadedAt: files.uploadedAt
                  })
                  .from(files)
                  .where(inArray(files.id, fileIds))
            : Promise.resolve([])
    ]);

    const byMember = <T extends { memberId: string }>(list: T[]) => {
        const map = new Map<string, T[]>();
        for (const item of list) {
            const entries = map.get(item.memberId) ?? [];
            entries.push(item);
            map.set(item.memberId, entries);
        }
        return map;
    };

    const emails = byMember(emailRows);
    const phones = byMember(phoneRows);
    const groups = byMember(groupRows);
    const filesById = new Map(fileRows.map((row) => [row.id, row]));

    return rows.map((row) => ({
        id: row.id,
        firstname: row.firstname,
        lastname: row.lastname,
        fahrtenname: row.fahrtenname,
        birthday: row.birthday,
        address: { street: row.street, zip: row.zip, city: row.city },
        stand: row.stand,
        status: row.status,
        emails: (emails.get(row.id) ?? []).map((e) => ({ label: e.label, email: e.email })),
        numbers: (phones.get(row.id) ?? []).map((p) => ({ label: p.label, number: p.number })),
        groups: (groups.get(row.id) ?? []).map((g) => g.groupId),
        entryDate: row.entryDate,
        isSecondMember: row.isSecondMember,
        contributionDues: {
            stamm: row.duesStamm,
            gau: row.duesGau,
            landesmark: row.duesLandesmark,
            bund: row.duesBund
        },
        mediaConsent: {
            socialMedia: row.consentSocialMedia,
            website: row.consentWebsite,
            print: row.consentPrint
        },
        consentFile: toFileMeta(filesById.get(row.consentFileId ?? "") ?? null),
        applicationFile: toFileMeta(filesById.get(row.applicationFileId ?? "") ?? null),
        inviteCode: row.inviteCode ?? undefined,
        inviteCodeIssuedAt: row.inviteCodeIssuedAt?.toISOString(),
        inviteCodeExpiresAt: row.inviteCodeExpiresAt?.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        updatedBy: row.updatedBy
    }));
}

/** Uebersetzt die Eingabe in Spaltenwerte; nur gesetzte Felder wandern mit. */
function toColumns(input: MemberInput): Partial<typeof members.$inferInsert> {
    const update: Partial<typeof members.$inferInsert> = {};

    if (input.firstname !== undefined) update.firstname = input.firstname.trim();
    if (input.lastname !== undefined) update.lastname = input.lastname.trim();
    if (input.fahrtenname !== undefined) update.fahrtenname = input.fahrtenname.trim();
    if (input.birthday !== undefined) update.birthday = input.birthday;
    if (input.stand !== undefined) update.stand = input.stand;
    if (input.status !== undefined) update.status = input.status;
    if (input.entryDate !== undefined) update.entryDate = input.entryDate;
    if (input.isSecondMember !== undefined) update.isSecondMember = input.isSecondMember;

    if (input.address) {
        if (input.address.street !== undefined) update.street = input.address.street;
        if (input.address.zip !== undefined) update.zip = input.address.zip;
        if (input.address.city !== undefined) update.city = input.address.city;
    }

    if (input.contributionDues) {
        const d = input.contributionDues;
        if (d.stamm !== undefined) update.duesStamm = d.stamm;
        if (d.gau !== undefined) update.duesGau = d.gau;
        if (d.landesmark !== undefined) update.duesLandesmark = d.landesmark;
        if (d.bund !== undefined) update.duesBund = d.bund;
    }

    if (input.mediaConsent) {
        const c = input.mediaConsent;
        if (c.socialMedia !== undefined) update.consentSocialMedia = c.socialMedia;
        if (c.website !== undefined) update.consentWebsite = c.website;
        if (c.print !== undefined) update.consentPrint = c.print;
    }

    if (input.consentFileId !== undefined) update.consentFileId = input.consentFileId;
    if (input.applicationFileId !== undefined) update.applicationFileId = input.applicationFileId;

    return update;
}

async function replaceEmails(tx: Executor, memberId: string, list: MemberEmail[]): Promise<void> {
    await tx.delete(memberEmails).where(eq(memberEmails.memberId, memberId));
    const rows = list
        .filter((entry) => entry.email?.trim())
        .map((entry, index) => ({
            memberId,
            label: entry.label ?? "",
            email: entry.email.trim().toLowerCase(),
            position: index
        }));
    if (rows.length > 0) await tx.insert(memberEmails).values(rows);
}

async function replacePhones(tx: Executor, memberId: string, list: MemberNumber[]): Promise<void> {
    await tx.delete(memberPhones).where(eq(memberPhones.memberId, memberId));
    const rows = list
        .filter((entry) => entry.number?.trim())
        .map((entry, index) => ({
            memberId,
            label: entry.label ?? "",
            number: entry.number.trim(),
            position: index
        }));
    if (rows.length > 0) await tx.insert(memberPhones).values(rows);
}

async function replaceGroups(tx: Executor, memberId: string, groupIds: string[]): Promise<void> {
    await tx.delete(memberGroups).where(eq(memberGroups.memberId, memberId));
    const valid = Array.from(new Set(onlyUuids(groupIds)));
    if (valid.length === 0) return;
    await tx
        .insert(memberGroups)
        .values(valid.map((groupId) => ({ memberId, groupId })))
        .onConflictDoNothing();
}

// ---------------------------------------------------------------------------
// Protokoll
// ---------------------------------------------------------------------------

function collectChanges(
    before: Record<string, unknown>,
    after: Record<string, unknown>
): { field: string; before: unknown; after: unknown }[] {
    const changes: { field: string; before: unknown; after: unknown }[] = [];
    for (const key of Object.keys(after)) {
        const oldVal = before?.[key];
        const newVal = after[key];
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
            changes.push({ field: key, before: oldVal, after: newVal });
        }
    }
    return changes;
}

async function addMemberLog(entry: {
    memberId: string;
    action: "create" | "update" | "delete";
    changes?: { field: string; before: unknown; after: unknown }[];
    user: string;
}): Promise<void> {
    await db.insert(memberLogs).values({
        memberId: entry.memberId,
        action: entry.action,
        changes: entry.changes ?? [],
        user: entry.user
    });
}

export async function getMemberLogs(memberId: string): Promise<MemberLogEntry[]> {
    if (!isUuid(memberId)) return [];
    const rows = await db
        .select()
        .from(memberLogs)
        .where(eq(memberLogs.memberId, memberId))
        .orderBy(desc(memberLogs.createdAt))
        .limit(100);

    return rows.map((row) => ({
        memberId: row.memberId,
        action: row.action,
        changes: row.changes ?? [],
        createdAt: row.createdAt.toISOString(),
        user: row.user
    }));
}

// ---------------------------------------------------------------------------
// Schreiben
// ---------------------------------------------------------------------------

export async function createMember(
    input: MemberInput & { updatedBy: string }
): Promise<Member> {
    const columns = toColumns(input);

    const id = await withTransaction(async (tx) => {
        const [row] = await tx
            .insert(members)
            .values({
                firstname: input.firstname?.trim() ?? "",
                lastname: input.lastname?.trim() ?? "",
                ...columns,
                updatedBy: input.updatedBy,
                updatedAt: new Date(),
                inviteCode: await generateInviteCode(tx),
                inviteCodeIssuedAt: new Date(),
                inviteCodeExpiresAt: inviteExpiry()
            })
            .returning({ id: members.id });

        await replaceEmails(tx, row.id, input.emails ?? []);
        await replacePhones(tx, row.id, input.numbers ?? []);
        await replaceGroups(tx, row.id, input.groups ?? []);
        return row.id;
    });

    await addMemberLog({ memberId: id, action: "create", changes: [], user: input.updatedBy });

    const member = await getMember(id);
    if (!member) throw new Error("Mitglied konnte nicht gelesen werden.");
    return member;
}

export async function updateMember(
    id: string,
    input: MemberInput,
    updatedBy: string
): Promise<boolean> {
    if (!isUuid(id)) return false;

    const existing = await getMember(id);
    if (!existing) return false;

    await withTransaction(async (tx) => {
        await tx
            .update(members)
            .set({ ...toColumns(input), updatedBy, updatedAt: new Date() })
            .where(eq(members.id, id));

        if (input.emails !== undefined) await replaceEmails(tx, id, input.emails);
        if (input.numbers !== undefined) await replacePhones(tx, id, input.numbers);
        if (input.groups !== undefined) await replaceGroups(tx, id, input.groups);
    });

    const updated = await getMember(id);
    const changes = collectChanges(
        existing as unknown as Record<string, unknown>,
        pickComparable(updated as Member)
    );

    await addMemberLog({ memberId: id, action: "update", changes, user: updatedBy });
    return true;
}

/** Felder, die im Protokoll verglichen werden -- ohne Zeitstempel und Codes. */
function pickComparable(member: Member): Record<string, unknown> {
    const {
        updatedAt: _updatedAt,
        updatedBy: _updatedBy,
        inviteCode: _inviteCode,
        inviteCodeIssuedAt: _issued,
        inviteCodeExpiresAt: _expires,
        ...rest
    } = member;
    return rest as unknown as Record<string, unknown>;
}

export async function deleteMember(id: string, deletedBy?: string): Promise<boolean> {
    if (!isUuid(id)) return false;

    // Zuordnungen und Unterlagen verschwinden ueber die Fremdschluessel mit.
    const rows = await db.delete(members).where(eq(members.id, id)).returning({ id: members.id });

    // Der Protokolleintrag stand vorher bedingungslos hier: eine zweite
    // Anfrage auf dieselbe Kennung -- doppelter Klick, erneutes Absenden --
    // schrieb einen weiteren "geloescht"-Eintrag, obwohl nichts geloescht
    // wurde. Das Protokoll wies damit mehr Loeschungen aus, als es gab.
    if (rows.length === 0) return false;

    await addMemberLog({
        memberId: id,
        action: "delete",
        changes: [],
        user: deletedBy ?? "system"
    });

    return true;
}

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

export async function getMember(id: string): Promise<Member | null> {
    if (!isUuid(id)) return null;
    const rows = await db.select().from(members).where(eq(members.id, id)).limit(1);
    const [member] = await hydrate(rows);
    return member ?? null;
}

export async function getAllMembers(): Promise<Member[]> {
    const rows = await db
        .select()
        .from(members)
        .orderBy(asc(members.lastname), asc(members.firstname));
    return hydrate(rows);
}

export async function getMembersByIds(ids: string[]): Promise<Member[]> {
    const valid = onlyUuids(ids);
    if (valid.length === 0) return [];
    const rows = await db
        .select()
        .from(members)
        .where(inArray(members.id, valid))
        .orderBy(asc(members.lastname), asc(members.firstname));
    return hydrate(rows);
}

export async function searchMembers(query: string): Promise<Member[]> {
    const q = query?.trim();
    if (!q) return getAllMembers();

    const pattern = `%${q}%`;
    const rows = await db
        .selectDistinct({ member: members })
        .from(members)
        .leftJoin(memberEmails, eq(memberEmails.memberId, members.id))
        .where(
            or(
                ilike(members.firstname, pattern),
                ilike(members.lastname, pattern),
                ilike(members.fahrtenname, pattern),
                ilike(members.status, pattern),
                ilike(members.stand, pattern),
                ilike(memberEmails.email, pattern),
                ilike(memberEmails.label, pattern)
            )
        );

    const hydrated = await hydrate(rows.map((row) => row.member));
    return hydrated.sort(
        (a, b) => a.lastname.localeCompare(b.lastname) || a.firstname.localeCompare(b.firstname)
    );
}

export async function getMemberByEmail(email: string): Promise<Member | null> {
    if (!email) return null;
    const rows = await db
        .select({ member: members })
        .from(members)
        .innerJoin(memberEmails, eq(memberEmails.memberId, members.id))
        .where(eq(memberEmails.email, email.trim().toLowerCase()))
        .limit(1);
    const [member] = await hydrate(rows.map((row) => row.member));
    return member ?? null;
}

export async function getMembersByGroup(groupId: string): Promise<Member[]> {
    return getMembersByGroupIds([groupId]);
}

export async function getMembersByGroupIds(groupIds: string[]): Promise<Member[]> {
    const valid = onlyUuids(groupIds);
    if (valid.length === 0) return [];

    const rows = await db
        .selectDistinct({ member: members })
        .from(members)
        .innerJoin(memberGroups, eq(memberGroups.memberId, members.id))
        .where(inArray(memberGroups.groupId, valid));

    const hydrated = await hydrate(rows.map((row) => row.member));
    return hydrated.sort(
        (a, b) => a.lastname.localeCompare(b.lastname) || a.firstname.localeCompare(b.firstname)
    );
}

// ---------------------------------------------------------------------------
// Gruppenzuordnung
// ---------------------------------------------------------------------------

export async function setMemberGroup(memberId: string, groupId: string): Promise<boolean> {
    if (!isUuid(memberId)) return false;
    await withTransaction((tx) => replaceGroups(tx, memberId, [groupId]));
    return true;
}

export async function removeMemberGroup(memberId: string): Promise<boolean> {
    if (!isUuid(memberId)) return false;
    await db.delete(memberGroups).where(eq(memberGroups.memberId, memberId));
    return true;
}

/** Entfernt eine Gruppe aus allen Mitgliedern (z. B. beim Loeschen der Gruppe). */
export async function unlinkGroupFromAllMembers(groupId: string): Promise<boolean> {
    if (!isUuid(groupId)) return false;
    await db.delete(memberGroups).where(eq(memberGroups.groupId, groupId));
    return true;
}

// ---------------------------------------------------------------------------
// Einladungscode
// ---------------------------------------------------------------------------

/** Gueltigkeitsdauer eines Einladungscodes in Tagen. */
export const INVITE_CODE_TTL_DAYS = 60;

function inviteExpiry(): Date {
    return new Date(Date.now() + INVITE_CODE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

async function generateInviteCode(executor: Executor = db): Promise<string> {
    const chars = "0123456789";

    // Kollisionen vermeiden. Der eindeutige Index ist die eigentliche
    // Absicherung; diese Schleife spart nur den Fehlerfall.
    for (let attempt = 0; attempt < 20; attempt++) {
        let code = "";
        for (let i = 0; i < 6; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }

        const [existing] = await executor
            .select({ id: members.id })
            .from(members)
            .where(eq(members.inviteCode, code))
            .limit(1);

        if (!existing) return code;
    }

    throw new Error("Es konnte kein freier Einladungscode gefunden werden.");
}

/**
 * Vergibt einen frischen Einladungscode.
 *
 * War exportiert, aber von keiner Route erreichbar -- ein nach
 * INVITE_CODE_TTL_DAYS abgelaufener Code liess sich damit gar nicht erneuern.
 * Angebunden ist sie jetzt an die Sammelaktion der Mitgliederliste.
 */
export async function assignInviteCode(memberId: string): Promise<string> {
    if (!isUuid(memberId)) throw new Error("Ungültige Kennung.");

    const inviteCode = await generateInviteCode();
    const rows = await db
        .update(members)
        .set({
            inviteCode,
            inviteCodeIssuedAt: new Date(),
            // Vorher: null -- der Code lief nie ab.
            inviteCodeExpiresAt: inviteExpiry()
        })
        .where(eq(members.id, memberId))
        .returning({ id: members.id });

    // Ohne diese Pruefung meldete die Funktion auch fuer eine unbekannte
    // Kennung einen Code, der zu keinem Mitglied gehoert.
    if (rows.length === 0) throw new Error("Mitglied nicht gefunden.");

    return inviteCode;
}

/** Ist der Code eines Mitglieds noch gueltig? */
export function inviteCodeState(member: Member): "gueltig" | "abgelaufen" | "fehlt" {
    if (!member.inviteCode) return "fehlt";
    if (!member.inviteCodeExpiresAt) return "gueltig";

    const expires = new Date(member.inviteCodeExpiresAt);
    if (Number.isNaN(expires.getTime())) return "gueltig";

    return expires.getTime() > Date.now() ? "gueltig" : "abgelaufen";
}

export async function getMemberByInviteCode(code: string): Promise<Member | null> {
    if (!code) return null;
    const rows = await db
        .select()
        .from(members)
        .where(eq(members.inviteCode, code.trim()))
        .limit(1);
    const [member] = await hydrate(rows);
    return member ?? null;
}

/** Naechste Geburtstage, fuer die Kachel auf dem Dashboard. */
export async function getUpcomingBirthdays(limit = 3): Promise<Member[]> {
    const rows = await db
        .select()
        .from(members)
        .where(and(eq(members.status, "aktiv"), sql`${members.birthday} <> ''`));

    const hydrated = await hydrate(rows);
    const today = new Date();

    return hydrated
        .map((member) => ({ member, days: daysUntilBirthday(member.birthday, today) }))
        .filter((entry) => entry.days !== null)
        .sort((a, b) => (a.days as number) - (b.days as number))
        .slice(0, limit)
        .map((entry) => entry.member);
}

function daysUntilBirthday(birthday: string, today: Date): number | null {
    const parsed = new Date(birthday);
    if (Number.isNaN(parsed.getTime())) return null;

    const next = new Date(today.getFullYear(), parsed.getMonth(), parsed.getDate());
    if (next < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
        next.setFullYear(today.getFullYear() + 1);
    }
    return Math.round((next.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}
