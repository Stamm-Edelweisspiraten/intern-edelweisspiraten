/**
 * Ein kleiner Markdown-Renderer -- bewusst ohne zusaetzliche Abhaengigkeit.
 *
 * Die Reihenfolge ist der ganze Sicherheitsgewinn: ZUERST wird der gesamte
 * Eingabetext HTML-escaped, DANN werden die Auszeichnungen eingesetzt. Damit
 * kann kein Zeichen aus der Quelle jemals als Markup wirken -- rohes HTML aus
 * dem Dokument landet garantiert als sichtbarer Text auf der Seite und nicht
 * im Dokumentbaum.
 *
 * Erlaubt ist ausschliesslich, was hier ausdruecklich erzeugt wird
 * (Positivliste): Ueberschriften, fett, kursiv, Code inline und als Block,
 * Listen, Zitate, Tabellen, Trennlinien, Links und Bilder. Links und Bilder
 * nur mit http:, https: oder mailto: -- jedes andere Schema (javascript:,
 * data:, vbscript:, file: ...) faellt auf reinen Text zurueck.
 *
 * Attribute werden nirgends aus der Quelle uebernommen. Die einzige Stelle,
 * an der Text in ein Attribut wandert, sind href und src eines geprueften
 * Verweises sowie der alt-Text eines Bildes -- alle drei bereits escaped,
 * Anfuehrungszeichen sind zu diesem Zeitpunkt also schon &quot;.
 */

/** Schemata, die ein Verweis tragen darf. */
const SAFE_SCHEMES = ["http://", "https://", "mailto:"];

/**
 * Platzhalter fuer Code-Abschnitte waehrend der Inline-Verarbeitung.
 *
 * Steuerzeichen werden beim Escapen entfernt, das Zeichen kann also nicht aus
 * der Quelle stammen -- ein Text kann sich damit keinen Platzhalter unter-
 * schieben.
 */
const CODE_MARK = "\u0000";

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * Vereinheitlicht Zeilenenden und wirft Steuerzeichen weg.
 *
 * Ein Nullbyte oder ein anderes Steuerzeichen hat in gerendertem Text nichts
 * verloren und wuerde ausserdem die Platzhalter unterlaufen.
 */
function normalize(value: string): string {
    return value
        .replace(/\r\n?/g, "\n")
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

/**
 * Ist die Adresse erlaubt?
 *
 * Geprueft wird der escapte Text -- Anfuehrungszeichen sind darin bereits zu
 * &quot; geworden und koennen das Attribut nicht mehr verlassen. Zusaetzlich
 * wird alles abgewiesen, was Leerraum enthaelt: ein Schema laesst sich sonst
 * durch eingestreute Zeichen verschleiern.
 */
function isSafeUrl(url: string): boolean {
    const trimmed = url.trim();
    if (!trimmed || /\s/.test(trimmed)) return false;

    const lower = trimmed.toLowerCase();
    return SAFE_SCHEMES.some((scheme) => lower.startsWith(scheme));
}

// ---------------------------------------------------------------------------
// Inline
// ---------------------------------------------------------------------------

/**
 * Auszeichnungen innerhalb einer Zeile. Der Text ist bereits escaped.
 *
 * Code-Abschnitte werden zuerst herausgenommen und durch Platzhalter ersetzt,
 * damit ein `**` innerhalb von Code nicht zu Fettschrift wird.
 */
function inline(text: string): string {
    const codes: string[] = [];

    let work = text.replace(/`([^`]+)`/g, (_match, content: string) => {
        codes.push(content);
        return `${CODE_MARK}${codes.length - 1}${CODE_MARK}`;
    });

    // Bilder vor Links -- sonst greift die Linkregel auf das "[...]" zu.
    work = work.replace(/!\[([^\]]*)\]\(([^)\s]*)\)/g, (match, alt: string, url: string) => {
        if (!isSafeUrl(url)) return match;
        return `<img src="${url.trim()}" alt="${alt}" class="max-w-full rounded-card" loading="lazy" />`;
    });

    work = work.replace(/\[([^\]]*)\]\(([^)\s]*)\)/g, (match, label: string, url: string) => {
        // Unerlaubtes Schema: der Ausdruck bleibt so stehen, wie er dasteht.
        if (!isSafeUrl(url)) return match;
        return `<a href="${url.trim()}" rel="noopener noreferrer nofollow" target="_blank" class="text-primary underline">${label}</a>`;
    });

    work = work
        .replace(/\*\*([^\n]+?)\*\*/g, "<strong>$1</strong>")
        .replace(/__([^\n]+?)__/g, "<strong>$1</strong>")
        .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
        .replace(/(^|[^_\w])_([^_\n]+)_/g, "$1<em>$2</em>")
        .replace(/~~([^~]+)~~/g, "<del>$1</del>");

    return work.replace(
        new RegExp(`${CODE_MARK}(\\d+)${CODE_MARK}`, "g"),
        (_match, index: string) =>
            `<code class="px-1 py-0.5 rounded-control bg-surface-sunken text-fg font-mono text-[0.9em]">${codes[Number(index)] ?? ""}</code>`
    );
}

// ---------------------------------------------------------------------------
// Bloecke
// ---------------------------------------------------------------------------

const HEADING = /^(#{1,6})\s+(.*)$/;
const HR = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const UNORDERED = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*\d{1,3}[.)]\s+(.*)$/;
// Nach dem Escapen beginnt ein Zitat mit &gt; statt mit >.
const QUOTE = /^\s*&gt;\s?(.*)$/;
const FENCE = /^\s*```([A-Za-z0-9+#_-]{0,20})\s*$/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const HEADING_CLASS = [
    "text-2xl font-bold text-fg mt-6 mb-3",
    "text-xl font-bold text-fg mt-6 mb-3",
    "text-lg font-semibold text-fg mt-5 mb-2",
    "text-base font-semibold text-fg mt-4 mb-2",
    "text-sm font-semibold text-fg mt-4 mb-2",
    "text-sm font-semibold text-fg-muted mt-4 mb-2"
];

function tableCells(line: string): string[] {
    return line
        .replace(/^\s*\|/, "")
        .replace(/\|\s*$/, "")
        .split("|")
        .map((cell) => cell.trim());
}

function isTableRow(line: string): boolean {
    return line.includes("|") && line.trim().length > 0;
}

/**
 * Setzt die Bloecke zusammen. Erwartet BEREITS escapten Text -- der Zitatblock
 * ruft sich selbst auf und darf deshalb nicht erneut escapen.
 */
function renderBlocks(lines: string[]): string {
    const out: string[] = [];
    let index = 0;

    while (index < lines.length) {
        const line = lines[index];

        if (line.trim() === "") {
            index += 1;
            continue;
        }

        // Codeblock
        const fence = line.match(FENCE);
        if (fence) {
            const language = fence[1];
            const body: string[] = [];
            index += 1;
            while (index < lines.length && !FENCE.test(lines[index])) {
                body.push(lines[index]);
                index += 1;
            }
            // Die schliessende Zeile ueberspringen, falls vorhanden.
            if (index < lines.length) index += 1;

            const languageClass = language ? ` data-language="${language}"` : "";
            out.push(
                `<pre class="overflow-x-auto rounded-card bg-surface-sunken border border-border p-4 my-4"${languageClass}><code class="font-mono text-sm text-fg whitespace-pre">${body.join("\n")}</code></pre>`
            );
            continue;
        }

        // Trennlinie -- vor der Liste pruefen, "---" faengt sonst als Punkt an.
        if (HR.test(line)) {
            out.push('<hr class="my-6 border-border" />');
            index += 1;
            continue;
        }

        // Ueberschrift
        const heading = line.match(HEADING);
        if (heading) {
            const level = heading[1].length;
            out.push(
                `<h${level} class="${HEADING_CLASS[level - 1]}">${inline(heading[2].trim())}</h${level}>`
            );
            index += 1;
            continue;
        }

        // Zitat
        if (QUOTE.test(line)) {
            const body: string[] = [];
            while (index < lines.length && QUOTE.test(lines[index])) {
                body.push(lines[index].match(QUOTE)![1]);
                index += 1;
            }
            out.push(
                `<blockquote class="border-l-4 border-border pl-4 my-4 text-fg-muted">${renderBlocks(body)}</blockquote>`
            );
            continue;
        }

        // Tabelle: Kopfzeile, Trennzeile, dann Datenzeilen.
        if (
            isTableRow(line) &&
            index + 1 < lines.length &&
            TABLE_DIVIDER.test(lines[index + 1]) &&
            lines[index + 1].includes("-")
        ) {
            const header = tableCells(line);
            index += 2;

            const body: string[][] = [];
            while (index < lines.length && isTableRow(lines[index])) {
                body.push(tableCells(lines[index]));
                index += 1;
            }

            const head = header
                .map(
                    (cell) =>
                        `<th class="px-3 py-2 text-left text-xs font-semibold text-fg-muted uppercase tracking-wide">${inline(cell)}</th>`
                )
                .join("");

            const rows = body
                .map(
                    (cells) =>
                        `<tr class="border-t border-border">${cells
                            .map(
                                (cell) =>
                                    `<td class="px-3 py-2 text-sm text-fg">${inline(cell)}</td>`
                            )
                            .join("")}</tr>`
                )
                .join("");

            out.push(
                `<div class="overflow-x-auto my-4"><table class="w-full border border-border rounded-card"><thead class="bg-surface-sunken">${head ? `<tr>${head}</tr>` : ""}</thead><tbody>${rows}</tbody></table></div>`
            );
            continue;
        }

        // Listen
        const listMatch = line.match(UNORDERED) ?? line.match(ORDERED);
        if (listMatch) {
            const ordered = !UNORDERED.test(line);
            const items: string[] = [];

            while (index < lines.length) {
                const current = lines[index];
                const isUnordered = UNORDERED.test(current) && !HR.test(current);
                const isOrdered = ORDERED.test(current);
                if (ordered ? !isOrdered : !isUnordered) break;

                const match = current.match(ordered ? ORDERED : UNORDERED)!;
                items.push(`<li class="ml-1">${inline(match[1].trim())}</li>`);
                index += 1;
            }

            const tag = ordered ? "ol" : "ul";
            const style = ordered ? "list-decimal" : "list-disc";
            out.push(
                `<${tag} class="${style} pl-6 my-3 space-y-1 text-fg">${items.join("")}</${tag}>`
            );
            continue;
        }

        // Absatz: alles bis zur naechsten Leerzeile oder zum naechsten Block.
        const paragraph: string[] = [];
        while (index < lines.length) {
            const current = lines[index];
            if (current.trim() === "") break;
            if (
                HEADING.test(current) ||
                HR.test(current) ||
                QUOTE.test(current) ||
                FENCE.test(current) ||
                UNORDERED.test(current) ||
                ORDERED.test(current)
            ) {
                break;
            }
            paragraph.push(current.trim());
            index += 1;
        }

        // Zeilen innerhalb eines Absatzes umbrechen.
        out.push(
            `<p class="my-3 text-fg leading-relaxed">${paragraph.map(inline).join("<br />")}</p>`
        );
    }

    return out.join("\n");
}

/**
 * Rendert Markdown zu HTML, das gefahrlos per {@html} eingesetzt werden kann.
 */
export function renderMarkdown(source: string): string {
    if (typeof source !== "string" || source.trim() === "") return "";
    return renderBlocks(escapeHtml(normalize(source)).split("\n"));
}
