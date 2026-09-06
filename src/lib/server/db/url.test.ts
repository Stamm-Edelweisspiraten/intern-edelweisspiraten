import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
    buildDatabaseUrl,
    databaseFilePath,
    describeDatabase,
    readDatabaseFile,
    resolveDatabaseUrl,
    writeDatabaseFile
} from "./url";

/**
 * Aufloesung der Datenbankverbindung.
 *
 * Die Reihenfolge ist der eigentliche Gegenstand: DATABASE_URL muss die
 * einzelnen DB_* Variablen ueberstimmen und die wiederum die Setup-Datei --
 * sonst ueberschriebe eine alte Datei im Datenverzeichnis stillschweigend die
 * Vorgabe des Containers.
 */

const temporaryFiles: string[] = [];

function temporaryPath(): string {
    const file = path.join(
        fs.mkdtempSync(path.join(os.tmpdir(), "ep-db-url-")),
        "unterordner",
        "database.json"
    );
    temporaryFiles.push(file);
    return file;
}

afterEach(() => {
    for (const file of temporaryFiles.splice(0)) {
        fs.rmSync(path.dirname(path.dirname(file)), { recursive: true, force: true });
    }
});

describe("resolveDatabaseUrl", () => {
    it("nimmt DATABASE_URL vor allem anderen", () => {
        const result = resolveDatabaseUrl(
            {
                DATABASE_URL: "postgres://a:b@vorrang:5432/aus-der-umgebung",
                DB_HOST: "wird-nicht-benutzt",
                DB_NAME: "auch-nicht"
            },
            { host: "datei", name: "ebenfalls-nicht" }
        );

        expect(result).toEqual({
            url: "postgres://a:b@vorrang:5432/aus-der-umgebung",
            source: "env-url"
        });
    });

    it("baut die URL aus den einzelnen DB_* Variablen", () => {
        const result = resolveDatabaseUrl(
            {
                DB_HOST: "db.example.org",
                DB_PORT: "6543",
                DB_NAME: "intern",
                DB_USER: "intern",
                DB_PASSWORD: "geheim",
                DB_SSL: "true"
            },
            { host: "datei", name: "wird-nicht-benutzt" }
        );

        expect(result).toEqual({
            url: "postgresql://intern:geheim@db.example.org:6543/intern?sslmode=require",
            source: "env-parts"
        });
    });

    it("nimmt Port 5432 und SSL aus, wenn nichts angegeben ist", () => {
        const result = resolveDatabaseUrl({ DB_HOST: "db", DB_NAME: "intern" });
        expect(result.url).toBe("postgresql://db:5432/intern");
    });

    it("uebergeht die DB_* Variablen, wenn DB_NAME fehlt", () => {
        // Ein halber Satz Variablen ergaebe sonst eine URL ohne Datenbank.
        const result = resolveDatabaseUrl(
            { DB_HOST: "db", DB_USER: "intern" },
            { host: "datei.example.org", name: "aus-der-datei" }
        );

        expect(result.source).toBe("file");
        expect(result.url).toBe("postgresql://datei.example.org:5432/aus-der-datei");
    });

    it("nimmt die Setup-Datei, wenn keine Umgebungsvariable gesetzt ist", () => {
        const result = resolveDatabaseUrl(
            {},
            { host: "datei", port: 5433, name: "intern", user: "u", password: "p" }
        );

        expect(result).toEqual({
            url: "postgresql://u:p@datei:5433/intern",
            source: "file"
        });
    });

    it("nimmt einen vollstaendigen Connection String aus der Setup-Datei", () => {
        const result = resolveDatabaseUrl({}, { url: "postgresql://u:p@host:5432/db" });
        expect(result).toEqual({ url: "postgresql://u:p@host:5432/db", source: "file" });
    });

    it("meldet ohne jede Konfiguration keine Verbindung, statt zu werfen", () => {
        expect(resolveDatabaseUrl({}, null)).toEqual({ url: null, source: "none" });
        expect(resolveDatabaseUrl({})).toEqual({ url: null, source: "none" });
    });

    it("weist ein anderes DB_TYPE deutlich zurueck", () => {
        expect(() => resolveDatabaseUrl({ DB_TYPE: "mysql", DB_HOST: "db", DB_NAME: "x" })).toThrow(
            /DB_TYPE/
        );
        // Auch dann, wenn eine gueltige URL danebensteht: die Erwartung ist falsch.
        expect(() =>
            resolveDatabaseUrl({ DB_TYPE: "sqlite", DATABASE_URL: "postgres://db/x" })
        ).toThrow(/PostgreSQL/);
    });

    it("laesst beide Schreibweisen von PostgreSQL zu", () => {
        for (const type of ["postgres", "postgresql", "PostgreSQL"]) {
            expect(resolveDatabaseUrl({ DB_TYPE: type, DB_HOST: "db", DB_NAME: "x" }).url).toBe(
                "postgresql://db:5432/x"
            );
        }
    });

    it("weist einen unsinnigen DB_PORT zurueck", () => {
        expect(() => resolveDatabaseUrl({ DB_HOST: "db", DB_NAME: "x", DB_PORT: "keiner" })).toThrow(
            /DB_PORT/
        );
    });
});

describe("buildDatabaseUrl", () => {
    /**
     * Der eigentliche Stolperstein: ein `@` im Passwort beendet ohne Kodierung
     * den Benutzerteil, ein `/` beendet den Host. Die URL zeigt dann auf einen
     * Server, den es nicht gibt -- und die Fehlermeldung deutet auf alles
     * ausser das Passwort.
     */
    it("kodiert Sonderzeichen in Benutzername, Passwort und Datenbankname", () => {
        const url = buildDatabaseUrl({
            host: "db.example.org",
            name: "intern datenbank",
            user: "mail@example.org",
            password: "p@ss/wort:mit?zeichen#"
        });

        expect(url).toBe(
            "postgresql://mail%40example.org:p%40ss%2Fwort%3Amit%3Fzeichen%23@db.example.org:5432/intern%20datenbank"
        );

        // Gegenprobe: die URL laesst sich wieder in ihre Teile zerlegen.
        const parsed = new URL(url);
        expect(parsed.hostname).toBe("db.example.org");
        expect(decodeURIComponent(parsed.username)).toBe("mail@example.org");
        expect(decodeURIComponent(parsed.password)).toBe("p@ss/wort:mit?zeichen#");
    });

    it("laesst den Benutzerteil weg, wenn kein Benutzer angegeben ist", () => {
        expect(buildDatabaseUrl({ host: "db", name: "intern" })).toBe("postgresql://db:5432/intern");
    });

    it("setzt eine IPv6-Adresse in eckige Klammern", () => {
        expect(buildDatabaseUrl({ host: "::1", name: "intern" })).toBe(
            "postgresql://[::1]:5432/intern"
        );
    });

    it("verlangt Host und Datenbankname", () => {
        expect(() => buildDatabaseUrl({ host: "  ", name: "intern" })).toThrow(/Host/);
        expect(() => buildDatabaseUrl({ host: "db", name: "" })).toThrow(/Datenbankname/);
    });
});

describe("describeDatabase", () => {
    it("liefert die anzeigbaren Teile und niemals das Passwort", () => {
        const description = describeDatabase("postgresql://intern:geheim@db:5433/intern?sslmode=require");

        expect(description).toEqual({
            host: "db",
            port: 5433,
            database: "intern",
            user: "intern",
            ssl: true
        });
        expect(JSON.stringify(description)).not.toContain("geheim");
    });

    it("ergaenzt den Standardport und erkennt eine abgeschaltete Verschluesselung", () => {
        expect(describeDatabase("postgres://intern@db/intern?sslmode=disable")).toEqual({
            host: "db",
            port: 5432,
            database: "intern",
            user: "intern",
            ssl: false
        });
    });

    it("dekodiert kodierte Bestandteile wieder", () => {
        const description = describeDatabase(
            buildDatabaseUrl({ host: "db", name: "intern", user: "mail@example.org", password: "p@ss" })
        );

        expect(description?.user).toBe("mail@example.org");
    });

    it("liefert null statt zu werfen, wenn die URL unlesbar ist", () => {
        expect(describeDatabase("kein-url")).toBeNull();
    });
});

describe("readDatabaseFile / writeDatabaseFile", () => {
    it("schreibt und liest die Datei und legt das Verzeichnis an", () => {
        const file = temporaryPath();
        writeDatabaseFile(file, { host: "db", port: 5432, name: "intern", user: "intern" });

        expect(readDatabaseFile(file)).toEqual({
            host: "db",
            port: 5432,
            name: "intern",
            user: "intern"
        });
    });

    it("meldet eine fehlende Datei als null", () => {
        expect(readDatabaseFile(path.join(os.tmpdir(), "gibt-es-nicht-ep.json"))).toBeNull();
    });
});

describe("databaseFilePath", () => {
    it("nimmt das Datenverzeichnis, solange nichts anderes gesetzt ist", () => {
        expect(databaseFilePath({})).toBe("./data/database.json");
        expect(databaseFilePath({ DB_CONFIG_FILE: "  " })).toBe("./data/database.json");
    });

    it("beachtet DB_CONFIG_FILE", () => {
        expect(databaseFilePath({ DB_CONFIG_FILE: "/etc/intern/db.json" })).toBe(
            "/etc/intern/db.json"
        );
    });
});
