import { ObjectId } from "mongodb";
import { users, type UserDoc, type UserStatus } from "$lib/server/db/collections";
import { hashPassword } from "$lib/server/auth/password";
import { getRoleByKey } from "$lib/server/roleService";
import { revokeAllForUser } from "$lib/server/auth/session";

/**
 * Benutzerverwaltung gegen die eigene Datenbank.
 *
 * Vorher war dieses Modul im Wesentlichen ein Proxy auf die Admin-API des
 * externen Anbieters: Benutzer wurden dort angelegt, gepatcht, mit Gruppen
 * versehen und wieder geloescht -- und createUser hat das erzeugte Passwort
 * im Klartext an den Aufrufer zurueckgegeben.
 */

export function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

export interface CreateUserInput {
    name: string;
    email: string;
    type?: "parent" | "child";
    roleIds?: ObjectId[];
    roleKeys?: string[];
    memberIds?: string[];
    /** Ohne Passwort entsteht ein eingeladener Zugang ohne Anmeldemöglichkeit. */
    password?: string;
    status?: UserStatus;
}

export interface CreateUserResult {
    ok: boolean;
    user?: UserDoc;
    error?: string;
}

export async function createUser(input: CreateUserInput): Promise<CreateUserResult> {
    const email = normalizeEmail(input.email);
    if (!email || !email.includes("@")) {
        return { ok: false, error: "Bitte eine gültige E-Mail-Adresse angeben." };
    }

    const existing = await users().findOne({ email });
    if (existing) {
        return { ok: false, error: "Für diese E-Mail-Adresse existiert bereits ein Zugang." };
    }

    const roleIds = await resolveRoleIds(input.roleIds, input.roleKeys);

    const doc: UserDoc = {
        name: input.name.trim(),
        email,
        passwordHash: input.password ? await hashPassword(input.password) : "",
        passwordChangedAt: input.password ? new Date() : undefined,
        status: input.status ?? (input.password ? "active" : "invited"),
        type: input.type ?? "parent",
        roleIds,
        memberIds: input.memberIds ?? [],
        failedLoginAttempts: 0,
        lockedUntil: null,
        createdAt: new Date()
    };

    try {
        const result = await users().insertOne(doc);
        return { ok: true, user: { ...doc, _id: result.insertedId } };
    } catch (err: unknown) {
        // Der eindeutige Index auf email faengt auch parallele Anlagen ab.
        if ((err as { code?: number })?.code === 11000) {
            return { ok: false, error: "Für diese E-Mail-Adresse existiert bereits ein Zugang." };
        }
        throw err;
    }
}

async function resolveRoleIds(
    roleIds?: ObjectId[],
    roleKeys?: string[]
): Promise<ObjectId[]> {
    const ids = [...(roleIds ?? [])];

    for (const key of roleKeys ?? []) {
        const role = await getRoleByKey(key);
        if (role?._id) ids.push(role._id);
    }

    const seen = new Set<string>();
    return ids.filter((id) => {
        const value = id.toString();
        if (seen.has(value)) return false;
        seen.add(value);
        return true;
    });
}

export async function getUser(id: string): Promise<UserDoc | null> {
    if (!ObjectId.isValid(id)) return null;
    return users().findOne({ _id: new ObjectId(id) });
}

export async function getUserByEmail(email: string): Promise<UserDoc | null> {
    return users().findOne({ email: normalizeEmail(email) });
}

export async function getAllUsers(): Promise<UserDoc[]> {
    return users().find().sort({ name: 1 }).toArray();
}

export async function countActiveUsers(): Promise<number> {
    return users().countDocuments({ status: "active", passwordHash: { $ne: "" } });
}

export interface UpdateUserInput {
    name?: string;
    email?: string;
    type?: "parent" | "child";
    roleIds?: ObjectId[];
    memberIds?: string[];
    status?: UserStatus;
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<CreateUserResult> {
    if (!ObjectId.isValid(id)) return { ok: false, error: "Ungültige Kennung." };

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) update.name = input.name.trim();
    if (input.type !== undefined) update.type = input.type;
    if (input.roleIds !== undefined) update.roleIds = input.roleIds;
    if (input.memberIds !== undefined) update.memberIds = input.memberIds;
    if (input.status !== undefined) update.status = input.status;

    if (input.email !== undefined) {
        const email = normalizeEmail(input.email);
        const conflict = await users().findOne({ email, _id: { $ne: new ObjectId(id) } });
        if (conflict) {
            return { ok: false, error: "Diese E-Mail-Adresse wird bereits verwendet." };
        }
        update.email = email;
    }

    await users().updateOne({ _id: new ObjectId(id) }, { $set: update });

    // Ein deaktivierter Zugang darf nicht weiterlaufen.
    if (input.status && input.status !== "active") {
        await revokeAllForUser(new ObjectId(id));
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
    if (!ObjectId.isValid(id)) return false;

    const objectId = new ObjectId(id);
    const result = await users().updateOne(
        { _id: objectId },
        {
            $set: {
                passwordHash: await hashPassword(password),
                passwordChangedAt: new Date(),
                status: "active",
                failedLoginAttempts: 0,
                lockedUntil: null,
                updatedAt: new Date()
            }
        }
    );

    if (result.matchedCount === 0) return false;

    await revokeAllForUser(objectId, options.keepSessionHash);
    return true;
}

export async function deleteUser(id: string): Promise<boolean> {
    if (!ObjectId.isValid(id)) return false;

    const objectId = new ObjectId(id);
    await revokeAllForUser(objectId);
    const result = await users().deleteOne({ _id: objectId });
    return result.deletedCount > 0;
}

// ---------------------------------------------------------------------------
// Verknuepfung mit Mitgliedern
// ---------------------------------------------------------------------------

/**
 * Es gab bisher VIER parallele Verknuepfungsfelder zwischen Benutzern und
 * Mitgliedern: users.memberIds, users.memberId, members.userIds und
 * members.users. Massgeblich ist ab jetzt ausschliesslich users.memberIds.
 */

export async function assignMemberToUser(userId: string, memberId: string): Promise<boolean> {
    if (!ObjectId.isValid(userId)) return false;
    const result = await users().updateOne(
        { _id: new ObjectId(userId) },
        { $addToSet: { memberIds: memberId }, $set: { updatedAt: new Date() } }
    );
    return result.matchedCount > 0;
}

export async function removeMemberFromUser(userId: string, memberId: string): Promise<boolean> {
    if (!ObjectId.isValid(userId)) return false;
    const result = await users().updateOne(
        { _id: new ObjectId(userId) },
        { $pull: { memberIds: memberId }, $set: { updatedAt: new Date() } }
    );
    return result.matchedCount > 0;
}

/** Benutzer, die mit einem Mitglied verknuepft sind. */
export async function getUsersForMember(memberId: string): Promise<UserDoc[]> {
    return users().find({ memberIds: memberId }).toArray();
}

/** Entfernt ein geloeschtes Mitglied aus allen Zugaengen. */
export async function unlinkMemberFromAllUsers(memberId: string): Promise<void> {
    await users().updateMany({ memberIds: memberId }, { $pull: { memberIds: memberId } });
}
