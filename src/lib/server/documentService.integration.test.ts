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

    /** Kennungen der im Test angelegten Dokumente -- fuer das Aufraeumen. */
    const createdDocuments: string[] = [];

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
        const { deleteDocument } = await import("$lib/server/documentService");

        // Zuerst die Dokumente: nur ueber deleteDocument verschwindet auch die
        // Zeile in `files` (und, wenn eingerichtet, das Objekt im Speicher).
        for (const id of createdDocuments) await deleteDocument(id);

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

    // -----------------------------------------------------------------------
    // Umbenennen, verschieben, sammeln
    // -----------------------------------------------------------------------

    /**
     * Eine kleine, echte PDF-Datei.
     *
     * `addDocument` prueft seit Paket F die ersten Bytes gegen den gemeldeten
     * Typ -- ein leerer Puffer mit dem Etikett "application/pdf" wuerde
     * (richtigerweise) abgewiesen.
     */
    function pdfUpload(name: string) {
        const content = Buffer.from("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n1 0 obj\n", "binary");
        return {
            name,
            size: content.byteLength,
            type: "application/pdf",
            arrayBuffer: async () =>
                content.buffer.slice(
                    content.byteOffset,
                    content.byteOffset + content.byteLength
                )
        };
    }

    async function addTo(folderId: string, name: string): Promise<string> {
        const { addDocument } = await import("$lib/server/documentService");
        const result = await addDocument({
            folderId,
            file: pdfUpload(name),
            title: name,
            createdBy: userId
        });

        expect(result.ok, result.error ?? "").toBe(true);
        createdDocuments.push(result.id!);
        return result.id!;
    }

    /** Der Blick des Testbenutzers -- ohne stammesweites files.manage. */
    const asUser = () => ({ viewer: { id: userId, memberIds: [memberId] }, manageAll: false });

    /**
     * Ausgangslage fuer diesen Abschnitt: die Wurzel (und damit ihre
     * Unterordner) gehoert dem Benutzer mit Schreibrecht, der fremde Ordner
     * einer Gruppe, in der er nicht ist.
     */
    async function shareForWrite() {
        const { setFolderShares } = await import("$lib/server/documentService");
        await setFolderShares(rootId, [
            { targetKind: "group", targetId: meuteId, canWrite: true }
        ]);
        await setFolderShares(otherId, [
            { targetKind: "group", targetId: sippeId, canWrite: true }
        ]);
    }

    it("benennt eine Datei um", async () => {
        const { listDocuments, renameDocument } = await import("$lib/server/documentService");
        await shareForWrite();

        const id = await addTo(rootId, "urspruenglich.pdf");

        const result = await renameDocument(
            id,
            { title: "Neuer Titel", filename: "neu.pdf" },
            asUser()
        );
        expect(result.ok, result.error ?? "").toBe(true);

        const entry = (await listDocuments(rootId)).find((row) => row.id === id);
        expect(entry?.title).toBe("Neuer Titel");
        expect(entry?.filename).toBe("neu.pdf");
    });

    it("laesst die Dateiendung beim Umbenennen nicht wechseln", async () => {
        const { renameDocument } = await import("$lib/server/documentService");
        await shareForWrite();

        const id = await addTo(rootId, "bericht.pdf");

        // Aus einer PDF-Datei soll nicht nachtraeglich eine HTML-Seite werden.
        const result = await renameDocument(id, { filename: "bericht.html" }, asUser());
        expect(result.ok).toBe(false);
    });

    it("verschiebt eine Datei in einen Unterordner", async () => {
        const { listDocuments, moveDocument } = await import("$lib/server/documentService");
        await shareForWrite();

        const id = await addTo(rootId, "wandert.pdf");

        const result = await moveDocument(id, childId, asUser());
        expect(result.ok, result.error ?? "").toBe(true);

        expect((await listDocuments(childId)).map((row) => row.id)).toContain(id);
        expect((await listDocuments(rootId)).map((row) => row.id)).not.toContain(id);
    });

    it("verweigert das Verschieben in einen fremden Ordner", async () => {
        const { listDocuments, moveDocument } = await import("$lib/server/documentService");
        await shareForWrite();

        const id = await addTo(rootId, "bleibt.pdf");

        // Der Zielordner gehoert einer Gruppe, in der der Benutzer nicht ist.
        const result = await moveDocument(id, otherId, asUser());
        expect(result.ok).toBe(false);
        expect((await listDocuments(rootId)).map((row) => row.id)).toContain(id);
    });

    it("verweigert das Herausholen aus einem fremden Ordner", async () => {
        const { listDocuments, moveDocument } = await import("$lib/server/documentService");
        await shareForWrite();

        // Direkt in den fremden Ordner gelegt -- addDocument prueft keine
        // Freigaben, das tut die Route davor.
        const id = await addTo(otherId, "fremd.pdf");

        const result = await moveDocument(id, rootId, asUser());
        expect(result.ok).toBe(false);
        expect((await listDocuments(otherId)).map((row) => row.id)).toContain(id);
    });

    it("verweigert das Umbenennen in einem fremden Ordner", async () => {
        const { renameDocument } = await import("$lib/server/documentService");
        await shareForWrite();

        const id = await addTo(otherId, "fremd-titel.pdf");

        const result = await renameDocument(id, { title: "Umbenannt" }, asUser());
        expect(result.ok).toBe(false);
    });

    it("verweigert jede Aenderung ohne Schreibrecht am eigenen Ordner", async () => {
        const { moveDocument, renameDocument, setFolderShares } = await import(
            "$lib/server/documentService"
        );

        // Sichtbar, aber nur lesend.
        await setFolderShares(rootId, [
            { targetKind: "group", targetId: meuteId, canWrite: false }
        ]);

        const id = await addTo(rootId, "nur-lesen.pdf");

        expect((await renameDocument(id, { title: "X" }, asUser())).ok).toBe(false);
        expect((await moveDocument(id, childId, asUser())).ok).toBe(false);

        await shareForWrite();
    });

    it("loescht eine Auswahl auf einmal", async () => {
        const { deleteDocuments, listDocuments } = await import("$lib/server/documentService");
        await shareForWrite();

        const ids = [
            await addTo(rootId, "stapel-a.pdf"),
            await addTo(rootId, "stapel-b.pdf"),
            await addTo(rootId, "stapel-c.pdf")
        ];

        const result = await deleteDocuments(ids, asUser());
        expect(result.ok).toBe(true);
        expect(result.deleted).toBe(3);

        const remaining = (await listDocuments(rootId)).map((row) => row.id);
        for (const id of ids) expect(remaining).not.toContain(id);
    });

    it("ueberspringt beim Sammel-Loeschen, was einem fremden Ordner gehoert", async () => {
        const { deleteDocuments, listDocuments } = await import("$lib/server/documentService");
        await shareForWrite();

        const eigen = await addTo(rootId, "eigen.pdf");
        const fremd = await addTo(otherId, "fremd-loeschen.pdf");

        const result = await deleteDocuments([eigen, fremd], asUser());

        expect(result.deleted).toBe(1);
        // Der Hinweis nennt die uebersprungene Datei -- still verschwinden
        // darf sie nicht.
        expect(result.error).toBeTruthy();
        expect((await listDocuments(otherId)).map((row) => row.id)).toContain(fremd);
    });

    it("sortiert die Dateiliste nach Name und Richtung", async () => {
        const { listDocuments } = await import("$lib/server/documentService");
        await shareForWrite();

        await addTo(childId, "aaa-sortier.pdf");
        await addTo(childId, "zzz-sortier.pdf");

        const byName = await listDocuments(childId, { sort: "name", direction: "asc" });
        const titles = byName.map((row) => row.title);
        expect(titles.indexOf("aaa-sortier.pdf")).toBeLessThan(
            titles.indexOf("zzz-sortier.pdf")
        );

        const desc = await listDocuments(childId, { sort: "name", direction: "desc" });
        expect(desc.map((row) => row.title)).toEqual([...titles].reverse());
    });

    it("zaehlt Anzahl und Groesse je Ordner", async () => {
        const { listFolders } = await import("$lib/server/documentService");
        await shareForWrite();

        await addTo(grandchildId, "gezaehlt.pdf");

        const folders = await listFolders({ id: userId, memberIds: [memberId] });
        const grandchild = folders.find((folder) => folder.id === grandchildId);

        expect(grandchild?.documentCount).toBe(1);
        expect(grandchild?.totalBytes).toBeGreaterThan(0);
    });
});
