import { describe, expect, it } from "vitest";
import { escapeHtml, renderMarkdown } from "./markdown";

/**
 * Der Renderer steht vor einem {@html}-Einsatz -- er ist damit die einzige
 * Stelle, die zwischen dem Inhalt einer hochgeladenen Datei und dem
 * Dokumentbaum des Portals liegt. Die Tests halten genau das fest, was dort
 * NICHT durchkommen darf.
 */

describe("escapeHtml", () => {
    it("ersetzt alle fuenf gefaehrlichen Zeichen", () => {
        expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
    });

    it("escapt das kaufmaennische Und zuerst", () => {
        // Andersherum entstuende aus "&lt;" ein doppelt escaptes "&amp;lt;".
        expect(escapeHtml("&lt;")).toBe("&amp;lt;");
    });
});

describe("renderMarkdown -- rohes HTML", () => {
    it("reicht ein script-Element nie durch", () => {
        const html = renderMarkdown("<script>alert(1)</script>");

        expect(html).not.toContain("<script");
        expect(html).toContain("&lt;script&gt;");
    });

    it("reicht ein img mit onerror nie durch", () => {
        const html = renderMarkdown("<img src=x onerror=alert(1)>");

        expect(html).not.toMatch(/<img[^>]*onerror/i);
        expect(html).toContain("&lt;img");
    });

    it("reicht ein iframe nie durch", () => {
        const html = renderMarkdown("<iframe src=\"https://example.org\"></iframe>");

        expect(html).not.toContain("<iframe");
        expect(html).toContain("&lt;iframe");
    });

    it("laesst kein Ereignisattribut aus der Quelle entstehen", () => {
        const html = renderMarkdown('Text <span onclick="alert(1)">klick</span>');

        // Der Text bleibt sichtbar, aber er steht in einem Textknoten --
        // kein Element traegt das Attribut.
        expect(html).not.toMatch(/<[a-z][^>]*onclick/i);
        expect(html).toContain("&lt;span");
    });

    it("escapt auch HTML in einem Codeblock", () => {
        const html = renderMarkdown('```html\n<a href="x" onclick="alert(1)">y</a>\n```');

        expect(html).toContain("<pre");
        expect(html).not.toContain('href="x"');
        expect(html).not.toMatch(/<[a-z][^>]*onclick/i);
        expect(html).toContain("&lt;a href=&quot;x&quot;");
    });

    it("escapt HTML in einem Code-Abschnitt innerhalb einer Zeile", () => {
        const html = renderMarkdown("Nimm `<script>alert(1)</script>` nicht ernst.");

        expect(html).not.toContain("<script");
        expect(html).toContain("&lt;script&gt;");
    });
});

describe("renderMarkdown -- Verweise", () => {
    it("erlaubt http, https und mailto", () => {
        expect(renderMarkdown("[a](https://example.org)")).toContain(
            'href="https://example.org"'
        );
        expect(renderMarkdown("[a](http://example.org)")).toContain('href="http://example.org"');
        expect(renderMarkdown("[a](mailto:x@example.org)")).toContain(
            'href="mailto:x@example.org"'
        );
    });

    it("macht aus javascript: reinen Text", () => {
        const html = renderMarkdown("[x](javascript:alert(1))");

        expect(html).not.toContain("href=");
        expect(html).not.toContain("<a ");
        expect(html).toContain("[x](javascript:alert(1))");
    });

    it("macht aus data: reinen Text", () => {
        const html = renderMarkdown("[x](data:text/html,<script>alert(1)</script>)");

        expect(html).not.toContain("href=");
        expect(html).not.toContain("<script");
    });

    it("laesst sich das Schema nicht durch Gross-/Kleinschreibung unterschieben", () => {
        expect(renderMarkdown("[x](JaVaScRiPt:alert(1))")).not.toContain("href=");
    });

    it("laesst sich das Schema nicht durch fuehrenden Leerraum unterschieben", () => {
        expect(renderMarkdown("[x](\tjavascript:alert(1))")).not.toContain("href=");
    });

    it("weist ein Bild mit unerlaubtem Schema ab", () => {
        const html = renderMarkdown("![x](javascript:alert(1))");

        expect(html).not.toContain("<img");
        expect(html).not.toContain("src=");
    });

    it("erlaubt ein Bild ueber https", () => {
        const html = renderMarkdown("![Karte](https://example.org/a.png)");

        expect(html).toContain('<img src="https://example.org/a.png"');
        expect(html).toContain('alt="Karte"');
    });

    it("kann das Attribut nicht ueber ein Anfuehrungszeichen verlassen", () => {
        const html = renderMarkdown('[x](https://example.org/")onmouseover=alert(1))');

        expect(html).not.toMatch(/<[a-z][^>]*onmouseover/i);
        // Das Anfuehrungszeichen ist zu diesem Zeitpunkt bereits entschaerft.
        expect(html).not.toMatch(/href="[^"]*"[a-z]/i);
    });
});

describe("renderMarkdown -- Auszeichnungen", () => {
    it("setzt Ueberschriften der richtigen Ebene", () => {
        expect(renderMarkdown("# Titel")).toContain("<h1");
        expect(renderMarkdown("### Titel")).toContain("<h3");
        expect(renderMarkdown("####### Zuviel")).not.toContain("<h7");
    });

    it("setzt fett und kursiv, auch verschachtelt", () => {
        const html = renderMarkdown("**fett und *kursiv* zugleich**");

        expect(html).toContain("<strong>");
        expect(html).toContain("<em>");
    });

    it("setzt Listen", () => {
        const unordered = renderMarkdown("- eins\n- zwei");
        expect(unordered).toContain("<ul");
        expect(unordered.match(/<li/g)?.length).toBe(2);

        const ordered = renderMarkdown("1. eins\n2. zwei");
        expect(ordered).toContain("<ol");
    });

    it("setzt Zitate", () => {
        const html = renderMarkdown("> Ein Zitat");

        expect(html).toContain("<blockquote");
        expect(html).toContain("Ein Zitat");
    });

    it("laesst rohes HTML auch im Zitat nicht durch", () => {
        expect(renderMarkdown("> <script>alert(1)</script>")).not.toContain("<script");
    });

    it("setzt Tabellen", () => {
        const html = renderMarkdown("| a | b |\n| --- | --- |\n| 1 | 2 |");

        expect(html).toContain("<table");
        expect(html).toContain("<th");
        expect(html).toContain("<td");
    });

    it("setzt Trennlinien", () => {
        expect(renderMarkdown("---")).toContain("<hr");
    });

    it("bricht Zeilen innerhalb eines Absatzes um", () => {
        expect(renderMarkdown("erste\nzweite")).toContain("<br />");
    });

    it("liefert fuer leere Eingabe nichts", () => {
        expect(renderMarkdown("")).toBe("");
        expect(renderMarkdown("   \n  ")).toBe("");
    });

    it("wirft Steuerzeichen weg", () => {
        const html = renderMarkdown("Text\u0000mit\u0007Steuerzeichen");

        expect(html).not.toContain("\u0000");
        expect(html).not.toContain("\u0007");
        expect(html).toContain("TextmitSteuerzeichen");
    });
});
