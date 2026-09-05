import { asc, eq } from "drizzle-orm";
import { db } from "$lib/server/db";
import { isUuid } from "$lib/server/db/ids";
import { groups } from "$lib/server/db/schema";

export interface Group {
    id: string;
    name: string;
    type: "sippe" | "meute";
    /** Freitext, z. B. "Montag 16:30 Uhr". */
    meeting_time: string;
    description: string;
    replyTo: string;
}

export interface GroupInput {
    name: string;
    type: "sippe" | "meute";
    meeting_time: string;
    description?: string;
    replyTo?: string;
}

type GroupRow = typeof groups.$inferSelect;

function toGroup(row: GroupRow): Group {
    return {
        id: row.id,
        name: row.name,
        type: row.type,
        meeting_time: row.meetingTime,
        description: row.description,
        replyTo: row.replyTo
    };
}

export async function createGroup(input: GroupInput): Promise<Group> {
    const [row] = await db
        .insert(groups)
        .values({
            name: input.name.trim(),
            type: input.type,
            meetingTime: input.meeting_time ?? "",
            description: input.description ?? "",
            replyTo: input.replyTo ?? ""
        })
        .returning();
    return toGroup(row);
}

export async function updateGroup(id: string, input: Partial<GroupInput>): Promise<boolean> {
    if (!isUuid(id)) return false;

    const update: Partial<typeof groups.$inferInsert> = { updatedAt: new Date() };
    if (input.name !== undefined) update.name = input.name.trim();
    if (input.type !== undefined) update.type = input.type;
    if (input.meeting_time !== undefined) update.meetingTime = input.meeting_time;
    if (input.description !== undefined) update.description = input.description;
    if (input.replyTo !== undefined) update.replyTo = input.replyTo;

    const rows = await db.update(groups).set(update).where(eq(groups.id, id)).returning({
        id: groups.id
    });
    return rows.length > 0;
}

/**
 * Loescht die Gruppe. Die Zuordnungen in member_groups und die Gruppenbindung
 * der Aemter verschwinden ueber die Fremdschluessel mit -- in MongoDB musste
 * dafuer eigens unlinkGroupFromAllMembers laufen, das bei einem Abbruch auf
 * halber Strecke verwaiste Kennungen hinterlassen konnte.
 */
export async function deleteGroup(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    const rows = await db.delete(groups).where(eq(groups.id, id)).returning({ id: groups.id });
    return rows.length > 0;
}

export async function getGroup(id: string): Promise<Group | null> {
    if (!isUuid(id)) return null;
    const [row] = await db.select().from(groups).where(eq(groups.id, id)).limit(1);
    return row ? toGroup(row) : null;
}

export async function getAllGroups(): Promise<Group[]> {
    const rows = await db.select().from(groups).orderBy(asc(groups.name));
    return rows.map(toGroup);
}
