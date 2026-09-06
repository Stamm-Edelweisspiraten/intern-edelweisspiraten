import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Regressionstest fuer die Absicherung der REST-API.
 *
 * Eine neue Route ist schnell angelegt und der Guard schnell vergessen --
 * und weil handleApiRequest jede Anfrage ohne gueltiges Token bereits mit 401
 * abweist, faellt eine fehlende Scope-Pruefung im Alltag nicht auf: es
 * braucht ein gueltiges Token mit ZU WENIG Rechten, um den Fehler zu sehen.
 * Deshalb prueft dieser Test statisch, ohne Datenbank und ohne Server: jede
 * Datei, die einen HTTP-Handler exportiert, muss requireScope aufrufen.
 *
 * Der Test liest den Quelltext, er fuehrt ihn nicht aus. Er kann damit nicht
 * beweisen, dass der Guard im richtigen Zweig steht -- nur, dass er
 * ueberhaupt vorkommt. Das faengt genau den Fehler, um den es geht.
 */

const API_ROOT = fileURLToPath(new URL("../../../routes/api/v1", import.meta.url));

const METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"] as const;

/**
 * Routen ohne Scope-Pruefung -- jede mit Begruendung.
 *
 * Wer hier etwas eintraegt, nimmt eine Route bewusst aus. Ein Eintrag ohne
 * Grund gehoert nicht in diese Liste, sondern der Guard in die Route.
 */
const ALLOWED_WITHOUT_SCOPE = new Map<string, string>([
    [
        "+server.ts",
        // Selbstauskunft der Schnittstelle. Steht in PUBLIC_API_PATHS und ist
        // absichtlich ohne Token erreichbar, damit ein Fremdsystem die
        // Adresse pruefen kann.
        "oeffentliche Selbstauskunft"
    ],
    [
        "openapi.json/+server.ts",
        // Schnittstellenbeschreibung, ebenfalls in PUBLIC_API_PATHS.
        "oeffentliche Schnittstellenbeschreibung"
    ],
    [
        "pdf/+server.ts",
        // Listet die PDF-Vorlagen, die DIESES Token erzeugen darf, und
        // filtert dafuer selbst ueber matchesPermission. Ein eigener Scope
        // waere willkuerlich gewaehlt und wuerde Tokens aussperren, die
        // einzelne Vorlagen sehr wohl benutzen duerfen.
        "filtert selbst je Vorlage ueber matchesPermission"
    ]
]);

/** Alle +server.ts unterhalb von src/routes/api/v1, als Pfad mit "/". */
function collectHandlers(dir: string, prefix = ""): string[] {
    const found: string[] = [];

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
            found.push(...collectHandlers(path.join(dir, entry.name), relative));
        } else if (entry.name === "+server.ts") {
            found.push(relative);
        }
    }

    return found.sort();
}

const handlers = collectHandlers(API_ROOT);

function exportedMethods(source: string): string[] {
    return METHODS.filter((method) =>
        new RegExp(`export\\s+(?:const|async\\s+function|function)\\s+${method}\\b`).test(source)
    );
}

describe("REST-API: Absicherung der Handler", () => {
    it("findet ueberhaupt Routen", () => {
        // Schlaegt an, wenn das Verzeichnis umzieht -- sonst waere der Test
        // gruen, weil er nichts mehr prueft.
        expect(handlers.length).toBeGreaterThan(10);
    });

    it.each(handlers)("%s ruft requireScope auf", (relative) => {
        const source = readFileSync(path.join(API_ROOT, relative), "utf8");
        const methods = exportedMethods(source);

        if (methods.length === 0) return;

        // Begruendete Ausnahme, siehe ALLOWED_WITHOUT_SCOPE.
        if (ALLOWED_WITHOUT_SCOPE.has(relative)) return;

        expect(
            source.includes("requireScope"),
            `${relative} exportiert ${methods.join(", ")}, ruft aber kein requireScope auf.`
        ).toBe(true);
    });

    it("enthaelt keine Ausnahme fuer eine Route, die es nicht mehr gibt", () => {
        for (const relative of ALLOWED_WITHOUT_SCOPE.keys()) {
            expect(handlers, `Ausnahme fuer ${relative} ist veraltet.`).toContain(relative);
        }
    });
});
