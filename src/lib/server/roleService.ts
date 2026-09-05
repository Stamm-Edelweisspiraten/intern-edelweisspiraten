import { ObjectId } from "mongodb";
import { roles, users, type RoleDoc } from "$lib/server/db/collections";

/**
 * Interne Rollen statt der bisherigen Gruppen des externen Anbieters.
 *
 * Vorher wurden Berechtigungen ueber die kleingeschriebenen Gruppennamen aus
 * dem Token gegen die Collection groupPermissions gematcht, wobei der
 * Gruppenname dort nicht kleingeschrieben gespeichert wurde -- die Zuordnung
 * funktionierte also nur zufaellig. Zusaetzlich gab es eine fest verdrahtete
 * Sonderregel, die der Gruppe "ep-admin" alle Rechte gab.
 */

export const SYSTEM_ROLE_KEYS = {
    admin: "admin",
    member: "mitglied",
    parent: "eltern"
} as const;

export interface RoleInput {
    key: string;
    name: string;
    description?: string;
    permissions: string[];
    requireMfa?: boolean;
    system?: boolean;
}

/** Rollen, die beim Start vorhanden sein muessen. */
const DEFAULT_ROLES: RoleInput[] = [
    {
        key: SYSTEM_ROLE_KEYS.admin,
        name: "Administration",
        description: "Vollzugriff auf alle Bereiche.",
        permissions: ["*"],
        requireMfa: true,
        system: true
    },
    {
        key: SYSTEM_ROLE_KEYS.member,
        name: "Mitglied",
        description: "Zugriff auf den eigenen Bereich und eigene Bestellungen.",
        permissions: ["dashboard.view", "kaemmerer.access", "kaemmerer.order.view", "kaemmerer.order.create"],
        system: true
    },
    {
        key: SYSTEM_ROLE_KEYS.parent,
        name: "Eltern",
        description: "Zugriff auf die Daten der eigenen Kinder.",
        permissions: ["dashboard.view", "kaemmerer.access", "kaemmerer.order.view", "kaemmerer.order.create"],
        system: true
    }
];

/**
 * Legt fehlende Systemrollen an. Bestehende Rollen bleiben unveraendert,
 * damit angepasste Berechtigungen nicht bei jedem Start ueberschrieben werden.
 */
export async function ensureDefaultRoles(): Promise<void> {
    for (const role of DEFAULT_ROLES) {
        await roles().updateOne(
            { key: role.key },
            {
                $setOnInsert: {
                    key: role.key,
                    name: role.name,
                    description: role.description ?? "",
                    permissions: role.permissions,
                    requireMfa: role.requireMfa ?? false,
                    system: true,
                    createdAt: new Date()
                }
            },
            { upsert: true }
        );
    }
}

export async function listRoles(): Promise<RoleDoc[]> {
    return roles().find().sort({ system: -1, name: 1 }).toArray();
}

export async function getRoleByKey(key: string): Promise<RoleDoc | null> {
    return roles().findOne({ key });
}

export async function getRoleById(id: string): Promise<RoleDoc | null> {
    if (!ObjectId.isValid(id)) return null;
    return roles().findOne({ _id: new ObjectId(id) });
}

export async function getRolesByIds(ids: ObjectId[]): Promise<RoleDoc[]> {
    if (ids.length === 0) return [];
    return roles().find({ _id: { $in: ids } }).toArray();
}

export async function createRole(input: RoleInput): Promise<RoleDoc> {
    const doc: RoleDoc = {
        key: input.key.trim().toLowerCase(),
        name: input.name.trim(),
        description: input.description?.trim() ?? "",
        permissions: normalizePermissions(input.permissions),
        system: false,
        createdAt: new Date()
    };

    const result = await roles().insertOne(doc);
    return { ...doc, _id: result.insertedId };
}

export async function updateRole(
    id: string,
    input: Partial<Omit<RoleInput, "key">>
): Promise<boolean> {
    if (!ObjectId.isValid(id)) return false;

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) update.name = input.name.trim();
    if (input.description !== undefined) update.description = input.description.trim();
    if (input.permissions !== undefined) update.permissions = normalizePermissions(input.permissions);
    if (input.requireMfa !== undefined) update.requireMfa = input.requireMfa;

    const result = await roles().updateOne({ _id: new ObjectId(id) }, { $set: update });
    return result.matchedCount > 0;
}

/** Systemrollen sind geschuetzt; zugewiesene Rollen werden mit entfernt. */
export async function deleteRole(id: string): Promise<{ ok: boolean; reason?: string }> {
    if (!ObjectId.isValid(id)) return { ok: false, reason: "Ungültige Kennung." };

    const objectId = new ObjectId(id);
    const role = await roles().findOne({ _id: objectId });
    if (!role) return { ok: false, reason: "Rolle nicht gefunden." };
    if (role.system) return { ok: false, reason: "Systemrollen können nicht gelöscht werden." };

    await users().updateMany({ roleIds: objectId }, { $pull: { roleIds: objectId } });
    await roles().deleteOne({ _id: objectId });
    return { ok: true };
}

/** Anzahl der Benutzer je Rolle, fuer die Rollenuebersicht. */
export async function countUsersPerRole(): Promise<Map<string, number>> {
    const rows = await users()
        .aggregate<{ _id: ObjectId; count: number }>([
            { $unwind: "$roleIds" },
            { $group: { _id: "$roleIds", count: { $sum: 1 } } }
        ])
        .toArray();

    return new Map(rows.map((row) => [row._id.toString(), row.count]));
}

function normalizePermissions(permissions: string[]): string[] {
    return Array.from(new Set(permissions.map((p) => p.trim()).filter(Boolean))).sort();
}
