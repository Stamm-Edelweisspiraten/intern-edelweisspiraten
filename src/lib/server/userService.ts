import { db } from "$lib/server/mongo";
import { AUTHENTIK_TOKEN, AUTHENTIK_URL } from '$env/static/private';
import { ObjectId } from "mongodb";
import * as crypto from "node:crypto";

import { welcomeTemplate } from "$lib/server/emailTemplates/welcome";


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
    const res = await fetch(`${AUTHENTIK_URL}/api/v3/core/users/${pk}/`, {
        method: "PATCH",
        headers: {
            "Authorization": `Bearer ${AUTHENTIK_TOKEN}`,
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
//  Helper: Gruppen vollständig setzen
// -----------------------------------------------------
export async function setAuthentikUserGroups(pk: number, groups: string[]) {
    return await patchAuthentikUser(pk, { groups });
}


// -----------------------------------------------------
//  Authentik User erstellen (OHNE Passwort!)
// -----------------------------------------------------
async function createAuthentikUser({ username, email, name }: {
    username: string, email: string, name: string
}) {
    const res = await fetch(`${AUTHENTIK_URL}/api/v3/core/users/`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${AUTHENTIK_TOKEN}`,
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


// -----------------------------------------------------
//  CREATE USER (Mongo + Authentik + Passwort + E-Mail)
// -----------------------------------------------------
export async function createUser({ name, email, groups }: {
    name: string, email: string, groups: string[]
}) {

    const { sendEmail } = await import("$lib/server/emailService");

    // 1) Mongo speichern
    const mongoRes = await db.collection("users").insertOne({
        name,
        email,
        groups,
        memberId: [],
        authentikId: null,
        createdAt: new Date()
    });

    // 2) Authentik User anlegen (OHNE Passwort)
    const akUser = await createAuthentikUser({ username: email, email, name });

    // 3) Passwort generieren
    const password = generatePassword();

    // 4) Passwort korrekt setzen (richtiger Authentik Endpoint)
    const pwRes = await fetch(`${AUTHENTIK_URL}/api/v3/core/users/${akUser.pk}/set_password/`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${AUTHENTIK_TOKEN}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            password: password
        })
    });

    if (!pwRes.ok) {
        const errTxt = await pwRes.text();
        console.error("AUTHENTIK SET PASSWORD ERROR:", errTxt);
        throw new Error("Authentik password setup failed");
    }

    // 5) Gruppen vollständig setzen
    await setAuthentikUserGroups(akUser.pk, groups);

    // 6) authentikId zurück in Mongo
    await db.collection("users").updateOne(
        { _id: mongoRes.insertedId },
        { $set: { authentikId: akUser.pk } }
    );

    // 7) Willkommensmail senden
    await sendEmail({
        to: email,
        subject: "Willkommen bei den Edelweißpiraten!",
        html: welcomeTemplate(name, password),
        text: `Hallo ${name},\nDein Passwort lautet: ${password}\nBitte ändere es nach dem Login.`
    });

    return {
        mongoId: mongoRes.insertedId,
        authentikId: akUser.pk,
        password
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
    await db.collection("users").updateOne({ _id: mongoId }, { $set: data });

    // Authentik Update
    const akPatchData: Record<string, any> = {};

    if (data.name) akPatchData.name = data.name;
    if (data.email) akPatchData.email = data.email;
    if (data.groups) akPatchData.groups = data.groups;

    await patchAuthentikUser(user.authentikId, akPatchData);

    return true;
}


// -----------------------------------------------------
//  DELETE USER
// -----------------------------------------------------
export async function deleteUser(id: string) {
    const mongoId = new ObjectId(id);
    const user = await db.collection("users").findOne({ _id: mongoId });

    if (!user) return;

    if (user.authentikId) {
        await fetch(`${AUTHENTIK_URL}/api/v3/core/users/${user.authentikId}/`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${AUTHENTIK_TOKEN}` }
        });
    }

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

