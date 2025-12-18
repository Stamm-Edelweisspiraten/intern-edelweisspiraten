import { db } from "$lib/server/mongo";
import { ALL_PERMISSIONS } from "$lib/permissions";
import { ObjectId } from "mongodb";

// --- Permissions ---
export async function getAllPermissions() {
    return await db.collection("groupPermissions").find().toArray();
}

export async function createPermission(key: string, description: string) {
    return await db.collection("groupPermissions").insertOne({ key, description });
}

export async function deletePermission(key: string) {
    return await db.collection("groupPermissions").deleteOne({ key });
}


// --- Permission Groups ---
export async function getPermissionGroup(authentikGroupPk: number) {
    return await db.collection("permissionGroups").findOne({ authentikGroupPk });
}

export async function setPermissionGroup(authentikGroupPk: number, permissions: string[]) {
    const col = db.collection("permissionGroups");

    return await col.updateOne(
        { authentikGroupPk },
        { $set: { permissions } },
        { upsert: true }
    );
}

export async function getPermissionsForUser(session: any): Promise<string[]> {
    if (!session) return [];

    const userGroups = session.userinfo?.groups ?? [];
    if (userGroups.length === 0) return [];

    // GroupPermissions aus DB holen (match via authentik-group-name)
    const groupEntries = await db.collection("groupPermissions")
        .find({
            $or: [
                { groupPk: { $in: userGroups } },
                { groupName: { $in: userGroups } }
            ]
        })
        .toArray();

    // flatten
    let perms = groupEntries.flatMap(e => e.permissions ?? []);

    // Fallback: ep-admin -> alles erlauben, falls keine expliziten Permissions gefunden
    if (perms.length === 0 && userGroups.includes("ep-admin")) {
        perms = ["*"];
    }

    // debug
    console.log("User Groups:", userGroups);
    console.log("Matched groupPermissions entries:", groupEntries);
    console.log("Flattened permissions:", perms);

    return perms;
}



export function hasPermission(
    permissions: string[],
    required: string
): boolean {
    if (!permissions || permissions.length === 0) return false;

    // Regel 1: Globale Wildcard
    if (permissions.includes("*")) return true;

    // Regel 2: Module-Wildcard (z.B. member.*)
    for (const perm of permissions) {
        if (perm.endsWith(".*")) {
            const prefix = perm.slice(0, -2);

            if (required.startsWith(prefix + ".")) {
                return true;
            }
        }
    }

    // Regel 3: Exakte Matches
    return permissions.includes(required);
}

export async function getPermissionsForGroup(groupPk: string) {
    const entry = await db.collection("groupPermissions").findOne({ groupPk });
    return entry?.permissions ?? [];
}

export async function setPermissionsForGroup(groupPk: string, permissions: string[], groupName?: string) {
    await db.collection("groupPermissions").updateOne(
        { groupPk },
        { $set: { groupPk, groupName, permissions } },
        { upsert: true }
    );
}

export async function getAllDefinedPermissions() {
    return ALL_PERMISSIONS;
}

export async function getLeaderGroupIdsForUser(user: any): Promise<string[]> {
    const memberIds = user?.memberIds ?? [];
    if (!memberIds || memberIds.length === 0) return [];

    const positions = await db.collection("positions")
        .find({
            type: "gruppenleiter",
            memberIds: { $in: memberIds }
        })
        .toArray();

    const ids = positions
        .map((p: any) => p.groupId)
        .filter(Boolean)
        .map((id: any) => id.toString());

    // Fallback: Gruppen aus den eigenen Mitgliedseinträgen (falls Positionen nicht gepflegt)
    const memberDocs = await db.collection("members")
        .find({ _id: { $in: memberIds.map((id: string) => new ObjectId(id)) } })
        .project({ groups: 1 })
        .toArray();
    memberDocs.forEach((m: any) => {
        (m.groups ?? []).forEach((gid: any) => {
            if (gid) ids.push(gid.toString());
        });
    });

    return Array.from(new Set(ids));
}
