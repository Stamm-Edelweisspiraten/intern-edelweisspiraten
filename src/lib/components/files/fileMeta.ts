/**
 * Kleine Helfer rund um eine Datei -- Groesse, Symbol, Art der Vorschau.
 *
 * Liegen hier und nicht in $lib/format, weil sie nur die Dateiablage
 * betreffen; formatBytes und iconFor waren vorher als Kopien in der
 * Uebersichtsseite verdrahtet.
 */

/**
 * Obergrenze fuer die Textvorschau.
 *
 * Darueber wird nichts mehr angezeigt, sondern zum Herunterladen geraten --
 * ein halbes Megabyte Text macht im Browser sonst nur die Seite schwer.
 * Steht hier, damit Endpunkt, Vorschauseite und Oberflaeche denselben Wert
 * benutzen.
 */
export const MAX_PREVIEW_BYTES = 512 * 1024;

export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return "–";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

/** Bootstrap-Icon zum Typ. */
export function iconFor(contentType: string): string {
    const type = (contentType ?? "").split(";")[0].trim().toLowerCase();

    if (type === "application/pdf") return "file-earmark-pdf";
    if (type.startsWith("image/")) return "file-earmark-image";
    if (type === "text/markdown") return "markdown";
    if (type === "application/json" || type.includes("yaml")) return "file-earmark-code";
    if (type === "text/csv" || type.includes("sheet") || type.includes("excel")) {
        return "file-earmark-spreadsheet";
    }
    if (type.includes("word") || type.includes("opendocument.text")) return "file-earmark-word";
    if (type.startsWith("text/")) return "file-earmark-text";
    return "file-earmark";
}

/** Kurzes, lesbares Etikett statt des vollen MIME-Typs. */
const LABELS: Record<string, string> = {
    "application/pdf": "PDF",
    "image/png": "PNG",
    "image/jpeg": "JPEG",
    "image/gif": "GIF",
    "image/webp": "WebP",
    "text/plain": "Text",
    "text/csv": "CSV",
    "text/markdown": "Markdown",
    "application/json": "JSON",
    "text/yaml": "YAML",
    "application/yaml": "YAML",
    "application/msword": "Word",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
    "application/vnd.ms-excel": "Excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
    "application/vnd.oasis.opendocument.text": "ODT",
    "application/vnd.oasis.opendocument.spreadsheet": "ODS"
};

export function typeLabel(contentType: string): string {
    const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
    return LABELS[type] ?? (type.split("/")[1] ?? "Datei").toUpperCase();
}

export type PreviewKind = "image" | "pdf" | "markdown" | "text" | "none";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const TEXT_TYPES = ["text/plain", "text/csv", "application/json", "text/yaml", "application/yaml"];

/**
 * Was die Vorschau mit dieser Datei anfangen kann.
 *
 * Bewusst NICHT nach Endung, sondern nach dem beim Hochladen geprueften Typ:
 * die Endung sagt nichts darueber aus, was wirklich in der Datei steht.
 */
export function previewKindOf(contentType: string): PreviewKind {
    const type = (contentType ?? "").split(";")[0].trim().toLowerCase();

    if (IMAGE_TYPES.includes(type)) return "image";
    if (type === "application/pdf") return "pdf";
    if (type === "text/markdown") return "markdown";
    if (TEXT_TYPES.includes(type)) return "text";
    return "none";
}

export function canPreview(contentType: string): boolean {
    return previewKindOf(contentType) !== "none";
}
