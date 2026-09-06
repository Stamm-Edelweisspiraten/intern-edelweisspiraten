/**
 * Kopfzeilen fuer Dateiauslieferungen -- an einer Stelle.
 *
 * Vorher baute jede Route ihre eigenen: `pdf/deliver.ts` und
 * `dateien/[id]` filterten den Dateinamen, `members/[id]/files/[type]` nicht.
 * Ein Dateiname mit Anfuehrungszeichen oder Zeilenumbruch schleust dort
 * beliebige weitere Kopfzeilen ein.
 */

/**
 * Typen, die ein Browser gefahrlos anzeigen darf.
 *
 * Alles andere wird zum Herunterladen angeboten. Entscheidend ist, was hier
 * NICHT steht: `text/html`, `application/xhtml+xml` und `image/svg+xml`
 * fuehren im selben Ursprung Skript aus und werden nie eingebettet.
 */
const INLINE_TYPES = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "text/plain",
    "text/csv",
    "text/markdown",
    "application/json"
]);

/** Alles, was den Dateinamen aus dem Anfuehrungszeichen brechen koennte. */
export function safeFilename(filename: string, fallback = "datei"): string {
    const cleaned = filename
        .replace(/[\r\n]/g, " ")
        .replace(/["\\]/g, "")
        // Steuerzeichen haben in einer Kopfzeile nichts verloren.
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim();

    return cleaned || fallback;
}

export function contentDisposition(
    filename: string,
    disposition: "inline" | "attachment"
): string {
    const safe = safeFilename(filename);

    // RFC 5987 zusaetzlich, damit Umlaute im Dateinamen ankommen; der
    // einfache Teil bleibt fuer aeltere Browser stehen.
    const encoded = encodeURIComponent(safe);

    return `${disposition}; filename="${safe}"; filename*=UTF-8''${encoded}`;
}

/** true, wenn der Typ im Browser angezeigt werden darf. */
export function isInlineType(contentType: string | null | undefined): boolean {
    return INLINE_TYPES.has((contentType ?? "").split(";")[0].trim().toLowerCase());
}

export interface DownloadHeaderOptions {
    contentType: string | null | undefined;
    filename: string;
    length?: number;
    /** Erzwingt das Herunterladen, auch bei einem anzeigbaren Typ. */
    forceDownload?: boolean;
    cacheControl?: string;
}

/**
 * Vollstaendiger Kopfzeilensatz einer Dateiantwort.
 *
 * `nosniff` ist hier nicht optional: ohne die Kopfzeile raet der Browser den
 * Typ aus dem Inhalt und macht aus einer als `text/plain` abgelegten Datei
 * wieder HTML.
 */
export function downloadHeaders(options: DownloadHeaderOptions): Record<string, string> {
    const type = options.contentType || "application/octet-stream";
    const inline = !options.forceDownload && isInlineType(type);

    const headers: Record<string, string> = {
        "Content-Type": type,
        "Content-Disposition": contentDisposition(options.filename, inline ? "inline" : "attachment"),
        "X-Content-Type-Options": "nosniff",
        // Mitgliederdaten gehoeren nicht in einen Zwischenspeicher.
        "Cache-Control": options.cacheControl ?? "private, no-store"
    };

    if (typeof options.length === "number") headers["Content-Length"] = String(options.length);

    // Ein SVG wird nur als Bild eingebunden, nie als Dokument. Die Richtlinie
    // nimmt ihm Skript, externe Verweise und eingebettete Objekte.
    if (type.startsWith("image/svg")) {
        headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
    }

    return headers;
}
