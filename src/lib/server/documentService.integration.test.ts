import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "$env/dynamic/private";

/**
 * Sichtbarkeit von Ordnern gegen eine echte Datenbank.
 *
 * Geprüft wird das, was sich nur im Zusammenspiel zeigt: die Vererbung an
 * Unterordner, die vier Freigabearten und die Frage, ob jemand ohne Freigabe
 * über die Adresszeile weiterkommt.
 *
 * Übersprungen ohne DATABASE_URL.
 */

const ready = Boolean(env.DATABASE_URL);
const maybe = ready ? describe : describe.skip;

maybe("Ordnerfreigaben", () => {
    const PREFIX = "itest-";

    let meuteId = "";
    let sippeId = "";
    let roleId = "";
    let positionId = "";
    let memberId = "";
    let userId = "";
    let outsiderId = "";

    let rootId = "";
    let childId = "";
    let grandchildId = "";
    let otherId = "";

    beforeAll(async () => {
        const { db } = await import("$lib/server/db");
        const schema = await import("$lib/server/db/schema");
        const { createFolder, setFolderShares } = await import("$lib/server/documentService");

        const [meute] = await db
            .insert(schema.groups)
            .values({ name: `${PREFIX}Meute`, type: "meute" })
            .returning({ id: schema.groups.id });
        meuteId = meute.id;

        const [sippe] = await db
            .insert(schema.groups)
            .values({ name: `${PREFIX}Sippe`, type: "sippe" })
            .returning({ id: schema.groups.id });
        sippeId = sippe.id;

        const [role] = await db
            .insert(schema.roles)
            .values({ key: `${PREFIX}rolle`, name: "Testrolle", permissions: [] })
            .returning({ id: schema.roles.id });
        roleId = role.id;

        const [position] = await db
            .insert(schema.positions)
            .values({ name: `${PREFIX}Amt`, type: "amt" })
            .returning({ id: schema.positions.id });
        positionId = position.id;

        const [member] = await db
            .insert(schema.members)
            .values({ firstname: "Itest", lastname: "Person" })
            .returning({ id: schema.members.id });
        memberId = member.id;

        await db.insert(schema.memberGroups).values({ memberId, groupId: meuteId });
        await db.insert(schema.positionMembers).values({ positionId, memberId });

        const [user] = await db
            .insert(schema.users)
            .values({ name: "Itest", email: `${PREFIX}a@example.org`, passwordHash: "" })
            .returning({ id: schema.users.id });
        userId = user.id;
        await db.insert(schema.userMembers).values({ userId, memberId });

        const [outsider] = await db
            .insert(schema.users)
            .values({ name: "Fremd", email: `${PREFIX}b@example.org`, passwordHash: "" })
            .returning({ id: schema.users.id });
        outsiderId = outsider.id;

        const root = await createFolder({ name: `${PREFIX}Wurzel` }, userId);
        rootId = root.id!;
        const child = await createFolder({ name: `${PREFIX}Kind`, parentId: rootId }, userId);
        childId = child.id!;
        const grandchild = await createFolder(
            { name: `${PREFIX}Enkel`, parentId: childId },
            userId
        );
        grandchildId = grandchild.id!;
        const other = await createFolder({ name: `${PREFIX}Fremd` }, userId);
        otherId = other.id!;

        // Nur die Wurzel wird freigegeben -- an die Meute, ohne Schreibrecht.
        await setFolderShares(rootId, [
            { targetKind: "group", targetId: meuteId, canWrite: false }
        ]);
        // Der fremde Ordner geht an die andere Gruppe.
        await setFolderShares(otherId, [
            { targetKind: "group", targetId: sippeId, canWrite: true }
        ]);
    });

    afterAll(async () => {
        const { db } = await import("$lib/server/db");
        const schema = await import("$lib/server/db/schema");
        const { like, or, eq, inArray } = await import("drizzle-orm");

        await db.delete(schema.folders).where(like(schema.folders.name, `${PREFIX}%`));
        await db.delete(schema.positions).where(like(schema.positions.name, `${PREFIX}%`));
        await db.delete(schema.users).where(like(schema.users.email, `${PREFIX}%`));
        await db.delete(schema.members).where(eq(schema.members.firstname, "Itest"));
        await db.delete(schema.roles).where(like(schema.roles.key, `${PREFIX}%`));
        await db.delete(schema.groups).where(like(schema.groups.name, `${PREFIX}%`));
        void or;
        void inArray;
    });

    it("gibt die freigegebene Wurzel frei", async () => {
        const { listFolders } = await import("$lib/server/documentService");
        const folders = await listFolders({ id: userId, memberIds: [memberId] });
        const ids = folders.map((folder) => folder.id);

        expect(ids).toContain(rootId);
    });

    it("vererbt an Unterordner und Unter-Unterordner", async () => {
        const { listFolders } = await import("$lib/server/documentService");
        const folders = await listFolders({ id: userId, memberIds: [memberId] });

        const child = folders.find((folder) => folder.id === childId);
        const grandchild = folders.find((folder) => folder.id === grandchildId);

        expect(child).toBeTruthy();
        expect(grandchild).toBeTruthy();
        // Sie tragen keine eigenen Freigaben -- die Sichtbarkeit kommt von oben.
        expect(child?.inherited).toBe(true);
        expect(grandchild?.inherited).toBe(true);
        expect(child?.shares).toEqual([]);
    });

    it("zeigt keinen Ordner, der einer fremden Gruppe gehört", async () => {
        const { listFolders, getFolder } = await import("$lib/server/documentService");
        const folders = await listFolders({ id: userId, memberIds: [memberId] });

        expect(folders.map((folder) => folder.id)).not.toContain(otherId);
        // Auch nicht über die direkte Adresse.
        expect(await getFolder(otherId, { id: userId, memberIds: [memberId] })).toBeNull();
    });

    it("zeigt einem Zugang ohne Mitglied und ohne Rolle gar nichts", async () => {
        const { listFolders } = await import("$lib/server/documentService");
        const folders = await listFolders({ id: outsiderId, memberIds: [] });
        expect(folders).toEqual([]);
    });

    it("erbt das Schreibrecht mit", async () => {
        const { listFolders, setFolderShares } = await import("$lib/server/documentService");

        await setFolderShares(rootId, [
            { targetKind: "group", targetId: meuteId, canWrite: true }
        ]);

        const folders = await listFolders({ id: userId, memberIds: [memberId] });
        expect(folders.find((folder) => folder.id === grandchildId)?.canWrite).toBe(true);

        await setFolderShares(rootId, [
            { targetKind: "group", targetId: meuteId, canWrite: false }
        ]);
    });

    it("greift auch über ein Amt, eine Rolle und die Person selbst", async () => {
        const { db } = await import("$lib/server/db");
        const schema = await import("$lib/server/db/schema");
        const { listFolders, setFolderShares } = await import("$lib/server/documentService");

        for (const share of [
            { targetKind: "position" as const, targetId: positionId },
            { targetKind: "role" as const, targetId: roleId },
            { targetKind: "user" as const, targetId: userId }
        ]) {
            if (share.targetKind === "role") {
                // Die Rolle muss dem Zugang zugewiesen sein, damit sie zählt.
                await db.insert(schema.userRoles).values({ userId, roleId }).onConflictDoNothing();
            }

            await setFolderShares(otherId, [{ ...share, canWrite: false }]);

            const folders = await listFolders({ id: userId, memberIds: [memberId] });
            expect(
                folders.map((folder) => folder.id),
                `Freigabe an ${share.targetKind} greift nicht`
            ).toContain(otherId);
        }

        await setFolderShares(otherId, [
            { targetKind: "group", targetId: sippeId, canWrite: true }
        ]);
    });

    it("files.manage stammesweit sieht alles", async () => {
        const { listFolders } = await import("$lib/server/documentService");
        const folders = await listFolders({ id: outsiderId, memberIds: [] }, { manageAll: true });

        const ids = folders.map((folder) => folder.id);
        expect(ids).toContain(rootId);
        expect(ids).toContain(otherId);
        expect(folders.every((folder) => folder.canWrite)).toBe(true);
    });

    it("verweigert das Verschieben in den eigenen Unterordner", async () => {
        const { updateFolder } = await import("$lib/server/documentService");
        const result = await updateFolder(rootId, { parentId: grandchildId });
        expect(result.ok).toBe(false);
    });
});
