import { describe, expect, it } from "vitest";
import {
    baseType,
    checkUpload,
    detectSignature,
    extensionOf,
    isBlockedExtension,
    isValidUtf8Text
} from "./mime";
import { storageKeyFor } from "$lib/server/storage";

/**
 * Die Pruefung entscheidet, was ueberhaupt in den Speicher kommt. Vorher fiel
 * jeder unbekannte Typ still auf "application/octet-stream" -- eine .exe war
 * damit eine gueltige Ablage.
 */

const ALLOWED = [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "text/plain",
    "text/csv",
    "text/markdown",
    "application/json",
    "text/yaml",
    "application/yaml"
];

const PDF = Buffer.from("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n", "binary");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const GIF = Buffer.from("GIF89a", "binary");
const WEBP = Buffer.concat([
    Buffer.from("RIFF", "ascii"),
    Buffer.from([0x24, 0x00, 0x00, 0x00]),
    Buffer.from("WEBP", "ascii"),
    Buffer.from("VP8 ", "ascii")
]);
const TEXT = Buffer.from("Zeile eins\nZeile zwei mit Umlaut: Grüße\n", "utf8");

describe("extensionOf", () => {
    it("liefert die Endung in Kleinbuchstaben", () => {
        expect(extensionOf("Anmeldung.PDF")).toBe("pdf");
        expect(extensionOf("archiv.tar.gz")).toBe("gz");
    });

    it("liefert nichts ohne Endung", () => {
        expect(extensionOf("Dokument")).toBe("");
        expect(extensionOf("punkt.")).toBe("");
    });
});

describe("isBlockedExtension", () => {
    it("weist ausfuehrbare Endungen ab", () => {
        for (const name of [
            "virus.exe",
            "lib.dll",
            "lib.so",
            "start.bat",
            "start.cmd",
            "skript.ps1",
            "skript.sh",
            "app.jar",
            "setup.msi",
            "bild.scr",
            "alt.com"
        ]) {
            expect(isBlockedExtension(name), name).toBe(true);
        }
    });

    it("weist Endungen ab, die im Browser Skript ausfuehren", () => {
        for (const name of ["seite.html", "seite.htm", "seite.xhtml", "seite.php", "a.js", "a.mjs", "logo.svg"]) {
            expect(isBlockedExtension(name), name).toBe(true);
        }
    });

    it("laesst harmlose Endungen durch", () => {
        for (const name of ["a.pdf", "a.png", "a.md", "a.csv", "a.docx"]) {
            expect(isBlockedExtension(name), name).toBe(false);
        }
    });
});

describe("detectSignature", () => {
    it("erkennt die Formate an ihren ersten Bytes", () => {
        expect(detectSignature(PDF)).toBe("application/pdf");
        expect(detectSignature(PNG)).toBe("image/png");
        expect(detectSignature(JPEG)).toBe("image/jpeg");
        expect(detectSignature(GIF)).toBe("image/gif");
        expect(detectSignature(WEBP)).toBe("image/webp");
    });

    it("erkennt bei Text nichts", () => {
        expect(detectSignature(TEXT)).toBeNull();
    });

    it("verwechselt RIFF ohne WEBP nicht mit einem Bild", () => {
        const wave = Buffer.concat([
            Buffer.from("RIFF", "ascii"),
            Buffer.from([0x24, 0x00, 0x00, 0x00]),
            Buffer.from("WAVE", "ascii")
        ]);
        expect(detectSignature(wave)).toBeNull();
    });
});

describe("isValidUtf8Text", () => {
    it("nimmt gueltiges UTF-8 an", () => {
        expect(isValidUtf8Text(TEXT)).toBe(true);
    });

    it("weist Nullbytes ab", () => {
        expect(isValidUtf8Text(Buffer.from([0x61, 0x62, 0x63, 0x00, 0x64]))).toBe(false);
    });

    it("weist ungueltige Folgen ab", () => {
        expect(isValidUtf8Text(Buffer.from([0xff, 0xfe, 0x41]))).toBe(false);
    });
});

describe("baseType", () => {
    it("schneidet Parameter ab", () => {
        expect(baseType("text/plain; charset=UTF-8")).toBe("text/plain");
        expect(baseType(null)).toBe("");
    });
});

describe("checkUpload", () => {
    it("nimmt eine echte PDF-Datei an", () => {
        const result = checkUpload(
            { filename: "Anmeldung.pdf", declaredType: "application/pdf", content: PDF },
            ALLOWED
        );
        expect(result).toEqual({ ok: true, contentType: "application/pdf" });
    });

    it("nimmt Bilder an", () => {
        expect(
            checkUpload({ filename: "a.png", declaredType: "image/png", content: PNG }, ALLOWED).ok
        ).toBe(true);
        expect(
            checkUpload({ filename: "a.gif", declaredType: "image/gif", content: GIF }, ALLOWED).ok
        ).toBe(true);
        expect(
            checkUpload({ filename: "a.webp", declaredType: "image/webp", content: WEBP }, ALLOWED)
                .ok
        ).toBe(true);
    });

    it("weist ein PDF ab, das gar keines ist", () => {
        const result = checkUpload(
            { filename: "Anmeldung.pdf", declaredType: "application/pdf", content: TEXT },
            ALLOWED
        );

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.status).toBe(415);
    });

    it("weist ein als Bild gemeldetes HTML-Dokument ab", () => {
        const html = Buffer.from("<html><script>alert(1)</script></html>", "utf8");
        const result = checkUpload(
            { filename: "bild.png", declaredType: "image/png", content: html },
            ALLOWED
        );

        expect(result.ok).toBe(false);
    });

    it("faellt nicht mehr still auf application/octet-stream zurueck", () => {
        const result = checkUpload(
            { filename: "virus.exe", declaredType: "application/x-msdownload", content: PDF },
            ALLOWED
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe(415);
            expect(result.error).toContain(".exe");
        }
    });

    it("weist ein PDF ab, das als Textdatei gemeldet wird", () => {
        const result = checkUpload(
            { filename: "liste.csv", declaredType: "text/csv", content: PDF },
            ALLOWED
        );

        expect(result.ok).toBe(false);
    });

    it("weist eine Textdatei mit Binaerinhalt ab", () => {
        const result = checkUpload(
            {
                filename: "notiz.txt",
                declaredType: "text/plain",
                content: Buffer.from([0x41, 0x00, 0x42])
            },
            ALLOWED
        );

        expect(result.ok).toBe(false);
    });

    it("bestimmt den Typ ueber die Endung, wenn der Browser schweigt", () => {
        // Fuer .md und .yaml melden die meisten Browser gar nichts.
        expect(
            checkUpload(
                { filename: "notiz.md", declaredType: "", content: TEXT },
                ALLOWED
            )
        ).toEqual({ ok: true, contentType: "text/markdown" });

        expect(
            checkUpload(
                {
                    filename: "konfig.yml",
                    declaredType: "application/octet-stream",
                    content: TEXT
                },
                ALLOWED
            )
        ).toEqual({ ok: true, contentType: "text/yaml" });
    });

    it("weist einen Typ ab, der nicht auf der Positivliste steht", () => {
        const result = checkUpload(
            { filename: "video.mp4", declaredType: "video/mp4", content: TEXT },
            ALLOWED
        );

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.status).toBe(415);
    });

    it("weist SVG ab -- auch mit korrektem Inhalt", () => {
        const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', "utf8");
        const result = checkUpload(
            { filename: "logo.svg", declaredType: "image/svg+xml", content: svg },
            ALLOWED
        );

        expect(result.ok).toBe(false);
    });
});

/**
 * Directory Traversal.
 *
 * Der Objektschluessel entsteht ausschliesslich aus der von der Datenbank
 * vergebenen UUID; ein Dateiname erreicht ihn nie. Der Test haelt genau das
 * fest, damit es auch so bleibt.
 *
 * Symlink-Angriffe sind nicht anwendbar: es gibt keine Ablage im lokalen
 * Dateisystem, nur die Spalte `files.content` (bytea) oder ein Objekt im
 * S3-Speicher.
 */
describe("storageKeyFor", () => {
    const id = "0f8fad5b-d9cb-469f-a165-70867728950e";

    it("baut den Schluessel allein aus Praefix und Kennung", () => {
        expect(storageKeyFor(id, "stamm/")).toBe(`stamm/files/0f/${id}`);
    });

    it("kennt den Dateinamen gar nicht", () => {
        // Es gibt keinen Parameter dafuer -- der Aufruf mit einem boesartigen
        // Namen ist syntaktisch nicht moeglich. Als Nachweis: der Schluessel
        // haengt einzig an der Kennung.
        for (const filename of ["../../etc/passwd", "..\\..\\windows\\system32", "a/b/c.txt"]) {
            void filename;
            expect(storageKeyFor(id, "stamm/")).toBe(`stamm/files/0f/${id}`);
        }
    });

    it("enthaelt niemals einen Pfadwechsel", () => {
        const key = storageKeyFor(id, "stamm/");
        expect(key).not.toContain("..");
        expect(key).not.toContain("\\");
        expect(key.split("/").filter(Boolean)).toEqual(["stamm", "files", "0f", id]);
    });
});
