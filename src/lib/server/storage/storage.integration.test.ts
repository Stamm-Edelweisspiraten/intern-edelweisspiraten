import { afterAll, describe, expect, it } from "vitest";
import { env } from "$env/dynamic/private";

/**
 * Prüft die Ablage gegen einen echten Objektspeicher und eine echte
 * Datenbank.
 *
 * Übersprungen, wenn die Umgebung nichts davon anbietet -- der normale
 * Testlauf braucht deshalb keine laufenden Dienste. Zum Ausführen:
 *
 *   docker run -d --name ep-minio -p 9100:9000 \
 *     -e MINIO_ROOT_USER=testkey -e MINIO_ROOT_PASSWORD=testsecret123 \
 *     minio/minio server /data
 *
 *   S3_ENDPOINT=http://localhost:9100 S3_BUCKET=portal-test \
 *   S3_ACCESS_KEY_ID=testkey S3_SECRET_ACCESS_KEY=testsecret123 \
 *   DATABASE_URL=postgres://... npx vitest run storage.integration
 */

const ready = Boolean(env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.DATABASE_URL);
const maybe = ready ? describe : describe.skip;

maybe("Objektspeicher", () => {
    const created: string[] = [];

    afterAll(async () => {
        const { deleteFile } = await import("$lib/server/fileStore");
        for (const id of created) await deleteFile(id);
    });

    it("erkennt die Vorgabe aus der Umgebung", async () => {
        const { storageFromEnv, getStorageConfig, isConfigured } = await import("./settings");
        expect(storageFromEnv()).toBe(true);
        expect(isConfigured(await getStorageConfig())).toBe(true);
    });

    it("schreibt, liest und löscht ein Testobjekt", async () => {
        const { testStorage } = await import("./index");
        const result = await testStorage();
        expect(result.error ?? "").toBe("");
        expect(result.ok).toBe(true);
    });

    it("legt eine Datei oben ab und liest sie unverändert zurück", async () => {
        const { storeFile, readFile, readFileMeta } = await import("$lib/server/fileStore");

        const content = Buffer.from("Beispielinhalt mit Umlauten: äöü", "utf8");
        const id = await storeFile({
            filename: "beispiel.txt",
            contentType: "text/plain",
            content
        });
        created.push(id);

        const meta = await readFileMeta(id);
        // Der Beweis, dass sie NICHT in der Datenbankspalte gelandet ist.
        expect(meta?.storageKey).toBeTruthy();

        const stored = await readFile(id);
        expect(stored?.content.toString("utf8")).toBe(content.toString("utf8"));
    });

    it("liefert eine unterschriebene Adresse mit dem richtigen Dateinamen", async () => {
        const { storeFile, signedUrlFor } = await import("$lib/server/fileStore");

        const id = await storeFile({
            filename: "bericht.pdf",
            contentType: "application/pdf",
            content: Buffer.from("%PDF-1.4", "utf8")
        });
        created.push(id);

        const url = await signedUrlFor(id);
        expect(url).toBeTruthy();
        expect(url).toContain("X-Amz-Signature");
        expect(decodeURIComponent(url ?? "")).toContain("bericht.pdf");
    });

    it("entfernt beim Löschen auch das Objekt", async () => {
        const { storeFile, readFileMeta, deleteFile } = await import("$lib/server/fileStore");
        const { getObjectStore } = await import("./index");

        const id = await storeFile({
            filename: "weg.txt",
            contentType: "text/plain",
            content: Buffer.from("weg", "utf8")
        });

        const meta = await readFileMeta(id);
        const key = meta?.storageKey;
        expect(key).toBeTruthy();

        await deleteFile(id);

        const store = await getObjectStore();
        expect(await store?.get(key!)).toBeNull();
        expect(await readFileMeta(id)).toBeNull();
    });

    it("zieht eine Datei aus der Datenbank nach oben und ist wiederholbar", async () => {
        const { db } = await import("$lib/server/db");
        const { files } = await import("$lib/server/db/schema");
        const { migrateFilesToStorage, readFile, readFileMeta } = await import(
            "$lib/server/fileStore"
        );
        const { eq } = await import("drizzle-orm");

        // Eine Zeile in der alten Ablage, also mit content und ohne Schlüssel.
        const content = Buffer.from("Altbestand", "utf8");
        const [row] = await db
            .insert(files)
            .values({
                filename: "alt.txt",
                contentType: "text/plain",
                size: content.byteLength,
                content
            })
            .returning({ id: files.id });
        created.push(row.id);

        const first = await migrateFilesToStorage();
        expect(first.errors).toEqual([]);
        expect(first.moved).toBeGreaterThanOrEqual(1);

        const meta = await readFileMeta(row.id);
        expect(meta?.storageKey).toBeTruthy();

        // Die Spalte ist geleert -- sonst läge alles doppelt.
        const [after] = await db
            .select({ content: files.content })
            .from(files)
            .where(eq(files.id, row.id));
        expect(after.content).toBeNull();

        // Der Inhalt kommt unverändert vom Speicher.
        expect((await readFile(row.id))?.content.toString("utf8")).toBe("Altbestand");

        // Ein zweiter Lauf hat nichts mehr zu tun.
        const second = await migrateFilesToStorage();
        expect(second.pending).toBe(0);
        expect(second.moved).toBe(0);
    });
});
