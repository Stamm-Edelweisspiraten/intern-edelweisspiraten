import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

/**
 * Abnahme im Browser.
 *
 * Legt ueber /setup einen Stamm samt Demodaten an und ruft danach jede Seite
 * ab, die in diesem Umbau entstanden ist. Geprueft wird auf Statuscode,
 * erwarteten Inhalt und Fehler in der Browserkonsole; nebenbei entstehen
 * Bildschirmfotos jeder Seite.
 *
 * Gedacht fuer die Abnahme von Hand, NICHT fuer die CI: es braucht einen
 * laufenden Server, einen Wegwerf-Container als Datenbank und Playwright.
 *
 *   docker run -d --name pg-smoke -p 5433:5432 -e POSTGRES_USER=intern \
 *     -e POSTGRES_PASSWORD=intern -e POSTGRES_DB=intern postgres:17-alpine
 *   DATABASE_URL=postgres://intern:intern@localhost:5433/intern npm run db:migrate
 *
 *   npm run build
 *   DATABASE_URL=postgres://intern:intern@localhost:5433/intern \
 *     SESSION_SECRET=... APP_ENC_KEY=... npm run preview -- --port 5178
 *
 *   SMOKE_DB_CONTAINER=pg-smoke node scripts/smoke.mjs http://localhost:5178 ./smoke
 *
 * NIEMALS gegen die Arbeitsdatenbank: der Lauf legt einen Stamm an, und
 * /setup ist danach dauerhaft gesperrt.
 *
 * Eine Eigenheit ist eingebaut: die Rolle "Administration" verlangt
 * Zwei-Faktor, weshalb der Hook jeden Aufruf unter /intern auf die
 * Einrichtungsseite umleitet. Mit SMOKE_DB_CONTAINER schaltet das Skript die
 * Anforderung in der Testdatenbank ab und meldet sich neu an -- geprueft
 * werden sollen die Seiten, nicht der Zwei-Faktor-Ablauf, der eigene Tests
 * hat.
 */

const BASE = process.argv[2] ?? "http://localhost:5178";
const OUT = process.argv[3] ?? "./smoke";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await context.newPage();

const problems = [];
page.on("pageerror", (err) => problems.push(`pageerror: ${err}`));
page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(`console: ${msg.text()}`);
});
page.on("response", (res) => {
    if (res.status() >= 500) problems.push(`${res.status()} ${res.url()}`);
});

const results = [];

function check(label, condition, detail = "") {
    results.push({ label, ok: Boolean(condition), detail });
}

// --- Ersteinrichtung --------------------------------------------------------
await page.goto(`${BASE}/setup`, { waitUntil: "networkidle" });
check("Einrichtung erreichbar", await page.locator("form").count() > 0);

await page.fill('input[name="organizationName"]', "Stamm Musterstadt");
await page.fill('input[name="city"]', "Musterstadt");
await page.fill('input[name="name"]', "Test Admin");
await page.fill('input[name="email"]', "admin@example.org");
await page.fill('input[name="password"]', "Sehr-Sicheres-Passwort-2026");
await page.fill('input[name="passwordRepeat"]', "Sehr-Sicheres-Passwort-2026");

const demo = page.locator('input[name="demoData"]');
if (await demo.count()) await demo.check();

await page.click('button[type="submit"]');
// Die Einrichtung legt Kontenrahmen, Geschaeftsjahr und Demodaten an -- das
// dauert spuerbar laenger als eine gewoehnliche Anmeldung.
await page.waitForURL(/\/intern/, { timeout: 90000 });

check("Nach der Einrichtung angemeldet", page.url().includes("/intern"));

/*
 * Die Administrationsrolle verlangt Zwei-Faktor. Der Hook leitet deshalb
 * JEDEN Aufruf unter /intern auf die Einrichtungsseite um, solange keine
 * Authenticator-App hinterlegt ist -- fuer diesen Durchlauf wird die
 * Anforderung deshalb in der Testdatenbank abgeschaltet. Geprueft werden
 * sollen die neuen Seiten, nicht der Zwei-Faktor-Ablauf; der hat eigene
 * Tests.
 */
if (process.env.SMOKE_DB_CONTAINER) {
    execFileSync("docker", [
        "exec",
        process.env.SMOKE_DB_CONTAINER,
        "psql",
        "-U",
        "intern",
        "-d",
        "intern",
        "-c",
        "update roles set require_mfa = false"
    ]);
    /*
     * Der Rechte-Cache haelt 60 Sekunden. Eine neue Anmeldung allein hilft
     * deshalb nicht -- gewartet werden muss trotzdem.
     */
    await context.clearCookies();
    await page.waitForTimeout(62_000);

    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.fill('input[name="email"]', "admin@example.org");
    await page.fill('input[name="password"]', "Sehr-Sicheres-Passwort-2026");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/intern/, { timeout: 30000 });
}

// --- Die neuen Seiten -------------------------------------------------------
const pages = [
    { path: "/intern/dashboard", expect: "Nächste Termine", shot: "dashboard" },
    { path: "/intern/termine", expect: "Termine", shot: "termine-liste" },
    { path: "/intern/termine?ansicht=monat", expect: "Mo", shot: "termine-monat" },
    { path: "/intern/umfragen", expect: "Umfragen", shot: "umfragen" },
    { path: "/intern/galerie", expect: "Galerie", shot: "galerie" },
    { path: "/intern/dateien", expect: "Dateien", shot: "dateien" },
    { path: "/intern/profil/kalender", expect: "Kalender abonnieren", shot: "kalender" },
    { path: "/intern/admin/speicher", expect: "Objektspeicher", shot: "speicher" },
    { path: "/intern/admin/permissions", expect: "Berechtigungen", shot: "rechte" },
    { path: "/intern/admin/position", expect: "Rolle", shot: "aemter" },
    { path: "/intern/finance", expect: "Verlauf", shot: "kasse" },
    { path: "/intern/finance/reports", expect: "Summen- und Saldenliste", shot: "berichte" },
    { path: "/intern/finance/outstanding", expect: "Fälligkeitsstaffel", shot: "offene-posten" },
    { path: "/intern/members", expect: "Mitgliedverwaltung", shot: "mitglieder" },
    { path: "/intern/groups", expect: "Gruppen", shot: "gruppen" }
];

for (const entry of pages) {
    const response = await page.goto(`${BASE}${entry.path}`, { waitUntil: "networkidle" });
    const status = response?.status() ?? 0;
    const body = await page.locator("body").innerText();

    check(
        `${entry.path} (${status})`,
        status === 200 && body.includes(entry.expect),
        status !== 200 ? `Status ${status}` : `„${entry.expect}“ fehlt`
    );

    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${entry.shot}.png`, fullPage: true });
}

// --- Einen Termin anlegen und zusagen ---------------------------------------
await page.goto(`${BASE}/intern/termine`, { waitUntil: "networkidle" });
const eventLink = page.locator('a[href^="/intern/termine/"]').first();

if (await eventLink.count()) {
    await eventLink.click();
    await page.waitForLoadState("networkidle");
    const body = await page.locator("body").innerText();
    check("Termindetail zeigt Rückmeldungen", body.includes("Rückmeldung"));
    await page.screenshot({ path: `${OUT}/termin-detail.png`, fullPage: true });
}

// --- Umfrage und Galerie im Detail -------------------------------------------
/*
 * Die Demodaten legen genau eine Umfrage und eine Galerie an. Geprueft wird
 * hier die Detailseite, weil dort das Formular je Feldtyp entsteht -- ein
 * Fehler in einem Feldtyp faellt auf der Uebersicht nicht auf.
 */
/*
 * Angesteuert wird ueber die Adresse aus dem Link, nicht per Klick: DataTable
 * legt Tabelle UND Karten in den Baum und blendet je nach Breite eine der
 * beiden aus. Ein Klick auf den ersten Treffer der Reihenfolge trifft damit
 * womoeglich ein unsichtbares Element -- die Adresse ist in beiden Faellen
 * dieselbe.
 */
async function openFirst(listPath, prefix, name) {
    await page.goto(`${BASE}${listPath}`, { waitUntil: "networkidle" });

    const href = await page
        .locator(`a[href^="${prefix}"]`)
        .first()
        .getAttribute("href")
        .catch(() => null);

    if (!href) {
        check(`${name} vorhanden`, false, "kein Eintrag in den Demodaten gefunden");
        return false;
    }

    const response = await page.goto(`${BASE}${href}`, { waitUntil: "networkidle" });
    check(`${name}: Detailseite (${response?.status() ?? 0})`, response?.status() === 200);
    return true;
}

if (await openFirst("/intern/umfragen", "/intern/umfragen/", "Umfrage")) {
    const body = await page.locator("body").innerText();
    // Die Demoumfrage traegt alle fuenf Feldtypen; die erste Frage steht fuer sie.
    check("Umfrage zeigt ihre Fragen", body.includes("Wie kommst du zum Zeltplatz"));
    await page.screenshot({ path: `${OUT}/umfrage-detail.png`, fullPage: true });
}

if (await openFirst("/intern/galerie", "/intern/galerie/", "Galerie")) {
    const body = await page.locator("body").innerText();
    // Leere Galerie: der leere Zustand muss stehen, nicht eine leere Flaeche.
    check("Galerie zeigt den leeren Zustand", body.includes("Noch keine Bilder"));
    await page.screenshot({ path: `${OUT}/galerie-detail.png`, fullPage: true });

    /*
     * Ein Bild ueber das echte Dateifeld hochladen.
     *
     * Das ist der einzige Weg, den Vorschaubild-Pfad zu pruefen: die
     * Verkleinerung entsteht im Browser (canvas -> toBlob) und wird als
     * zweite Datei mitgeschickt. Ein Test auf der Serverseite kann das nicht
     * zeigen -- dort kommt das fertige Vorschaubild einfach an.
     */
    const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64"
    );

    const fileInput = page.locator('input[type="file"]').first();

    if (await fileInput.count()) {
        await fileInput.setInputFiles({
            name: "smoke.png",
            mimeType: "image/png",
            buffer: png
        });
        // Der Upload laeuft ueber XHR; abgewartet wird auf die Anzeige.
        await page
            .waitForFunction(() => !document.body.innerText.includes("Noch keine Bilder"), {
                timeout: 15_000
            })
            .catch(() => {});

        const shown = await page.locator("body").innerText();
        check("Bild hochgeladen und angezeigt", !shown.includes("Noch keine Bilder"));
        await page.screenshot({ path: `${OUT}/galerie-mit-bild.png`, fullPage: true });

        if (process.env.SMOKE_DB_CONTAINER) {
            const thumb = execFileSync("docker", [
                "exec",
                process.env.SMOKE_DB_CONTAINER,
                "psql",
                "-U",
                "intern",
                "-d",
                "intern",
                "-tAc",
                "select coalesce(thumb_file_id::text, 'keins') from gallery_images limit 1"
            ])
                .toString()
                .trim();

            check(
                "Vorschaubild im Browser erzeugt",
                thumb !== "keins" && thumb !== "",
                "thumb_file_id ist leer -- die Verkleinerung kam nicht an"
            );
        }
    } else {
        check("Dateifeld der Galerie vorhanden", false, "kein input[type=file] gefunden");
    }
}

// --- PDF-Vorlagen über die API ----------------------------------------------
const pdfList = await page.request.get(`${BASE}/api/v1/pdf`);
check(
    "PDF-Liste ohne Token abgewiesen",
    pdfList.status() === 401 || pdfList.status() === 403,
    `Status ${pdfList.status()}`
);

const openapi = await page.request.get(`${BASE}/api/v1/openapi.json`);
const spec = openapi.ok() ? await openapi.json() : {};
check("OpenAPI kennt die PDF-Wege", Boolean(spec?.paths?.["/pdf/{template}"]));

// --- Kalender ohne Token ----------------------------------------------------
const calendar = await page.request.get(`${BASE}/intern/termine/kalender.ics?token=falsch`);
check("Kalender weist ein falsches Token ab", calendar.status() === 401, `Status ${calendar.status()}`);

console.log("\n--- Ergebnis ---");
for (const entry of results) {
    console.log(`${entry.ok ? "OK  " : "FEHL"} ${entry.label}${entry.ok ? "" : ` — ${entry.detail}`}`);
}

if (problems.length > 0) {
    console.log("\n--- Fehler im Browser ---");
    for (const problem of [...new Set(problems)].slice(0, 20)) console.log(problem);
}

await browser.close();

const failed = results.filter((entry) => !entry.ok).length;
console.log(`\n${results.length - failed} von ${results.length} bestanden.`);
process.exit(failed > 0 || problems.length > 0 ? 1 : 0);
