import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Regressionstest fuer die Absicherung der internen Routen.
 *
 * Gegenstueck zu `api/guards.test.ts`, aus demselben Grund und mit derselben
 * Einschraenkung: der Test LIEST den Quelltext, er fuehrt ihn nicht aus. Er
 * kann damit nicht beweisen, dass der Guard im richtigen Zweig steht -- nur,
 * dass ueberhaupt einer da ist. Genau das ist aber der Fehler, um den es geht.
 *
 * Warum es ihn braucht: SvelteKit fuehrt bei Form-Actions KEIN `load` aus.
 * Eine Absicherung nur im `load` schuetzt die Aktionen daneben also nicht --
 * und weil `hooks.server.ts` jede Anfrage ohne Sitzung ohnehin zur Anmeldung
 * schickt, faellt eine vergessene Rechtepruefung im Alltag nicht auf. Es
 * braucht einen ANGEMELDETEN Zugang mit zu wenig Rechten, um sie zu sehen.
 *
 * Geprueft wird JEDE AKTION EINZELN, nicht die Datei als Ganzes: ein einziger
 * Guard oben im `load` waere sonst genug, um den Test gruen zu faerben, und
 * damit pruefte er genau das nicht mehr, wofuer er da ist.
 *
 * Dabei zaehlt auch ein Vorspann-Helfer in derselben Datei (etwa
 * `requireManage()` in den Terminen): er enthaelt den Guard, und ihn zu
 * verlangen ist strenger als ein blosses Vorkommen im Dateitext.
 *
 * Geprueft werden die Bereiche, die mit den Umfragen, der Galerie und den
 * gruppenbezogenen Terminrechten dazugekommen bzw. umgebaut worden sind.
 * Aeltere Bereiche bleiben bewusst aussen vor: dieser Test soll neue Fehler
 * verhindern, nicht eine Sanierung erzwingen, die nicht Teil der Aenderung ist.
 */

const ROUTES = fileURLToPath(new URL("../../routes", import.meta.url));

/** Die Bereiche, fuer die dieser Test gilt. */
const AREAS = ["intern/umfragen", "intern/galerie", "intern/termine"];

/**
 * Alles, was eine Rechtepruefung sein kann.
 *
 * `requirePermission` und Verwandte werfen; `groupsWithPermission` wirft
 * nicht, wird aber immer zusammen mit einer eigenen Auswertung benutzt
 * (`mayManageEvent`, `mayManageSurvey`, `mayManageGallery`). Beides zaehlt.
 */
const GUARDS = [
    "requirePermission",
    "requireAnyPermission",
    "requirePermissionForGroup",
    "requirePermissionForAnyGroup",
    "requireGroupsWithPermission",
    "groupsWithPermission"
];

const HTTP_METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"] as const;

/**
 * Routen, die ohne die Guards aus `permissionGuard.ts` auskommen -- jede mit
 * Begruendung.
 *
 * Wer hier etwas eintraegt, nimmt eine Route bewusst aus. Ein Eintrag ohne
 * Grund gehoert nicht in diese Liste, sondern der Guard in die Route.
 */
const ALLOWED_WITHOUT_GUARD = new Map<string, string>([
    [
        "intern/termine/kalender.ics/+server.ts",
        // Steht in PUBLIC_PREFIXES und hat deshalb gar keine Sitzung: ein
        // Kalenderprogramm kann sich nicht anmelden. Der Zugang wird ueber das
        // Abo-Token aufgeloest, danach loest die Route die Rechte SELBST auf
        // (`resolveGrants`) und prueft `events.view` mit `matchesPermission`.
        // Die Guards setzen `event.locals` voraus und waeren hier wirkungslos.
        "Token statt Sitzung, prueft events.view selbst ueber resolveGrants"
    ]
]);

interface Candidate {
    /** Pfad relativ zu src/routes, mit "/" -- so steht er in der Meldung. */
    relative: string;
    source: string;
}

function collect(dir: string, prefix: string): Candidate[] {
    if (!existsSync(dir)) return [];

    const found: Candidate[] = [];

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const relative = `${prefix}/${entry.name}`;

        if (entry.isDirectory()) {
            found.push(...collect(path.join(dir, entry.name), relative));
            continue;
        }

        if (entry.name === "+page.server.ts" || entry.name === "+server.ts") {
            found.push({ relative, source: readFileSync(path.join(dir, entry.name), "utf8") });
        }
    }

    return found.sort((a, b) => a.relative.localeCompare(b.relative));
}

const candidates = AREAS.flatMap((area) => collect(path.join(ROUTES, area), area));

/**
 * Namen lokaler Funktionen, deren Rumpf selbst einen Guard aufruft.
 *
 * Damit zaehlt `await requireManage(event)` in einer Aktion als Absicherung --
 * ohne dass ein beliebiger anderer Funktionsaufruf durchginge.
 */
function guardHelpers(source: string): string[] {
    const names: string[] = [];

    for (const match of source.matchAll(
        /(?:async\s+function|function)\s+(\w+)\s*\([^)]*\)[^{]*\{/g
    )) {
        const name = match[1];
        const body = balancedBody(source, match.index! + match[0].length - 1);
        if (body && GUARDS.some((guard) => body.includes(`${guard}(`))) names.push(name);
    }

    return names;
}

/** Der Text zwischen der Klammer an `open` und ihrer schliessenden Klammer. */
function balancedBody(source: string, open: number): string | null {
    let depth = 0;

    for (let index = open; index < source.length; index += 1) {
        const char = source[index];
        if (char === "{") depth += 1;
        else if (char === "}") {
            depth -= 1;
            if (depth === 0) return source.slice(open + 1, index);
        }
    }

    return null;
}

/** Jede Aktion mit ihrem Rumpf. */
function actions(source: string): { name: string; body: string }[] {
    const start = source.search(/export const actions:\s*Actions\s*=\s*\{/);
    if (start < 0) return [];

    const block = balancedBody(source, source.indexOf("{", start));
    if (!block) return [];

    const found: { name: string; body: string }[] = [];

    for (const match of block.matchAll(/(?:^|\n)\s{4}(\w+):\s*async\s*\([^)]*\)\s*=>\s*\{/g)) {
        const body = balancedBody(block, match.index! + match[0].length - 1);
        if (body !== null) found.push({ name: match[1], body });
    }

    return found;
}

function exportedMethods(source: string): { name: string; body: string }[] {
    const found: { name: string; body: string }[] = [];

    for (const method of HTTP_METHODS) {
        const match = source.match(
            new RegExp(
                `export\\s+(?:const\\s+${method}[^=]*=\\s*async\\s*\\([^)]*\\)\\s*=>\\s*\\{` +
                    `|async\\s+function\\s+${method}\\s*\\([^)]*\\)[^{]*\\{)`
            )
        );
        if (!match) continue;

        const body = balancedBody(source, match.index! + match[0].length - 1);
        found.push({ name: method, body: body ?? source });
    }

    return found;
}

function loadBody(source: string): string | null {
    const match = source.match(/export const load:\s*PageServerLoad\s*=\s*async\s*\([^)]*\)\s*=>\s*\{/);
    if (!match) return null;
    return balancedBody(source, match.index! + match[0].length - 1);
}

describe("Interne Routen: Absicherung", () => {
    it("findet ueberhaupt Routen", () => {
        // Schlaegt an, wenn ein Verzeichnis umzieht -- sonst waere der Test
        // gruen, weil er nichts mehr prueft.
        expect(candidates.length).toBeGreaterThan(5);
    });

    it.each(AREAS)("%s ist vorhanden", (area) => {
        expect(existsSync(path.join(ROUTES, area)), `${area} fehlt.`).toBe(true);
    });

    it.each(candidates.map((entry) => entry.relative))(
        "%s sichert load, jede Aktion und jeden Handler ab",
        (relative) => {
            const entry = candidates.find((item) => item.relative === relative)!;

            // Begruendete Ausnahme, siehe ALLOWED_WITHOUT_GUARD.
            if (ALLOWED_WITHOUT_GUARD.has(relative)) return;

            const accepted = [...GUARDS, ...guardHelpers(entry.source)];

            const guarded = (body: string) =>
                accepted.some((name) => body.includes(`${name}(`));

            const load = loadBody(entry.source);
            if (load !== null) {
                expect(guarded(load), `${relative}: load prueft kein Recht.`).toBe(true);
            }

            for (const action of actions(entry.source)) {
                expect(
                    guarded(action.body),
                    `${relative}: die Aktion "${action.name}" prueft kein Recht. ` +
                        "Ein load-Guard schuetzt Aktionen NICHT."
                ).toBe(true);
            }

            for (const handler of exportedMethods(entry.source)) {
                expect(
                    guarded(handler.body),
                    `${relative}: ${handler.name} prueft kein Recht.`
                ).toBe(true);
            }
        }
    );

    it("enthaelt keine Ausnahme fuer eine Route, die es nicht mehr gibt", () => {
        for (const relative of ALLOWED_WITHOUT_GUARD.keys()) {
            expect(
                candidates.map((entry) => entry.relative),
                `Ausnahme fuer ${relative} ist veraltet.`
            ).toContain(relative);
        }
    });

    /**
     * Die oeffentliche Umfrageseite liegt bewusst NICHT unter `intern/`.
     *
     * Dort erzwingt dieser Test einen Guard je Aktion; ohne Sitzung gibt es
     * aber nichts, wogegen ein Guard pruefen koennte. Statt eine Ausnahme in
     * die Liste oben zu schreiben und die Regel damit fuer das ganze Modul
     * aufzuweichen, steht die Seite auf oberster Ebene -- und muss dafuer in
     * `PUBLIC_PREFIXES` stehen, sonst landet jeder Aufruf auf /login.
     */
    it("gibt /umfrage oeffentlich frei, ohne die Guard-Regel aufzuweichen", () => {
        const hooks = readFileSync(
            fileURLToPath(new URL("../../hooks.server.ts", import.meta.url)),
            "utf8"
        );

        const block = hooks.match(/const PUBLIC_PREFIXES = \[([\s\S]*?)\];/);
        expect(block, "PUBLIC_PREFIXES nicht gefunden").not.toBeNull();
        expect(block![1]).toContain('"/umfrage"');

        /*
         * Der Guard-Test deckt intern/umfragen ab -- dort darf kein EINTRAG
         * stehen. Geprueft wird auf das oeffnende Anfuehrungszeichen, sonst
         * schlaegt schon die Begruendung im Kommentar daneben an.
         */
        expect(block![1]).not.toContain('"/intern/umfragen');

        // Und die Seite muss es auch wirklich geben.
        expect(
            existsSync(path.join(ROUTES, "umfrage")),
            "PUBLIC_PREFIXES gibt /umfrage frei, aber die Route fehlt."
        ).toBe(true);
    });

    it("erkennt in den Terminen ueberhaupt Aktionen", () => {
        // Sicherung gegen einen stillen Parser-Fehler: findet die Zerlegung
        // keine Aktionen mehr, waere der Test oben gruen, ohne etwas zu pruefen.
        const detail = candidates.find(
            (entry) => entry.relative === "intern/termine/[id]/+page.server.ts"
        );

        expect(detail, "Die Detailseite der Termine fehlt.").toBeDefined();
        expect(actions(detail!.source).length).toBeGreaterThanOrEqual(5);
    });
});
