import { db } from "$lib/server/mongo";
import { ObjectId } from "mongodb";

export interface Position {
    id?: string;
    name: string;
    email?: string;
    description?: string;
    memberIds?: string[];
    type: "amt" | "gruppenleiter";
    groupId?: string;
}

export async function createPosition(data: Position) {
    const res = await db.collection("positions").insertOne({
        name: data.name,
        email: data.email ?? "",
        description: data.description ?? "",
        memberIds: data.memberIds ?? [],
        type: data.type,
        groupId: data.groupId ?? "",
        createdAt: new Date(),
        updatedAt: new Date()
    });

    return {
        ...data,
        id: res.insertedId.toString()
    };
}

export async function deletePosition(id: string) {
    return db.collection("positions").deleteOne({ _id: new ObjectId(id) });
}

export async function updatePosition(id: string, data: Partial<Position>) {
    const mongoId = new ObjectId(id);

    const payload = {
        ...data,
        updatedAt: new Date()
    };

    await db.collection("positions").updateOne(
        { _id: mongoId },
        { $set: payload }
    );

    return true;
}

export async function getAllPositions() {
    const list = await db.collection("positions")
        .find()
        .sort({ name: 1 })
        .toArray();

    return list.map((p: any) => ({
        id: p._id.toString(),
        name: p.name,
        email: p.email ?? "",
        description: p.description ?? "",
        type: p.type ?? "amt",
        groupId: p.groupId ?? "",
        memberIds: Array.isArray(p.memberIds)
            ? p.memberIds.map((id: any) => id.toString())
            : p.memberId
                ? [p.memberId.toString()]
                : []
    }));
}

export async function getPositionsByMemberIds(memberIds: string[]) {
    if (!memberIds || memberIds.length === 0) return [];

    return db.collection("positions")
        .find({ memberIds: { $in: memberIds } })
        .toArray()
        .then((list: any[]) =>
            list.map((p) => ({
                id: p._id.toString(),
                name: p.name,
                email: p.email ?? "",
                description: p.description ?? "",
                memberIds: Array.isArray(p.memberIds)
                    ? p.memberIds.map((id: any) => id.toString())
                    : []
            }))
        );
}
