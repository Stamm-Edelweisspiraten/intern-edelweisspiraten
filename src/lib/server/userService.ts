import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { db, withTransaction, type Executor } from "$lib/server/db";
import { isUuid, onlyUuids } from "$lib/server/db/ids";
import { isUniqueViolation } from "$lib/server/db/errors";
import { userMembers, userRoles, users } from "$lib/server/db/schema";
import { hashPassword } from "$lib/server/auth/password";
import { getRoleByKey } from "$lib/server/roleService";
import { revokeAllForUser } from "$lib/server/auth/session";
import { lockoutDuration } from "$lib/server/auth/rateLimit";
import { invalidatePermissionCache } from "$lib/server/permissionService";

/**
 * Benutzerverwaltung gegen die eigene Datenbank.
 *
 * Vorher war dieses Modul im Wesentlichen ein Proxy auf die Admin-API des
 * externen Anbieters: Benutzer wurden dort angelegt, gepatcht, mit Gruppen
 * versehen und wieder geloescht -- und createUser hat das erzeugte Passwort
 * im Klartext an den Aufrufer zurueckgegeben.
 *
 * Die frueheren Zeichenketten-Arrays roleIds und memberIds sind jetzt
 * Zuordnungstabellen. Nach aussen bleiben sie Felder des User-Objekts, damit
 * die Aufrufer unveraendert weiterlaufen.
 */

export type UserRow = typeof users.$inferSelect;
export type UserStatus = UserRow["status"];

/**
 * Eine Rollenzuweisung. `groupId === null` heisst stammesweit, sonst
 * gelten die Rechte der Rolle nur fuer diese Gruppe.
 */
export interface RoleAssignment {
    roleId: string;
    groupId: string | null;
}

/** Benutzer samt aufgeloester Zuordnungen. */
export interface User extends UserRow {
    /** Alle zugewiesenen Rollen, ohne Gruppenbezug -- fuer Anzeige und Rollenschluessel. */
    roleIds: string[];
    /** Die Zuweisungen samt Gruppenbezug. */
    roleAssignments: RoleAssignment[];
    memberIds: string[];
}

export function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

async function attachRelations(rows: UserRow[]): Promise<User[]> {
    if (rows.length === 0) return [];

    const ids = rows.map((row) => row.id);
    const [roleRows, memberRows] = await Promise.all([
        db.select().from(userRoles).where(inArray(userRoles.userId, ids)),
        db.select().from(userMembers).where(inArray(userMembers.userId, ids))
    ]);

    const assignmentsByUser = new Map<string, RoleAssignment[]>();
    for (const row of roleRows) {
        const list = assignmentsByUser.get(row.userId) ?? [];
        list.push({ roleId: row.roleId, groupId: row.groupId ?? null });
        assignmentsByUser.set(row.userId, list);
    }

    const membersByUser = new Map<string, string[]>();
    for (const row of memberRows) {
        const list = membersByUser.get(row.userId) ?? [];
        list.push(row.memberId);
        membersByUser.set(row.userId, list);
    }

    return rows.map((row) => {
        const assignments = assignmentsByUser.get(row.id) ?? [];
        return {
            ...row,
            roleAssignments: assignments,
            roleIds: Array.from(new Set(assignments.map((a) => a.roleId))),
            memberIds: membersByUser.get(row.id) ?? []
        };
    });
}

export async function getUser(id: string): Promise<User | null> {
    if (!isUuid(id)) return null;
    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    const [user] = await attachRelations(rows);
    return user ?? null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
    const rows = await db
        .select()
        .from(users)
        .where(eq(users.email, normalizeEmail(email)))
        .limit(1);
    const [user] = await attachRelations(rows);
    return user ?? null;
}

export async function getAllUsers(): Promise<User[]> {
    const rows = await db.select().from(users).orderBy(asc(users.name));
    return attachRelations(rows);
}

export async function getUsersByIds(ids: string[]): Promise<User[]> {
    const valid = onlyUuids(ids);
    if (valid.length === 0) return [];
    const rows = await db.select().from(users).where(inArray(users.id, valid));
    return attachRelations(rows);
}

export async function countActiveUsers(): Promise<number> {
    const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(and(eq(users.status, "active"), ne(users.passwordHash, "")));
    return Number(row?.count ?? 0);
}

// ---------------------------------------------------------------------------
// Anlegen und aendern
// ---------------------------------------------------------------------------

export interface CreateUserInput {
    name: string;
    email: string;
    type?: "parent" | "child";
    /** Stammesweite Rollen; fuer gruppenbezogene siehe roleAssignments. */
    roleIds?: string[];
    roleAssignments?: RoleAssignment[];
    roleKeys?: string[];
    memberIds?: string[];
    /** Ohne Passwort entsteht ein eingeladener Zugang ohne Anmeldemöglichkeit. */
    password?: string;
    status?: UserStatus;
}

export interface CreateUserResult {
    ok: boolean;
    user?: User;
    error?: string;
}


export async function createUser(input: CreateUserInput): Promise<CreateUserResult> {
    const email = normalizeEmail(input.email);
    if (!email || !email.includes("@")) {
        return { ok: false, error: "Bitte eine gültige E-Mail-Adresse angeben." };
    }

    const assignments = await resolveAssignments(
        input.roleIds,
        input.roleAssignments,
        input.roleKeys
    );
    const memberIds = onlyUuids(input.memberIds ?? []);
    const passwordHash = input.password ? await hashPassword(input.password) : "";

    try {
        const id = await withTransaction(async (tx) => {
            const [row] = await tx
                .insert(users)
                .values({
                    name: input.name.trim(),
                    email,
                    passwordHash,
                    passwordChangedAt: input.password ? new Date() : null,
                    status: input.status ?? (input.password ? "active" : "invited"),
                    type: input.type ?? "parent"
                })
                .returning({ id: users.id });

            await setUserRoles(tx, row.id, assignments);
            await setUserMembers(tx, row.id, memberIds);
            return row.id;
        });

        // Wie in updateUser: Rollen- und Mitgliedszuordnung bestimmen die
        // aufgeloesten Rechte. Ohne das trug ein frisch angelegter Zugang bis
        // zum naechsten Cache-Ablauf keine seiner Rollen.
        invalidatePermissionCache();

        const user = await getUser(id);
        return { ok: true, user: user ?? undefined };
    } catch (err: unknown) {
        if (isUniqueViolation(err)) {
            return { ok: false, error: "Für diese E-Mail-Adresse existiert bereits ein Zugang." };
        }
        throw err;
    }
}

/**
 * Fuehrt die drei Eingabeformen zu einer Liste von Zuweisungen zusammen:
 * reine Rollenkennungen (stammesweit), Zuweisungen mit Gruppe und
 * Rollenschluessel (fuer die Ersteinrichtung und den Notzugang).
 */
async function resolveAssignments(
    roleIds?: string[],
    assignments?: RoleAssignment[],
    roleKeys?: string[]
): Promise<RoleAssignment[]> {
    const result: RoleAssignment[] = onlyUuids(roleIds ?? []).map((roleId) => ({
        roleId,
        groupId: null
    }));

    for (const entry of assignments ?? []) {
        if (!isUuid(entry.roleId)) continue;
        result.push({ roleId: entry.roleId, groupId: isUuid(entry.groupId) ? entry.groupId : null });
    }

    for (const key of roleKeys ?? []) {
        const role = await getRoleByKey(key);
        if (role) result.push({ roleId: role.id, groupId: null });
    }

    return result;
}

async function setUserRoles(
    tx: Executor,
    userId: string,
    assignments: RoleAssignment[]
): Promise<void> {
    await tx.delete(userRoles).where(eq(userRoles.userId, userId));
    if (assignments.length === 0) return;

    // Doppelte (Rolle, Gruppe) zusammenfassen -- das Formular kann sie
    // liefern, der Primaerschluessel liesse sie nicht zu.
    const seen = new Set<string>();
    const rows = assignments
        .filter((entry) => {
            const key = `${entry.roleId} ${entry.groupId ?? ""}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .map((entry) => ({
            userId,
            roleId: entry.roleId,
            groupId: isUuid(entry.groupId) ? entry.groupId : null
        }));

    if (rows.length > 0) await tx.insert(userRoles).values(rows).onConflictDoNothing();
}

async function setUserMembers(tx: Executor, userId: string, memberIds: string[]): Promise<void> {
    await tx.delete(userMembers).where(eq(userMembers.userId, userId));
    if (memberIds.length === 0) return;
    await tx
        .insert(userMembers)
        .values(memberIds.map((memberId) => ({ userId, memberId })))
        .onConflictDoNothing();
}

export interface UpdateUserInput {
    name?: string;
    email?: string;
    type?: "parent" | "child";
    roleIds?: string[];
    roleAssignments?: RoleAssignment[];
    memberIds?: string[];
    status?: UserStatus;
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<CreateUserResult> {
    if (!isUuid(id)) return { ok: false, error: "Ungültige Kennung." };

    const update: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
    if (input.name !== undefined) update.name = input.name.trim();
    if (input.type !== undefined) update.type = input.type;
    if (input.status !== undefined) update.status = input.status;

    if (input.email !== undefined) {
        const email = normalizeEmail(input.email);
        const [conflict] = await db
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.email, email), ne(users.id, id)))
            .limit(1);
        if (conflict) {
            return { ok: false, error: "Diese E-Mail-Adresse wird bereits verwendet." };
        }
        update.email = email;
    }

    try {
        await withTransaction(async (tx) => {
            await tx.update(users).set(update).where(eq(users.id, id));
            if (input.roleIds !== undefined || input.roleAssignments !== undefined) {
                await setUserRoles(
                    tx,
                    id,
                    await resolveAssignments(input.roleIds, input.roleAssignments)
                );
            }
            if (input.memberIds !== undefined) {
                await setUserMembers(tx, id, onlyUuids(input.memberIds));
            }
        });
    } catch (err: unknown) {
        if (isUniqueViolation(err)) {
            return { ok: false, error: "Diese E-Mail-Adresse wird bereits verwendet." };
        }
        throw err;
    }

    // Rollen- und Mitgliedszuordnung bestimmen die aufgeloesten Rechte.
    if (input.roleIds !== undefined || input.roleAssignments !== undefined ||
        input.memberIds !== undefined) {
        invalidatePermissionCache();
    }

    // Ein deaktivierter Zugang darf nicht weiterlaufen.
    if (input.status && input.status !== "active") {
        await revokeAllForUser(id);
    }

    const user = await getUser(id);
    return { ok: true, user: user ?? undefined };
}

/** Setzt ein neues Passwort und beendet alle bestehenden Sitzungen. */
export async function setPassword(
    id: string,
    password: string,
    options: { keepSessionHash?: string } = {}
): Promise<boolean> {
    if (!isUuid(id)) return false;

    const rows = await db
        .update(users)
        .set({
            passwordHash: await hashPassword(password),
            passwordChangedAt: new Date(),
            status: "active",
            failedLoginAttempts: 0,
            lockedUntil: null,
            updatedAt: new Date()
        })
        .where(eq(users.id, id))
        .returning({ id: users.id });

    if (rows.length === 0) return false;

    await revokeAllForUser(id, options.keepSessionHash);
    return true;
}

export async function deleteUser(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    const rows = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id });
    // Der Zwischenspeicher haelt die aufgeloesten Rechte je Zugang; ohne das
    // beantwortet er Anfragen zu einem geloeschten Zugang weiter.
    if (rows.length > 0) invalidatePermissionCache();
    return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Anmeldung: Fehlversuche und Sperren
// ---------------------------------------------------------------------------

/**
 * Zaehlt einen Fehlversuch und setzt bei Ueberschreiten die Kontosperre.
 *
 * Lag vorher als lokale Hilfsfunktion in der Anmelderoute -- die Sperrlogik
 * gehoert zum Benutzer, nicht zur Seite.
 */
export async function registerFailedLogin(id: string, attempts: number): Promise<void> {
    if (!isUuid(id)) return;
    const duration = lockoutDuration(attempts);
    await db
        .update(users)
        .set({
            failedLoginAttempts: attempts,
            lockedUntil: duration > 0 ? new Date(Date.now() + duration) : null,
            updatedAt: new Date()
        })
        .where(eq(users.id, id));
}

export async function registerSuccessfulLogin(id: string): Promise<void> {
    if (!isUuid(id)) return;
    await db
        .update(users)
        .set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() })
        .where(eq(users.id, id));
}

/** Hebt eine Kontosperre von Hand auf. */
export async function unlockUser(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    const rows = await db
        .update(users)
        .set({ failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning({ id: users.id });
    return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Verknuepfung mit Mitgliedern
// ---------------------------------------------------------------------------

/**
 * Es gab bisher VIER parallele Verknuepfungsfelder zwischen Benutzern und
 * Mitgliedern: users.memberIds, users.memberId, members.userIds und
 * members.users. Massgeblich ist ab jetzt ausschliesslich user_members.
 */

export async function assignMemberToUser(userId: string, memberId: string): Promise<boolean> {
    if (!isUuid(userId) || !isUuid(memberId)) return false;
    await db.insert(userMembers).values({ userId, memberId }).onConflictDoNothing();
    return true;
}

export async function removeMemberFromUser(userId: string, memberId: string): Promise<boolean> {
    if (!isUuid(userId) || !isUuid(memberId)) return false;
    await db
        .delete(userMembers)
        .where(and(eq(userMembers.userId, userId), eq(userMembers.memberId, memberId)));
    return true;
}

/** Benutzer, die mit einem Mitglied verknuepft sind. */
export async function getUsersForMember(memberId: string): Promise<User[]> {
    if (!isUuid(memberId)) return [];
    const rows = await db
        .select({ user: users })
        .from(users)
        .innerJoin(userMembers, eq(userMembers.userId, users.id))
        .where(eq(userMembers.memberId, memberId));
    return attachRelations(rows.map((row) => row.user));
}

/**
 * Setzt die Zugaenge, die auf ein Mitglied zeigen -- die Gegenrichtung zu
 * updateUser({ memberIds }).
 *
 * Vorher stand das als zwei updateMany mit $pull und $addToSet direkt in der
 * Mitgliederseite; schlug das zweite fehl, war das Mitglied von allen
 * Zugaengen getrennt.
 */
export async function setUsersForMember(memberId: string, userIds: string[]): Promise<void> {
    if (!isUuid(memberId)) return;
    // Aendert, welche Aemter ein Zugang innehat -- und damit seine Rechte.
    invalidatePermissionCache();
    const valid = Array.from(new Set(onlyUuids(userIds)));

    await withTransaction(async (tx) => {
        await tx.delete(userMembers).where(eq(userMembers.memberId, memberId));
        if (valid.length === 0) return;
        await tx
            .insert(userMembers)
            .values(valid.map((userId) => ({ userId, memberId })))
            .onConflictDoNothing();
    });
}

/**
 * Entfernt ein geloeschtes Mitglied aus allen Zugaengen.
 *
 * Wird durch den Fremdschluessel eigentlich schon erledigt; die Funktion
 * bleibt fuer Aufrufer erhalten, die sie ausdruecklich anstossen.
 */
export async function unlinkMemberFromAllUsers(memberId: string): Promise<void> {
    if (!isUuid(memberId)) return;
    await db.delete(userMembers).where(eq(userMembers.memberId, memberId));
}

// ---------------------------------------------------------------------------
// Zwei-Faktor
// ---------------------------------------------------------------------------

/**
 * Die MFA-Felder lagen frueher als eingebettetes Dokument am Benutzer und
 * wurden von drei Routen direkt beschrieben -- einmal davon mit Punktpfaden
 * ("mfa.enabled"), einmal durch Ersetzen des gesamten Teildokuments. Beim
 * Deaktivieren blieb dabei das verschluesselte Geheimnis stehen. Hier ist es
 * eine Stelle mit klaren Uebergaengen.
 */

/** Schritt 1: Geheimnis hinterlegen, aber noch nicht aktivieren. */
export async function startMfaEnrolment(id: string, encryptedSecret: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    const rows = await db
        .update(users)
        .set({
            mfaEnabled: false,
            mfaSecret: encryptedSecret,
            mfaRecoveryCodes: [],
            mfaConfirmedAt: null,
            updatedAt: new Date()
        })
        .where(eq(users.id, id))
        .returning({ id: users.id });
    return rows.length > 0;
}

/** Schritt 2: Nach bestaetigtem Code aktivieren. */
export async function confirmMfa(id: string, hashedRecoveryCodes: string[]): Promise<boolean> {
    if (!isUuid(id)) return false;
    const rows = await db
        .update(users)
        .set({
            mfaEnabled: true,
            mfaConfirmedAt: new Date(),
            mfaRecoveryCodes: hashedRecoveryCodes,
            updatedAt: new Date()
        })
        .where(eq(users.id, id))
        .returning({ id: users.id });
    return rows.length > 0;
}

/** Abschalten -- das Geheimnis wird dabei ausdruecklich entfernt. */
export async function disableMfa(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    const rows = await db
        .update(users)
        .set({
            mfaEnabled: false,
            mfaSecret: null,
            mfaRecoveryCodes: [],
            mfaConfirmedAt: null,
            updatedAt: new Date()
        })
        .where(eq(users.id, id))
        .returning({ id: users.id });
    return rows.length > 0;
}

/** Verbrauchte Wiederherstellungscodes zurueckschreiben. */
export async function setRecoveryCodes(id: string, remaining: string[]): Promise<void> {
    if (!isUuid(id)) return;
    await db.update(users).set({ mfaRecoveryCodes: remaining }).where(eq(users.id, id));
}

/**
 * Passwortwechsel durch den Benutzer selbst.
 *
 * Anders als setPassword() werden hier NICHT alle Sitzungen beendet -- die
 * aufrufende Route behaelt die eigene Sitzung und beendet die uebrigen
 * gezielt, damit man sich nicht selbst aussperrt.
 */
export async function updatePasswordHash(id: string, passwordHash: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    const rows = await db
        .update(users)
        .set({ passwordHash, passwordChangedAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning({ id: users.id });
    return rows.length > 0;
}
