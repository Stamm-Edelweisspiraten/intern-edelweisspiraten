import { asc, eq, inArray } from "drizzle-orm";
import { db, withTransaction, type Executor } from "$lib/server/db";
import { isUuid, onlyUuids } from "$lib/server/db/ids";
import { positionMembers, positions } from "$lib/server/db/schema";
import { invalidatePermissionCache } from "$lib/server/permissionService";

/**
 * Aemter und Gruppenleitungen.
 *
 * Die Inhaber standen frueher als Zeichenketten-Array `memberIds` am
 * Dokument, wobei aeltere Datensaetze stattdessen ein einzelnes `memberId`
 * trugen -- getAllPositions musste das bei jedem Lesen umschreiben. Jetzt
 * ist es eine Zuordnungstabelle.
 *
 * Neu: Ein Amt kann eine Rolle tragen (`roleId`). Wer das Amt innehat,
 * bekommt deren Rechte -- bei einem Amt mit `groupId` nur fuer diese Gruppe.
 * Damit sind "Gruppenleitung Meute Panther" und "Stammesfuehrung"
 * gewoehnliche Aemter; der Typ `gruppenleiter` ist nur noch Beschriftung.
 * Jede Aenderung verwirft den Rechte-Cache, sonst wirkte sie bis zu einer
 * Minute nicht.
 */

export interface Position {
    id: string;
    name: string;
    email: string;
    description: string;
    memberIds: string[];
    type: "amt" | "gruppenleiter";
    groupId: string;
    /** Rolle, die das Amt vergibt; leer, wenn es keine Rechte traegt. */
    roleId: string;
}

export interface PositionInput {
    name: string;
    email?: string;
    description?: string;
    memberIds?: string[];
    type: "amt" | "gruppenleiter";
    groupId?: string | null;
    roleId?: string | null;
}

type PositionRow = typeof positions.$inferSelect;

async function hydrate(rows: PositionRow[]): Promise<Position[]> {
    if (rows.length === 0) return [];

    const links = await db
        .select()
        .from(positionMembers)
        .where(
            inArray(
                positionMembers.positionId,
                rows.map((row) => row.id)
            )
        );

    const byPosition = new Map<string, string[]>();
    for (const link of links) {
        const list = byPosition.get(link.positionId) ?? [];
        list.push(link.memberId);
        byPosition.set(link.positionId, list);
    }

    return rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        description: row.description,
        type: row.type,
        groupId: row.groupId ?? "",
        roleId: row.roleId ?? "",
        memberIds: byPosition.get(row.id) ?? []
    }));
}

async function replaceMembers(
    tx: Executor,
    positionId: string,
    memberIds: string[]
): Promise<void> {
    await tx.delete(positionMembers).where(eq(positionMembers.positionId, positionId));
    const valid = Array.from(new Set(onlyUuids(memberIds)));
    if (valid.length === 0) return;
    await tx
        .insert(positionMembers)
        .values(valid.map((memberId) => ({ positionId, memberId })))
        .onConflictDoNothing();
}

export async function createPosition(input: PositionInput): Promise<Position> {
    const id = await withTransaction(async (tx) => {
        const [row] = await tx
            .insert(positions)
            .values({
                name: input.name.trim(),
                email: input.email ?? "",
                description: input.description ?? "",
                type: input.type,
                groupId: isUuid(input.groupId) ? input.groupId : null,
                roleId: isUuid(input.roleId) ? input.roleId : null
            })
            .returning({ id: positions.id });

        await replaceMembers(tx, row.id, input.memberIds ?? []);
        return row.id;
    });

    invalidatePermissionCache();

    const position = await getPosition(id);
    if (!position) throw new Error("Amt konnte nicht gelesen werden.");
    return position;
}

export async function updatePosition(id: string, input: Partial<PositionInput>): Promise<boolean> {
    if (!isUuid(id)) return false;

    const update: Partial<typeof positions.$inferInsert> = { updatedAt: new Date() };
    if (input.name !== undefined) update.name = input.name.trim();
    if (input.email !== undefined) update.email = input.email;
    if (input.description !== undefined) update.description = input.description;
    if (input.type !== undefined) update.type = input.type;
    if (input.groupId !== undefined) update.groupId = isUuid(input.groupId) ? input.groupId : null;
    if (input.roleId !== undefined) update.roleId = isUuid(input.roleId) ? input.roleId : null;

    await withTransaction(async (tx) => {
        await tx.update(positions).set(update).where(eq(positions.id, id));
        if (input.memberIds !== undefined) {
            await replaceMembers(tx, id, input.memberIds);
        }
    });

    invalidatePermissionCache();
    return true;
}

export async function deletePosition(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    const rows = await db
        .delete(positions)
        .where(eq(positions.id, id))
        .returning({ id: positions.id });
    if (rows.length > 0) invalidatePermissionCache();
    return rows.length > 0;
}

export async function getPosition(id: string): Promise<Position | null> {
    if (!isUuid(id)) return null;
    const rows = await db.select().from(positions).where(eq(positions.id, id)).limit(1);
    const [position] = await hydrate(rows);
    return position ?? null;
}

export async function getAllPositions(): Promise<Position[]> {
    const rows = await db.select().from(positions).orderBy(asc(positions.name));
    return hydrate(rows);
}

export async function getPositionsByMemberIds(memberIds: string[]): Promise<Position[]> {
    const valid = onlyUuids(memberIds);
    if (valid.length === 0) return [];

    const rows = await db
        .selectDistinct({ position: positions })
        .from(positions)
        .innerJoin(positionMembers, eq(positionMembers.positionId, positions.id))
        .where(inArray(positionMembers.memberId, valid));

    return hydrate(rows.map((row) => row.position));
}
