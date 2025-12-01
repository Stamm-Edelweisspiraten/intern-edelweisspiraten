import {db} from "$lib/server/mongo";
import {AUTHENTIK_TOKEN, AUTHENTIK_URL} from '$env/static/private';
import {ObjectId} from "mongodb";
import * as crypto from "node:crypto";

import {welcomeTemplate} from "$lib/server/emailTemplates/welcome";


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
    return await patchAuthentikUser(pk, {groups});
}


// -----------------------------------------------------
//  Authentik User erstellen (OHNE Passwort!)
// -----------------------------------------------------
async function createAuthentikUser({username, email, name}: {
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

    const {sendEmail} = await import("$lib/server/emailService");

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
    const akUser = await createAuthentikUser({
        username: email,
        email,
        name
    });

    // ----------------------------------------------------
    // 3) PASSWORT SETZEN (entweder übergeben oder generiert)
    // ----------------------------------------------------
    const finalPassword = providedPassword || generatePassword();

    const pwRes = await fetch(`${AUTHENTIK_URL}/api/v3/core/users/${akUser.pk}/set_password/`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${AUTHENTIK_TOKEN}`,
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
    await setAuthentikUserGroups(akUser.pk, groups);

    // ----------------------------------------------------
    // 5) AUTHENTIK-ID in Mongo speichern
    // ----------------------------------------------------
    await db.collection("users").updateOne(
        {_id: mongoRes.insertedId},
        {$set: {authentikId: akUser.pk}}
    );

    // ----------------------------------------------------
    // 6) E-MAIL SENDEN
    // ----------------------------------------------------

    if (providedPassword) {
        // 📧 Wenn Passwort selbst gewählt wurde → ohne Passwort
        await sendEmail({
            to: email,
            subject: "Dein Benutzerkonto wurde erstellt",
            html: `
                <p>Hallo ${name},</p>
                <p>dein Benutzerkonto wurde erfolgreich erstellt.</p>
                <p>Du kannst dich jetzt mit deiner E-Mail-Adresse und deinem gewählten Passwort einloggen.</p>
                <p>Viele Grüße<br>Edelweißpiraten Bremen</p>
            `,
            text: `Hallo ${name}, dein Konto wurde erstellt. Du kannst dich ab jetzt einloggen.`
        });

    } else {
        // 📧 Wenn Passwort generiert wurde → Passwort mitsenden
        await sendEmail({
            to: email,
            subject: "Dein Benutzerkonto wurde erstellt – Zugangsdaten",
            html: welcomeTemplate(name, finalPassword),
            text: `Hallo ${name},\nDein Passwort lautet: ${finalPassword}\nBitte ändere es nach dem Login.`
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
    const user = await db.collection("users").findOne({_id: mongoId});

    if (!user) throw new Error("User not found locally");

    // Mongo Update
    await db.collection("users").updateOne({_id: mongoId}, {$set: data});

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
    const user = await db.collection("users").findOne({_id: mongoId});

    if (!user) return;

    // -------------------------------------------
    // 1) Authentik → User löschen
    // -------------------------------------------
    if (user.authentikId) {
        const res = await fetch(`${AUTHENTIK_URL}/api/v3/core/users/${user.authentikId}/`, {
            method: "DELETE",
            headers: {
                "Authorization": `Bearer ${AUTHENTIK_TOKEN}`
            }
        });

        if (!res.ok) {
            console.error("AUTHENTIK DELETE ERROR:", res.status, await res.text());
        }
    }


    // -------------------------------------------
    // 2) Member ↔ User Verknüpfungen lösen
    // -------------------------------------------
    await db.collection("members").updateMany(
        {users: id},                     // alle Mitglieder, wo dieser User eingetragen ist
        {$pull: {users: id}}           // diesen User aus "users" entfernen
    );

    // Falls du auch memberIds auf Userseite nutzt, sicherheitshalber:
    await db.collection("members").updateMany(
        {userIds: id},                   // falls noch altes Feld genutzt wurde
        {$pull: {userIds: id}}
    );

    // -------------------------------------------
    // 3) MongoDB → User löschen
    // -------------------------------------------
    return await db.collection("users").deleteOne({_id: mongoId});
}


// -----------------------------------------------------
//  GETTERS
// -----------------------------------------------------
export async function getUser(id: string) {
    return await db.collection("users").findOne({_id: new ObjectId(id)});
}

export async function getAllUsers() {
    return await db.collection("users").find().toArray();
}

export async function assignMemberToUser(userId: string, memberId: string) {
    const mongoId = new ObjectId(userId);

    const result = await db.collection("users").updateOne(
        {_id: mongoId},
        {
            $addToSet: {memberIds: memberId}
        }
    );

    return result.modifiedCount > 0;
}

export async function removeMemberFromUser(userId: string, memberId: string) {
    const mongoId = new ObjectId(userId);

    const result = await db.collection("users").updateOne(
        {_id: mongoId},
        {
            $pull: {memberIds: memberId}
        }
    );

    return result.modifiedCount > 0;
}

