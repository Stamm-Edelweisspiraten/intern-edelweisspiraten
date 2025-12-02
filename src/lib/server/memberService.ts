import { db } from "$lib/server/mongo";
import { ObjectId } from "mongodb";

// -----------------------------------------------------
//  Types
// -----------------------------------------------------

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

export interface Member {
    _id?: ObjectId;
    firstname: string;
    lastname: string;
    birthday: string;
    address: MemberAddress;
    stand: string;
    status: string;
    emails: MemberEmail[];
    numbers: MemberNumber[];
    group: string;      // Gruppen-ID
    users: string[];
    entryDate: string;
    updatedAt: string;
    updatedBy: string;
    inviteCode?: string;
}


// -----------------------------------------------------
//  CREATE MEMBER
// -----------------------------------------------------
export async function createMember(member: {
    birthday: string;
    emails: { label: string; email: string }[];
    firstname: string;
    address: { zip: string; city: string; street: string };
    updatedBy: string;
    entryDate: string;
    numbers: { label: string; number: string }[];
    groups: any;
    stand: string;
    users: any[];
    lastname: string;
    status: string
}) {

    const payload = {
        ...member,
        updatedAt: new Date().toISOString()
    };

    const res = await db.collection("members").insertOne(payload);

    const memberId = res.insertedId.toString();

    // Invite Code erzeugen
    await assignInviteCode(memberId);

    return { ...payload, _id: res.insertedId };
}


// -----------------------------------------------------
//  GET MEMBER BY ID
// -----------------------------------------------------
export async function getMember(id: string) {
    return await db.collection("members").findOne({ _id: new ObjectId(id) });
}


// -----------------------------------------------------
//  GET ALL MEMBERS
// -----------------------------------------------------
export async function getAllMembers() {
    return await db.collection("members").find().toArray();
}


// -----------------------------------------------------
//  UPDATE MEMBER
// -----------------------------------------------------
export async function updateMember(id: string, data: Partial<Member>, updatedBy: string) {

    const mongoId = new ObjectId(id);

    const payload = {
        ...data,
        updatedBy,
        updatedAt: new Date().toISOString()
    };

    await db.collection("members").updateOne(
        { _id: mongoId },
        { $set: payload }
    );

    return true;
}


// -----------------------------------------------------
//  DELETE MEMBER
// -----------------------------------------------------
export async function deleteMember(id: string) {
    return await db.collection("members").deleteOne({ _id: new ObjectId(id) });
}


// -----------------------------------------------------
//  SEARCH MEMBERS
// -----------------------------------------------------
export async function searchMembers(query: string) {
    if (!query || query.trim().length === 0) {
        return await getAllMembers();
    }

    const q = query.trim();

    return await db.collection("members")
        .find({
            $or: [
                { firstname: { $regex: q, $options: "i" } },
                { lastname: { $regex: q, $options: "i" } },
                { group: { $regex: q, $options: "i" } },
                { status: { $regex: q, $options: "i" } },
                { stand: { $regex: q, $options: "i" } },
                { users: { $in: [q] } },
                { "emails.email": { $regex: q, $options: "i" } },
                { "emails.label": { $regex: q, $options: "i" } }
            ]
        })
        .toArray();
}


// -----------------------------------------------------
//  LINK USER TO MEMBER
// -----------------------------------------------------
export async function addUserToMember(memberId: string, userId: string) {

    await db.collection("members").updateOne(
        { _id: new ObjectId(memberId) },
        { $addToSet: { users: userId } }
    );

    return true;
}


// -----------------------------------------------------
//  INVITE CODE
// -----------------------------------------------------
export function generateInviteCode(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";

    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }

    return code;
}

export async function assignInviteCode(memberId: string) {
    const inviteCode = generateInviteCode();

    await db.collection("members").updateOne(
        { _id: new ObjectId(memberId) },
        { $set: { inviteCode } }
    );

    return inviteCode;
}


// -----------------------------------------------------
//  GROUP → MEMBER METHODS
// -----------------------------------------------------

/**
 * Setzt die Gruppe eines Members
 */
export async function setMemberGroup(memberId: string, groupId: string) {
    await db.collection("members").updateOne(
        { _id: new ObjectId(memberId) },
        {
            $set: {
                group: groupId,
                updatedAt: new Date().toISOString()
            }
        }
    );
    return true;
}


/**
 * Entfernt die Gruppe eines Members
 */
export async function removeMemberGroup(memberId: string) {
    await db.collection("members").updateOne(
        { _id: new ObjectId(memberId) },
        {
            $set: {
                group: "",
                updatedAt: new Date().toISOString()
            }
        }
    );
    return true;
}


/**
 * Holt alle Mitglieder einer Gruppe
 */
export async function getMembersByGroup(groupId: string) {
    return await db.collection("members")
        .find({ group: groupId })
        .toArray();
}


/**
 * Entfernt eine Gruppe aus ALLEN Mitgliedern (z. B. beim Löschen der Gruppe)
 */
export async function unlinkGroupFromAllMembers(groupId: string) {
    await db.collection("members").updateMany(
        { group: groupId },
        {
            $set: {
                group: "",
                updatedAt: new Date().toISOString()
            }
        }
    );

    return true;
}
