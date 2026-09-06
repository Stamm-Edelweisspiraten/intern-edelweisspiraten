/**
 * Was darf hochgeladen werden?
 *
 * Bisher galt: unbekannter Typ -> still auf "application/octet-stream"
 * herabstufen und trotzdem ablegen. Eine .exe landete damit genauso im
 * Speicher wie ein Formular, nur mit einem harmlosen Etikett. Und ein als
 * "image/png" gemeldetes HTML-Dokument behielt sein Etikett, obwohl der
 * Inhalt etwas voellig anderes war.
 *
 * Hier wird stattdessen abgewiesen:
 *
 *   1. Endung auf der Sperrliste          -> abgelehnt
 *   2. Typ nicht auf der Positivliste     -> abgelehnt
 *   3. Signaturtyp, Signatur passt nicht  -> abgelehnt
 *   4. Textformat, kein gueltiges UTF-8   -> abgelehnt
 *
 * Ablage im lokalen Dateisystem gibt es nicht -- der Inhalt liegt entweder in
 * der Spalte `files.content` (bytea) oder als Objekt im S3-Speicher. Angriffe
 * ueber Symlinks oder Pfadwechsel sind damit strukturell nicht anwendbar:
 * es wird nie ein Pfad aus einem Dateinamen gebildet. Der Objektschluessel
 * entsteht ausschliesslich aus der von der Datenbank vergebenen UUID
 * (`storageKeyFor`), der Dateiname erreicht ihn nie.
 */

export interface UploadCheckInput {
    filename: string;
    /** Was der Browser gemeldet hat -- ungeprueft. */
    declaredType: string;
    content: Buffer | Uint8Array;
}

export type UploadCheck =
    | { ok: true; contentType: string }
    | { ok: false; error: string; status: 400 | 415 };

/**
 * Endungen, die niemals abgelegt werden.
 *
 * Ausfuehrbares (.exe, .msi, .bat ...) ist offensichtlich; die zweite Haelfte
 * ist der eigentliche Punkt: .html, .htm, .xhtml, .svg und .js fuehren im
 * Browser Skript aus. Liegt eine solche Datei im Objektspeicher, liefert
 * dieser sie unter SEINEM Ursprung aus -- die eigenen Schutzkopfzeilen der
 * Anwendung greifen dort nicht mehr.
 */
export const BLOCKED_EXTENSIONS = [
    "bat",
    "cmd",
    "com",
    "cpl",
    "dll",
    "exe",
    "htm",
    "html",
    "jar",
    "js",
    "jse",
    "lnk",
    "mjs",
    "msi",
    "php",
    "ps1",
    "psm1",
    "reg",
    "scr",
    "sh",
    "so",
    "svg",
    "svgz",
    "vbe",
    "vbs",
    "wsf",
    "xhtml"
];

/** Typen, deren erste Bytes eindeutig sind. */
const SIGNATURES: { type: string; matches: (bytes: Uint8Array) => boolean }[] = [
    {
        type: "application/pdf",
        // %PDF-
        matches: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d])
    },
    {
        type: "image/png",
        matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    },
    {
        type: "image/jpeg",
        // SOI-Marker; das dritte Byte ist immer ein weiterer Marker.
        matches: (b) => startsWith(b, [0xff, 0xd8, 0xff])
    },
    {
        type: "image/gif",
        matches: (b) => ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a"
    },
    {
        type: "image/webp",
        // RIFF????WEBP -- die vier Bytes dazwischen sind die Laenge.
        matches: (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP"
    }
];

const SIGNATURE_TYPES = new Set(SIGNATURES.map((entry) => entry.type));

/**
 * Textformate ohne Signatur.
 *
 * Hier ist die Signatur kein Kriterium -- geprueft wird stattdessen, dass der
 * Inhalt gueltiges UTF-8 ohne Nullbytes ist. Eine als .txt getarnte Binaerdatei
 * faellt damit auf.
 */
const TEXT_TYPES = new Set([
    "text/plain",
    "text/csv",
    "text/markdown",
    "application/json",
    "text/yaml",
    "application/yaml",
    "text/x-yaml"
]);

/**
 * Endung -> Typ, fuer den haeufigen Fall, dass der Browser gar nichts oder
 * nur "application/octet-stream" meldet. Bei .md, .yaml und .log ist das die
 * Regel, nicht die Ausnahme.
 */
const BY_EXTENSION: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    txt: "text/plain",
    log: "text/plain",
    csv: "text/csv",
    md: "text/markdown",
    markdown: "text/markdown",
    json: "application/json",
    yaml: "text/yaml",
    yml: "text/yaml",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    odt: "application/vnd.oasis.opendocument.text",
    ods: "application/vnd.oasis.opendocument.spreadsheet"
};

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
    if (bytes.length < prefix.length) return false;
    return prefix.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, from: number, to: number): string {
    if (bytes.length < to) return "";
    let out = "";
    for (let index = from; index < to; index += 1) out += String.fromCharCode(bytes[index]);
    return out;
}

/** Die Endung in Kleinbuchstaben, ohne Punkt. */
export function extensionOf(filename: string): string {
    const clean = filename.trim().toLowerCase();
    const dot = clean.lastIndexOf(".");
    if (dot < 0 || dot === clean.length - 1) return "";
    return clean.slice(dot + 1);
}

export function isBlockedExtension(filename: string): boolean {
    return BLOCKED_EXTENSIONS.includes(extensionOf(filename));
}

/** Der Typ, den die ersten Bytes verraten -- oder null. */
export function detectSignature(content: Buffer | Uint8Array): string | null {
    const bytes = content instanceof Uint8Array ? content : new Uint8Array(content);
    for (const entry of SIGNATURES) {
        if (entry.matches(bytes)) return entry.type;
    }
    return null;
}

/** Nur der Typ, ohne Parameter wie "; charset=utf-8". */
export function baseType(value: string | null | undefined): string {
    return (value ?? "").split(";")[0].trim().toLowerCase();
}

/**
 * Ist der Inhalt gueltiges UTF-8 ohne Nullbytes?
 *
 * TextDecoder mit `fatal` wirft bei ungueltigen Folgen -- genau das wollen wir
 * wissen. Das Nullbyte ist zwar gueltiges UTF-8, aber in einer Textdatei ein
 * verlaessliches Zeichen dafuer, dass etwas Binaeres darunter liegt.
 */
export function isValidUtf8Text(content: Buffer | Uint8Array): boolean {
    const bytes = content instanceof Uint8Array ? content : new Uint8Array(content);
    if (bytes.includes(0)) return false;

    try {
        new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        return true;
    } catch {
        return false;
    }
}

/**
 * Prueft eine hochgeladene Datei gegen die Positivliste und ihren eigenen
 * Inhalt. `allowedTypes` kommt vom Aufrufer, damit Mitgliedsunterlagen
 * (nur PDF und Bild) und die Dateiablage (mehr) dieselbe Pruefung mit
 * unterschiedlichem Umfang benutzen koennen.
 */
export function checkUpload(input: UploadCheckInput, allowedTypes: readonly string[]): UploadCheck {
    const filename = input.filename.trim();

    if (isBlockedExtension(filename)) {
        return {
            ok: false,
            status: 415,
            error: `Dateien mit der Endung „.${extensionOf(filename)}“ werden nicht angenommen.`
        };
    }

    const declared = baseType(input.declaredType);
    const fromExtension = BY_EXTENSION[extensionOf(filename)] ?? "";

    /**
     * Der gemeldete Typ zaehlt; meldet der Browser nichts oder nur den
     * Sammeltyp, entscheidet die Endung. Andersherum nicht -- eine .txt mit
     * gemeldetem "application/pdf" bleibt ein PDF-Anspruch und faellt gleich
     * an der Signatur durch.
     */
    const claimed = declared && declared !== "application/octet-stream" ? declared : fromExtension;

    if (!claimed) {
        return {
            ok: false,
            status: 415,
            error: "Der Dateityp liess sich nicht bestimmen. Bitte eine Datei mit passender Endung wählen."
        };
    }

    if (!allowedTypes.includes(claimed)) {
        return {
            ok: false,
            status: 415,
            error: `Dateien vom Typ „${claimed}“ sind hier nicht erlaubt.`
        };
    }

    const signature = detectSignature(input.content);

    if (SIGNATURE_TYPES.has(claimed)) {
        if (signature !== claimed) {
            return {
                ok: false,
                status: 415,
                error: "Der Inhalt der Datei passt nicht zu ihrem Typ."
            };
        }
        return { ok: true, contentType: claimed };
    }

    /**
     * Umgekehrter Fall: der Anspruch traegt keine Signatur, der Inhalt aber
     * schon. Eine als .csv gemeldete PDF-Datei wuerde sonst mit falschem Typ
     * abgelegt und spaeter falsch ausgeliefert.
     */
    if (signature) {
        return {
            ok: false,
            status: 415,
            error: "Der Inhalt der Datei passt nicht zu ihrem Typ."
        };
    }

    if (TEXT_TYPES.has(claimed) && !isValidUtf8Text(input.content)) {
        return {
            ok: false,
            status: 415,
            error: "Die Textdatei ist nicht in UTF-8 kodiert oder enthält Binärdaten."
        };
    }

    return { ok: true, contentType: claimed };
}
