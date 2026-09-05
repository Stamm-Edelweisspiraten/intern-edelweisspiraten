import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "$env/dynamic/private";

/**
 * Der Objektspeicher allein aus der Einstellung im Adminbereich.
 *
 * Der Unterschied zu `storage.integration.test.ts` ist der Weg, auf dem die
 * Zugangsdaten hereinkommen: dort aus den `S3_*`-Umgebungsvariablen, hier aus
 * der Tabelle `settings` — also aus dem, was `npm run storage:setup` oder die
 * Adminseite hinterlegt hat, verschlüsselt.
 *
 * Das ist der Weg, den ein normaler Betrieb geht, und er hat eine eigene
 * Fehlerquelle: der geheime Schlüssel muss mit demselben `APP_ENC_KEY`
 * entschlüsselt werden können, mit dem er geschrieben wurde. Passt er nicht,
 * fällt die Anwendung **still** auf die Datenbank zurück — und niemand merkt
 * es, bis jemand eine Datei sucht. Genau das prüft dieser Test.
 *
 * Ausführen:
 *
 *   DATABASE_URL=... APP_ENC_KEY=... npx vitest run storage/panel.integration
 *
 * Übersprungen, wenn keine Datenbank da ist oder `S3_*` in der Umgebung steht
 * — Letztere hätten Vorrang, der Test prüfte dann den falschen Weg.
 */

const envOverrides = Boolean(env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY);
const ready = Boolean(env.DATABASE_URL) && !envOverrides;
const maybe = ready ? describe : describe.skip;

maybe("Objektspeicher aus dem Adminbereich", () => {
    const created: string[] = [];

    /**
     * Liegt überhaupt eine Einstellung vor? Ohne sie bleibt es bei der
     * Datenbank, und das ist der vorgesehene Zustand, kein Fehler — die
     * Prüfungen entfallen dann.
     *
     * Liegt aber eine vor, muss sie auch benutzbar sein. Ein „konfiguriert,
     * aber unlesbar“ ist der Fall, den dieser Test fangen soll, und der darf
     * sich nicht als übersprungener Test tarnen.
     */
    let hasSetting = false;

    beforeAll(async () => {
        const { readSettingRaw } = await import("$lib/server/settingsService");
        const stored = await readSettingRaw("storage");
        hasSetting = Boolean(stored && typeof stored.bucket === "string" && stored.bucket);

        if (!hasSetting) {
            console.log(
                "  (keine Speichereinstellung hinterlegt -- npm run storage:setup)"
            );
        }
    });

    afterAll(async () => {
        const { deleteFile } = await import("$lib/server/fileStore");
        for (const id of created) await deleteFile(id);
    });

    it("entschlüsselt den hinterlegten Zugangsschlüssel", async () => {
        if (!hasSetting) return;

        const { getStorageConfig, isConfigured } = await import("./settings");
        const config = await getStorageConfig();

        /**
         * Schlägt das hier fehl, passt der APP_ENC_KEY nicht zu dem, mit dem
         * geschrieben wurde. getStorageConfig() verschluckt den Fehler mit
         * einer Zeile auf der Konsole und liefert einen leeren Schlüssel --
         * die Anwendung schreibt dann klammheimlich weiter in die Datenbank.
         */
        expect(
            isConfigured(config),
            "Einstellung vorhanden, aber unbrauchbar -- vermutlich passt APP_ENC_KEY nicht"
        ).toBe(true);

        expect(config.bucket).not.toBe("");
        // Entschlüsselt: die abgelegte Form hat drei durch Punkte getrennte
        // Teile, der Klartext hat keine.
        expect(config.secretAccessKey).not.toContain(".");
        expect(config.secretAccessKey.length).toBeGreaterThan(16);
    });

    it("verrät den geheimen Schlüssel nicht an die Oberfläche", async () => {
        if (!hasSetting) return;

        const { getStorageConfigView } = await import("./settings");
        const view = await getStorageConfigView();

        expect(view.hasSecret).toBe(true);
        expect(view.configured).toBe(true);
        expect(view.fromEnv).toBe(false);
        expect(Object.keys(view)).not.toContain("secretAccessKey");
    });

    it("besteht den Verbindungstest der Adminseite", async () => {
        if (!hasSetting) return;

        const { testStorage } = await import("./index");
        const result = await testStorage();

        expect(result.error ?? "").toBe("");
        expect(result.ok).toBe(true);
    });

    it("legt eine Datei oben ab und liest sie unverändert zurück", async () => {
        if (!hasSetting) return;

        const { storeFile, readFile, readFileMeta } = await import("$lib/server/fileStore");

        const content = Buffer.from("Aus dem Adminbereich, mit Umlauten: äöü", "utf8");
        const id = await storeFile({
            filename: "panel.txt",
            contentType: "text/plain",
            content
        });
        created.push(id);

        const meta = await readFileMeta(id);
        // Der Beweis, dass die Einstellung wirklich gegriffen hat: ohne sie
        // stünde der Inhalt in der Spalte und storageKey wäre null.
        expect(meta?.storageKey).toBeTruthy();

        const stored = await readFile(id);
        expect(stored?.content.toString("utf8")).toBe(content.toString("utf8"));
    });
});
