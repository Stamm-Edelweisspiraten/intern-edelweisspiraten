import { db } from "$lib/server/mongo";
import { ObjectId } from "mongodb";
import { unlinkGroupFromAllMembers } from "$lib/server/memberService";

export interface Group {
    id?: string;
    name: string;
    type: "sippe" | "meute";
    meeting_time: string;   // z. B. "Monday 4:30 PM"
    description?: string;
    replyTo?: string;
}


// -----------------------------------------------------
// CREATE GROUP
// -----------------------------------------------------
export async function createGroup(data: Group) {
    const res = await db.collection("groups").insertOne({
        name: data.name,
        type: data.type,
        meeting_time: data.meeting_time,
        description: data.description || "",
        replyTo: data.replyTo || "",
        createdAt: new Date(),
        updatedAt: new Date()
    });

    return {
        id: res.insertedId.toString(),
        ...data
    };
}


// -----------------------------------------------------
// UPDATE GROUP
// -----------------------------------------------------
export async function updateGroup(id: string, data: {
    meeting_time: string;
    name: string;
    description: string;
    type: string;
    replyTo?: string;
}) {
    const mongoId = new ObjectId(id);

    const updateData = {
        ...data,
        updatedAt: new Date()
    };

    await db.collection("groups").updateOne(
        { _id: mongoId },
        { $set: updateData }
    );

    return true;
}


// -----------------------------------------------------
// DELETE GROUP
// -----------------------------------------------------

export async function deleteGroup(id: string) {
    const mongoId = new ObjectId(id);

    // 1) Gruppe aus allen Membern entfernen
    await unlinkGroupFromAllMembers(id);

    // 2) Gruppe löschen
    return await db.collection("groups").deleteOne({ _id: mongoId });
}


// -----------------------------------------------------
// GET ONE GROUP
// -----------------------------------------------------
export async function getGroup(id: string) {
    const g = await db.collection("groups").findOne({ _id: new ObjectId(id) });

    if (!g) return null;

    return {
        id: g._id.toString(),
        name: g.name,
        type: g.type,
        meeting_time: g.meeting_time,
        description: g.description,
        replyTo: g.replyTo ?? ""
    };
}



// -----------------------------------------------------
// GET ALL GROUPS
// -----------------------------------------------------
export async function getAllGroups() {
    const groups = await db.collection("groups")
        .find()
        .sort({ name: 1 })
        .toArray();

    return groups.map(g => ({
        id: g._id.toString(),
        name: g.name,
        type: g.type,
        meeting_time: g.meeting_time,
        description: g.description,
        replyTo: g.replyTo ?? ""
    }));
}
