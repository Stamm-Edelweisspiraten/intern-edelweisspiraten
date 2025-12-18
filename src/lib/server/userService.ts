import { db } from "$lib/server/mongo";
import { env } from "$env/dynamic/private";
import { ObjectId } from "mongodb";
import * as crypto from "node:crypto";

import { welcomeTemplate } from "$lib/server/emailTemplates/welcome";

function isUUID(val: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);
}

// -----------------------------------------------------
//  Passwort Generator
// -----------------------------------------------------
function generatePassword(length = 16) {
    return crypto.randomBytes(length).toString("base64").slice(0, length);
}

// -----------------------------------------------------
//  Helper: Authentik PATCH
// -----------------------------------------------------
async function patchAuthentikUser(pk: number, data: Record<string, any>) {
    const res = await fetch(`${env.AUTHENTIK_URL}/api/v3/core/users/${pk}/`, {
        method: "PATCH",
        headers: {
            "Authorization": `Bearer ${env.AUTHENTIK_TOKEN}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(data)
    });

    if (!res.ok) {
        const text = await res.text();
        console.error("AUTHENTIK PATCH ERROR:", text);
        throw new Error("Authentik User Update failed");
    }

    return res.json();
}

// -----------------------------------------------------
//    Helper: Gruppen vollständig setzen
// -----------------------------------------------------
export async function setAuthentikUserGroups(pk: number, groups: string[]) {
    return await patchAuthentikUser(pk, { groups });
}

async function resolveAuthentikGroupIds(namesOrIds: string[]) {
    const unique = Array.from(new Set(namesOrIds.filter(Boolean)));
    if (unique.length === 0) return [];

    const ids = unique.filter(isUUID);
    const names = unique.filter((g) => !isUUID(g));
    if (names.length === 0) return ids;

    const res = await fetch(`${env.AUTHENTIK_URL}/api/v3/core/groups/?page_size=1000`, {
        headers: { Authorization: `Bearer ${env.AUTHENTIK_TOKEN}` }
    });
    if (!res.ok) {
        const err = await res.text();
        console.error("AUTHENTIK GROUP FETCH ERROR:", err);
        throw new Error("Authentik group lookup failed");
    }
    const payload = await res.json();
    const map = new Map<string, string>(
        (payload.results ?? []).map((g: any) => [g.name, g.pk?.toString?.() ?? g.id ?? ""])
    );

    names.forEach((name) => {
        const found = map.get(name);
        if (found && isUUID(found)) {
            ids.push(found);
        } else {
            console.warn(`Authentik group not found for name "${name}"`);
        }
    });

    return Array.from(new Set(ids));
}

// -----------------------------------------------------
//  Authentik User erstellen (OHNE Passwort!)
// -----------------------------------------------------
async function createAuthentikUser({ username, email, name }: {
    username: string, email: string, name: string
}) {
    const res = await fetch(`${env.AUTHENTIK_URL}/api/v3/core/users/`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${env.AUTHENTIK_TOKEN}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            username,
            email,
            name
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        console.error("AUTHENTIK CREATE ERROR:", err);
        throw new Error("Authentik user creation failed");
    }

    return await res.json();
}

function normalizePart(part: string) {
    return part
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

function buildUsernameFromName(fullName: string, email: string) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 0) {
        return email;
    }
    const first = normalizePart(parts[0]);
    const last = normalizePart(parts.length > 1 ? parts[parts.length - 1] : parts[0]);

    const base = [first || null, last || null].filter(Boolean).join(".");
    return base || email;
}

// -----------------------------------------------------
//  CREATE USER (Mongo + Authentik + Passwort + E-Mail)
// -----------------------------------------------------
export async function createUser({
    name,
    email,
    type = "parent",
    groups,
    password: providedPassword
}: {
    name: string,
    email: string,
    type: string,
    groups: string[],
    password?: string | null
}) {

    const { sendEmail } = await import("$lib/server/emailService");

    // ----------------------------------------------------
    // 1) ZUERST MONGO USER ANLEGEN
    // ----------------------------------------------------
    const mongoRes = await db.collection("users").insertOne({
        name,
        email,
        type,
        groups,
        memberIds: [],
        authentikId: null,
        createdAt: new Date()
    });

    // ----------------------------------------------------
    // 2) AUTHENTIK USER OHNE PASSWORT ERZEUGEN
    // ----------------------------------------------------
    const username = buildUsernameFromName(name, email);

    const akUser = await createAuthentikUser({
        username,
        email,
        name
    });

    // ----------------------------------------------------
    // 3) PASSWORT SETZEN (entweder übergeben oder generiert)
    // ----------------------------------------------------
    const finalPassword = providedPassword || generatePassword();

    const pwRes = await fetch(`${env.AUTHENTIK_URL}/api/v3/core/users/${akUser.pk}/set_password/`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${env.AUTHENTIK_TOKEN}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            password: finalPassword
        })
    });

    if (!pwRes.ok) {
        const err = await pwRes.text();
        console.error("AUTHENTIK SET PASSWORD ERROR:", err);
        throw new Error("Authentik password setup failed");
    }

    // ----------------------------------------------------
    // 4) GRUPPEN SETZEN
    // ----------------------------------------------------
    const memberGroupId = env.AUTHENTIK_MEMBER_GROUP_ID;
    const memberGroupName = env.AUTHENTIK_MEMBER_GROUP_NAME;
    const defaults = memberGroupId ? [memberGroupId] : memberGroupName ? [memberGroupName] : ["ep-member"];

    // resolve provided groups + defaults by name or keep UUIDs
    const resolvedGroups = await resolveAuthentikGroupIds([...(groups ?? []), ...defaults]);
    await setAuthentikUserGroups(akUser.pk, resolvedGroups);

    // ----------------------------------------------------
    // 5) AUTHENTIK-ID in Mongo speichern
    // ----------------------------------------------------
    await db.collection("users").updateOne(
        { _id: mongoRes.insertedId },
        { $set: { authentikId: akUser.pk } }
    );

    // ----------------------------------------------------
    // 6) E-MAIL SENDEN (ohne Klartext-Passwort)
    // ----------------------------------------------------
    if (providedPassword) {
        await sendEmail({
            to: email,
            subject: "Dein Benutzerkonto wurde erstellt",
            html: `
                <p>Hallo ${name},</p>
                <p>dein Benutzerkonto wurde erfolgreich erstellt.</p>
                <p>Anmeldename: <strong>${username}</strong><br/>E-Mail: <strong>${email}</strong></p>
                <p>Bitte setze dein Passwort auf der Login-Seite über "Passwort vergessen" selbst oder nutze das von dir gesetzte Passwort.</p>
                <p>Viele Grüße<br>Edelweisspiraten Bremen</p>
            `,
            text: `Hallo ${name}, dein Konto wurde erstellt.
Anmeldename: ${username}
E-Mail: ${email}
Bitte setze dein Passwort über "Passwort vergessen" oder nutze das von dir vergebene Passwort.`
        });

    } else {
        await sendEmail({
            to: email,
            subject: "Dein Benutzerkonto wurde erstellt",
            html: welcomeTemplate(name, username, email),
            text: `Hallo ${name}, dein Benutzerkonto wurde erstellt.
Anmeldename: ${username}
E-Mail: ${email}
Bitte setze dein eigenes Passwort über die Login-Seite (Passwort vergessen).`
        });
    }
    // ----------------------------------------------------
    // 7) Rückgabe
    // ----------------------------------------------------
    return {
        mongoId: mongoRes.insertedId,
        authentikId: akUser.pk,
        password: finalPassword,
        passwordWasGenerated: !providedPassword
    };
}

// -----------------------------------------------------
//  UPDATE USER
// -----------------------------------------------------
export async function updateUser(id: string, data: any) {
    const mongoId = new ObjectId(id);
    const user = await db.collection("users").findOne({ _id: mongoId });

    if (!user) throw new Error("User not found locally");

    // Mongo Update
    if (data.groups) {
        // Resolve group names/UUIDs to Authentik IDs and persist them as such
        data.groups = await resolveAuthentikGroupIds(data.groups);
    }
    await db.collection("users").updateOne({ _id: mongoId }, { $set: data });

    // Authentik Update
    const akPatchData: Record<string, any> = {};

    if (data.name) akPatchData.name = data.name;
    if (data.email) akPatchData.email = data.email;
    if (data.groups) akPatchData.groups = data.groups;

    if (user.authentikId) {
        await patchAuthentikUser(user.authentikId, akPatchData);
    } else {
        console.warn("Authentik-ID fehlt für User", id);
    }

    return true;
}

// -----------------------------------------------------
//  DELETE USER
// -----------------------------------------------------
export async function deleteUser(id: string) {
    const mongoId = new ObjectId(id);
    const user = await db.collection("users").findOne({ _id: mongoId });

    if (!user) return;

    // -------------------------------------------
    // 1) Authentik -> User löschen
    // -------------------------------------------
    if (user.authentikId) {
        const res = await fetch(`${env.AUTHENTIK_URL}/api/v3/core/users/${user.authentikId}/`, {
            method: "DELETE",
            headers: {
                "Authorization": `Bearer ${env.AUTHENTIK_TOKEN}`
            }
        });

        if (!res.ok) {
            console.error("AUTHENTIK DELETE ERROR:", res.status, await res.text());
        }
    }

    // -------------------------------------------
    // 2) Member <-> User Verknüpfungen lösen
    // -------------------------------------------
    await db.collection("members").updateMany(
        { users: id },
        { $pull: { users: id } }
    );

    await db.collection("members").updateMany(
        { userIds: id },
        { $pull: { userIds: id } }
    );

    // -------------------------------------------
    // 3) MongoDB -> User löschen
    // -------------------------------------------
    return await db.collection("users").deleteOne({ _id: mongoId });
}

// -----------------------------------------------------
//  GETTERS
// -----------------------------------------------------
export async function getUser(id: string) {
    return await db.collection("users").findOne({ _id: new ObjectId(id) });
}

export async function getAllUsers() {
    return await db.collection("users").find().toArray();
}

export async function getUserByEmail(email: string) {
    if (!email) return null;
    const normalized = email.toLowerCase?.() ?? email;
    return await db.collection("users").findOne({ email: normalized });
}

export async function assignMemberToUser(userId: string, memberId: string) {
    const mongoId = new ObjectId(userId);

    const result = await db.collection("users").updateOne(
        { _id: mongoId },
        {
            $addToSet: { memberIds: memberId }
        }
    );

    return result.modifiedCount > 0;
}

export async function removeMemberFromUser(userId: string, memberId: string) {
    const mongoId = new ObjectId(userId);

    const result = await db.collection("users").updateOne(
        { _id: mongoId },
        {
            $pull: { memberIds: memberId }
        }
    );

    return result.modifiedCount > 0;
}
