import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "$env/dynamic/private";

/**
 * Galerien gegen eine echte Datenbank.
 *
 * Geprueft wird das, was sich nur im Zusammenspiel von Dienst, Schema und
 * Dateiablage zeigt -- und zwar vor allem die Frage nach WAISEN: bleibt nach
 * einem Loeschvorgang eine `files`-Zeile (und damit ein Objekt im Speicher)
 * liegen, auf die nichts mehr zeigt? Der Fremdschluessel `file_id` steht
 * genau deswegen auf ON DELETE RESTRICT.
 *
 * Der Helfer `countFiles()` zaehlt vor und nach jedem zerstoerenden Fall die
 * Testdateien. Das ist die Zusicherung, die eine Waise wirklich findet -- eine
 * Pruefung auf "Bildzeile weg" allein wuerde sie uebersehen.
 *
 * Uebersprungen ohne DATABASE_URL.
 */

const ready = Boolean(env.DATABASE_URL);
const maybe = ready ? describe : describe.skip;

maybe("Galerien", () => {
    const PREFIX = "gtest-";

    let meuteId = "";
    let sippeId = "";
    let memberId = "";
    let userId = "";
    let outsiderId = "";
    let eventId = "";

    /** Ohne Freigabe -- also fuer alle sichtbar. */
    let openId = "";
    /** Nur fuer die Sippe freigegeben, in der der Testbenutzer nicht ist. */
    let closedId = "";

    const viewer = () => ({ id: userId, memberIds: [memberId] });

    /**
     * Ein echter PNG-Puffer.
     *
     * `checkUpload` prueft die ersten Bytes gegen den gemeldeten Typ -- ein
     * leerer Puffer mit dem Etikett "image/png" wuerde (richtigerweise)
     * abgewiesen. Die acht Bytes sind die PNG-Signatur, danach folgt der
     * Anfang eines IHDR-Blocks; mehr braucht die Pruefung nicht.
     */
    function pngBytes(): Buffer {
        return Buffer.from([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48,
            0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01
        ]);
    }

    /** Ein PDF-Puffer -- fuer den Fall "meldet image/png, ist aber keines". */
    function pdfBytes(): Buffer {
        return Buffer.from("%PDF-1.7\nnicht wirklich ein Bild\n", "binary");
    }

    /** Das, was eine Route aus `formData()` bekommt: etwas File-Aehnliches. */
    function upload(name: string, content: Buffer, type: string) {
        return {
            name,
            size: content.byteLength,
            type,
            arrayBuffer: async () =>
                content.buffer.slice(
                    content.byteOffset,
                    content.byteOffset + content.byteLength
                )
        };
    }

    /** Wie viele Testdateien liegen gerade in `files`? */
    async function countFiles(): Promise<number> {
        const { db } = await import("$lib/server/db");
        const schema = await import("$lib/server/db/schema");
        const { like, sql } = await import("drizzle-orm");

        const [row] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(schema.files)
            .where(like(schema.files.filename, `${PREFIX}%`));

        return Number(row?.count ?? 0);
    }

    async function addPng(
        galleryId: string,
        name: string,
        options: { withThumb?: boolean } = {}
    ): Promise<string> {
        const { addImage } = await import("$lib/server/galleryService");

        const result = await addImage({
            galleryId,
            file: upload(`${PREFIX}${name}.png`, pngBytes(), "image/png"),
            thumb: options.withThumb
                ? upload(`${PREFIX}${name}-vorschau.png`, pngBytes(), "image/png")
                : undefined,
            caption: name,
            width: 1200,
            height: 800,
            uploadedBy: userId
        });

        expect(result.ok, result.error ?? "").toBe(true);
        return result.id!;
    }

    /** Eine frische Galerie fuer einen zerstoerenden Fall. */
    async function freshGallery(title: string): Promise<string> {
        const { createGallery } = await import("$lib/server/galleryService");
        const result = await createGallery({ title: `${PREFIX}${title}` }, userId);
        expect(result.ok).toBe(true);
        return result.id!;
    }

    beforeAll(async () => {
        const { db } = await import("$lib/server/db");
        const schema = await import("$lib/server/db/schema");
        const { createGallery, setGalleryShares } = await import("$lib/server/galleryService");

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

        const [member] = await db
            .insert(schema.members)
            .values({ firstname: "Gtest", lastname: "Person" })
            .returning({ id: schema.members.id });
        memberId = member.id;

        await db.insert(schema.memberGroups).values({ memberId, groupId: meuteId });

        const [user] = await db
            .insert(schema.users)
            .values({ name: "Gtest", email: `${PREFIX}a@example.org`, passwordHash: "" })
            .returning({ id: schema.users.id });
        userId = user.id;
        await db.insert(schema.userMembers).values({ userId, memberId });

        const [outsider] = await db
            .insert(schema.users)
            .values({ name: "Fremd", email: `${PREFIX}b@example.org`, passwordHash: "" })
            .returning({ id: schema.users.id });
        outsiderId = outsider.id;

        const [event] = await db
            .insert(schema.events)
            .values({ title: `${PREFIX}Lager`, startsAt: new Date() })
            .returning({ id: schema.events.id });
        eventId = event.id;

        const open = await createGallery({ title: `${PREFIX}Offen` }, userId);
        openId = open.id!;

        const closed = await createGallery({ title: `${PREFIX}Geschlossen` }, userId);
        closedId = closed.id!;
        await setGalleryShares(closedId, [
            { targetKind: "group", targetId: sippeId, canWrite: true }
        ]);
    });

    afterAll(async () => {
        const { db } = await import("$lib/server/db");
        const schema = await import("$lib/server/db/schema");
        const { like, eq } = await import("drizzle-orm");
        const { deleteGallery } = await import("$lib/server/galleryService");

        /**
         * Zuerst die Galerien ueber den Dienst: nur so verschwinden auch die
         * `files`-Zeilen (und, wenn eingerichtet, die Objekte im Speicher).
         * Ein `DELETE FROM galleries` liesse sie liegen -- genau die Waisen,
         * die dieser Test sucht.
         */
        const rows = await db
            .select({ id: schema.galleries.id })
            .from(schema.galleries)
            .where(like(schema.galleries.title, `${PREFIX}%`));

        for (const row of rows) await deleteGallery(row.id);

        await db.delete(schema.events).where(like(schema.events.title, `${PREFIX}%`));
        await db.delete(schema.users).where(like(schema.users.email, `${PREFIX}%`));
        await db.delete(schema.members).where(eq(schema.members.firstname, "Gtest"));
        await db.delete(schema.groups).where(like(schema.groups.name, `${PREFIX}%`));
    });

    // -----------------------------------------------------------------------
    // Sichtbarkeit
    // -----------------------------------------------------------------------

    it("zeigt eine Galerie ohne Freigabe jedem", async () => {
        const { listGalleries } = await import("$lib/server/galleryService");

        const mine = await listGalleries(viewer());
        expect(mine.map((entry) => entry.id)).toContain(openId);

        // Auch ein Zugang ohne Mitglied und ohne Rolle sieht sie.
        const stranger = await listGalleries({ id: outsiderId, memberIds: [] });
        expect(stranger.map((entry) => entry.id)).toContain(openId);
    });

    it("grenzt mit einer Gruppenfreigabe ein", async () => {
        const { getGallery, listGalleries } = await import("$lib/server/galleryService");

        const mine = await listGalleries(viewer());
        expect(mine.map((entry) => entry.id)).not.toContain(closedId);

        // Auch nicht ueber die direkte Adresse.
        expect(await getGallery(closedId, viewer())).toBeNull();

        // Mit stammesweitem gallery.manage dagegen schon.
        expect(await getGallery(closedId, viewer(), { manageAll: true })).not.toBeNull();
    });

    it("erlaubt das Hochladen nur bei can_write", async () => {
        const { canUploadTo, setGalleryShares } = await import("$lib/server/galleryService");

        // Ohne Freigabe darf niemand ausser der stammesweiten Verwaltung.
        expect(await canUploadTo(openId, viewer())).toBe(false);
        expect(await canUploadTo(openId, viewer(), { manageAll: true })).toBe(true);

        const id = await freshGallery("Schreibrecht");
        await setGalleryShares(id, [
            { targetKind: "group", targetId: meuteId, canWrite: false }
        ]);
        expect(await canUploadTo(id, viewer())).toBe(false);

        await setGalleryShares(id, [{ targetKind: "group", targetId: meuteId, canWrite: true }]);
        expect(await canUploadTo(id, viewer())).toBe(true);
    });

    // -----------------------------------------------------------------------
    // Bilder ablegen
    // -----------------------------------------------------------------------

    it("legt Original und Vorschaubild als zwei Dateien ab", async () => {
        const { listImages } = await import("$lib/server/galleryService");

        const id = await freshGallery("MitVorschau");
        const before = await countFiles();

        const imageId = await addPng(id, "mit-vorschau", { withThumb: true });

        expect(await countFiles()).toBe(before + 2);

        const image = (await listImages(id)).find((entry) => entry.id === imageId);
        expect(image?.thumbFileId).toBeTruthy();
        expect(image?.thumbFileId).not.toBe(image?.fileId);
        expect(image?.width).toBe(1200);
    });

    it("kommt ohne Vorschaubild aus", async () => {
        const { listImages } = await import("$lib/server/galleryService");

        const id = await freshGallery("OhneVorschau");
        const before = await countFiles();

        const imageId = await addPng(id, "ohne-vorschau");

        expect(await countFiles()).toBe(before + 1);

        const image = (await listImages(id)).find((entry) => entry.id === imageId);
        expect(image?.thumbFileId).toBeNull();
    });

    it("weist ein PDF ab, das sich als PNG ausgibt -- ohne Datei zu hinterlassen", async () => {
        const { addImage, listImages } = await import("$lib/server/galleryService");

        const id = await freshGallery("Getarnt");
        const before = await countFiles();

        const result = await addImage({
            galleryId: id,
            file: upload(`${PREFIX}getarnt.png`, pdfBytes(), "image/png"),
            uploadedBy: userId
        });

        expect(result.ok).toBe(false);
        expect(result.status).toBe(415);
        // Der Ausgleichstest: es darf KEINE neue Datei entstanden sein.
        expect(await countFiles()).toBe(before);
        expect(await listImages(id)).toHaveLength(0);
    });

    // -----------------------------------------------------------------------
    // Loeschen ohne Waisen
    // -----------------------------------------------------------------------

    it("nimmt beim Loeschen eines Bildes beide Dateien mit", async () => {
        const { deleteImage, listImages } = await import("$lib/server/galleryService");

        const id = await freshGallery("BildLoeschen");
        const before = await countFiles();

        const imageId = await addPng(id, "loeschen", { withThumb: true });
        expect(await countFiles()).toBe(before + 2);

        const result = await deleteImage(imageId);
        expect(result.ok, result.error ?? "").toBe(true);

        expect(await listImages(id)).toHaveLength(0);
        expect(await countFiles()).toBe(before);
    });

    it("setzt das Titelbild auf null, wenn es geloescht wird", async () => {
        const { deleteImage, getGallery, setCoverImage } = await import(
            "$lib/server/galleryService"
        );

        const id = await freshGallery("Titelbild");
        const first = await addPng(id, "titel-a");
        const second = await addPng(id, "titel-b");

        expect((await setCoverImage(id, second)).ok).toBe(true);
        expect((await getGallery(id, viewer()))?.coverImageId).toBe(second);

        await deleteImage(second);

        const after = await getGallery(id, viewer());
        expect(after?.coverImageId).toBeNull();
        // Ohne gesetztes Titelbild faellt die Anzeige auf das erste Bild zurueck.
        expect(after?.coverImageResolved).toBe(first);
    });

    it("nimmt beim Loeschen der Galerie alle Bilder und alle Dateien mit", async () => {
        const { deleteGallery, getGallery, listImages } = await import(
            "$lib/server/galleryService"
        );

        const id = await freshGallery("GanzWeg");
        const before = await countFiles();

        await addPng(id, "ganz-a", { withThumb: true });
        await addPng(id, "ganz-b");
        expect(await countFiles()).toBe(before + 3);

        const result = await deleteGallery(id);
        expect(result.ok, result.error ?? "").toBe(true);

        expect(await getGallery(id, viewer(), { manageAll: true })).toBeNull();
        expect(await listImages(id)).toHaveLength(0);
        expect(await countFiles()).toBe(before);
    });

    it("laesst beim Loeschen eines Termins die Galerie samt Dateien stehen", async () => {
        const { db } = await import("$lib/server/db");
        const schema = await import("$lib/server/db/schema");
        const { eq } = await import("drizzle-orm");
        const { getGallery, listImages, updateGallery } = await import(
            "$lib/server/galleryService"
        );

        const id = await freshGallery("AmTermin");
        expect((await updateGallery(id, { eventId })).ok).toBe(true);

        await addPng(id, "termin-a", { withThumb: true });
        const before = await countFiles();

        expect((await getGallery(id, viewer()))?.eventId).toBe(eventId);

        // ON DELETE SET NULL: CASCADE haette hier die Galerie samt Bildzeilen
        // entfernt und jedes Objekt im Speicher liegen lassen.
        await db.delete(schema.events).where(eq(schema.events.id, eventId));
        eventId = "";

        const after = await getGallery(id, viewer());
        expect(after).not.toBeNull();
        expect(after?.eventId).toBeNull();
        expect(after?.eventTitle).toBeNull();
        expect(await listImages(id)).toHaveLength(1);
        expect(await countFiles()).toBe(before);
    });

    // -----------------------------------------------------------------------
    // Reihenfolge
    // -----------------------------------------------------------------------

    it("verliert bei einer veralteten Sortierliste kein Bild", async () => {
        const { listImages, reorderImages } = await import("$lib/server/galleryService");

        const id = await freshGallery("Sortierung");
        const a = await addPng(id, "sort-a");
        const b = await addPng(id, "sort-b");
        const c = await addPng(id, "sort-c");

        expect((await listImages(id)).map((image) => image.id)).toEqual([a, b, c]);

        // Das Formular stammt aus der Zeit vor "c" -- und schleppt zusaetzlich
        // eine fremde Kennung mit.
        const result = await reorderImages(id, [c, a]);
        expect(result.ok, result.error ?? "").toBe(true);

        const order = (await listImages(id)).map((image) => image.id);
        expect(order).toHaveLength(3);
        expect(order).toEqual([c, a, b]);
    });

    it("laesst das erste Bild still stehen, wenn es nach oben soll", async () => {
        const { listImages, moveImage } = await import("$lib/server/galleryService");

        const id = await freshGallery("Verschieben");
        const a = await addPng(id, "move-a");
        const b = await addPng(id, "move-b");

        const result = await moveImage(a, "up");
        // Ohne JavaScript ist die Schaltflaeche da -- das darf kein Fehler sein.
        expect(result.ok).toBe(true);
        expect((await listImages(id)).map((image) => image.id)).toEqual([a, b]);

        expect((await moveImage(a, "down")).ok).toBe(true);
        expect((await listImages(id)).map((image) => image.id)).toEqual([b, a]);
    });
});
