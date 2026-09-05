import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "$lib/server/db";
import { isUuid } from "$lib/server/db/ids";
import { roles, userRoles } from "$lib/server/db/schema";
import { invalidatePermissionCache } from "$lib/server/permissionService";

/**
 * Interne Rollen statt der bisherigen Gruppen des externen Anbieters.
 *
 * Vorher wurden Berechtigungen ueber die kleingeschriebenen Gruppennamen aus
 * dem Token gegen die Collection groupPermissions gematcht, wobei der
 * Gruppenname dort nicht kleingeschrieben gespeichert wurde -- die Zuordnung
 * funktionierte also nur zufaellig. Zusaetzlich gab es eine fest verdrahtete
 * Sonderregel, die der Gruppe "ep-admin" alle Rechte gab.
 */

export type Role = typeof roles.$inferSelect;

export const SYSTEM_ROLE_KEYS = {
    admin: "admin",
    member: "mitglied",
    parent: "eltern",
    groupLeader: "gruppenleitung",
    council: "stammesfuehrung"
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
        permissions: [
            "dashboard.view",
            "kaemmerer.access",
            "kaemmerer.order.view",
            "kaemmerer.order.create"
        ],
        system: true
    },
    {
        key: SYSTEM_ROLE_KEYS.parent,
        name: "Eltern",
        description: "Zugriff auf die Daten der eigenen Kinder.",
        permissions: [
            "dashboard.view",
            "kaemmerer.access",
            "kaemmerer.order.view",
            "kaemmerer.order.create"
        ],
        system: true
    },
    {
        key: SYSTEM_ROLE_KEYS.groupLeader,
        name: "Gruppenleitung",
        description:
            "Mitglieder, Termine und Dateien der eigenen Gruppe. Wird üblicherweise für " +
            "eine bestimmte Gruppe zugewiesen – dann gelten alle Rechte nur dort.",
        permissions: [
            "dashboard.view",
            "members.view",
            "members.create",
            "members.edit",
            "groups.view",
            "events.view",
            "events.manage",
            "files.view",
            "files.upload",
            "kaemmerer.access",
            "kaemmerer.order.view",
            "kaemmerer.order.create"
        ],
        system: true
    },
    {
        key: SYSTEM_ROLE_KEYS.council,
        name: "Stammesführung",
        description:
            "Stammesweiter Zugriff auf Mitglieder, Gruppen, Termine, Dateien und die " +
            "Kasse – ohne Systemeinstellungen und Zugangsverwaltung.",
        permissions: [
            "dashboard.view",
            "members.*",
            "groups.*",
            "events.*",
            "files.*",
            "finance.view",
            "finance.export",
            "kaemmerer.access",
            "kaemmerer.order.view",
            "kaemmerer.order.create",
            "kaemmerer.orders.view"
        ],
        system: true
    }
];

/**
 * Legt fehlende Systemrollen an. Bestehende Rollen bleiben unveraendert,
 * damit angepasste Berechtigungen nicht bei jedem Start ueberschrieben werden
 * -- deshalb doNothing statt doUpdate.
 */
export async function ensureDefaultRoles(): Promise<void> {
    for (const role of DEFAULT_ROLES) {
        await db
            .insert(roles)
            .values({
                key: role.key,
                name: role.name,
                description: role.description ?? "",
                permissions: role.permissions,
                requireMfa: role.requireMfa ?? false,
                system: true
            })
            .onConflictDoNothing({ target: roles.key });
    }
}

export async function listRoles(): Promise<Role[]> {
    return db.select().from(roles).orderBy(desc(roles.system), asc(roles.name));
}

export async function getRoleByKey(key: string): Promise<Role | null> {
    const [row] = await db.select().from(roles).where(eq(roles.key, key)).limit(1);
    return row ?? null;
}

export async function getRoleById(id: string): Promise<Role | null> {
    if (!isUuid(id)) return null;
    const [row] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
    return row ?? null;
}

export async function getRolesByIds(ids: string[]): Promise<Role[]> {
    const valid = ids.filter(isUuid);
    if (valid.length === 0) return [];
    return db.select().from(roles).where(inArray(roles.id, valid));
}

export async function createRole(input: RoleInput): Promise<Role> {
    const [row] = await db
        .insert(roles)
        .values({
            key: input.key.trim().toLowerCase(),
            name: input.name.trim(),
            description: input.description?.trim() ?? "",
            permissions: normalizePermissions(input.permissions),
            requireMfa: input.requireMfa ?? false,
            system: false
        })
        .returning();
    invalidatePermissionCache();
    return row;
}

export async function updateRole(
    id: string,
    input: Partial<Omit<RoleInput, "key">>
): Promise<boolean> {
    if (!isUuid(id)) return false;

    const update: Partial<typeof roles.$inferInsert> = { updatedAt: new Date() };
    if (input.name !== undefined) update.name = input.name.trim();
    if (input.description !== undefined) update.description = input.description.trim();
    if (input.permissions !== undefined) {
        update.permissions = normalizePermissions(input.permissions);
    }
    if (input.requireMfa !== undefined) update.requireMfa = input.requireMfa;

    const rows = await db.update(roles).set(update).where(eq(roles.id, id)).returning({
        id: roles.id
    });
    if (rows.length > 0) invalidatePermissionCache();
    return rows.length > 0;
}

/**
 * Systemrollen sind geschuetzt. Die Zuordnungen zu Benutzern verschwinden
 * ueber den Fremdschluessel mit -- in MongoDB musste dafuer eigens ein
 * updateMany mit $pull laufen, das bei einem Fehler auf halber Strecke
 * verwaiste Kennungen hinterlassen konnte.
 */
export async function deleteRole(id: string): Promise<{ ok: boolean; reason?: string }> {
    if (!isUuid(id)) return { ok: false, reason: "Ungültige Kennung." };

    const role = await getRoleById(id);
    if (!role) return { ok: false, reason: "Rolle nicht gefunden." };
    if (role.system) return { ok: false, reason: "Systemrollen können nicht gelöscht werden." };

    await db.delete(roles).where(eq(roles.id, id));
    invalidatePermissionCache();
    return { ok: true };
}

/**
 * Anzahl der Benutzer je Rolle, fuer die Rollenuebersicht.
 *
 * `count(distinct user_id)`, nicht `count(*)`: seit eine Rolle je Gruppe
 * zugewiesen werden kann, hat derselbe Zugang moeglicherweise mehrere Zeilen
 * fuer dieselbe Rolle.
 */
export async function countUsersPerRole(): Promise<Map<string, number>> {
    const rows = await db
        .select({
            roleId: userRoles.roleId,
            count: sql<number>`count(distinct ${userRoles.userId})::int`
        })
        .from(userRoles)
        .groupBy(userRoles.roleId);

    return new Map(rows.map((row) => [row.roleId, Number(row.count)]));
}

function normalizePermissions(permissions: string[]): string[] {
    return Array.from(new Set(permissions.map((p) => p.trim()).filter(Boolean))).sort();
}
