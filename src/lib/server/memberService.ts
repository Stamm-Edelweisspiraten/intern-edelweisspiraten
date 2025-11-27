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
    birthday: string; // ISO String (Frontend parsed)
    address: MemberAddress;
    stand: string;
    status: string;
    emails: MemberEmail[];
    numbers: MemberNumber[];
    group: string;
    users: string[]; // Liste von verknüpften UserIDs
    entryDate: string;
    updatedAt: string;
    updatedBy: string;
}


// -----------------------------------------------------
//  CREATE MEMBER
// -----------------------------------------------------
export async function createMember(member: Omit<Member, "_id" | "updatedAt"> & { updatedBy: string }) {

    const payload = {
        ...member,
        updatedAt: new Date().toISOString()
    };

    const res = await db.collection("members").insertOne(payload);
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
//  SEARCH MEMBERS (Name, Gruppe, Status, Email, User-ID)
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
//  UNLINK USER FROM MEMBER
// -----------------------------------------------------
/*export async function removeUserFromMember(memberId: string, userId: string) {
    await db.collection("members").updateOne(
        { _id: new ObjectId(memberId) },
        { $pull: { users: { $eq: userId } } }
    );
    return true;
}
 */