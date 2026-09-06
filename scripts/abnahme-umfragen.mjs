import { chromium } from "playwright";
import { execFileSync } from "node:child_process";

/**
 * Abnahme der Umfrage-Aenderungen im Browser.
 *
 * Zwei Dinge stehen im Mittelpunkt:
 *   1. Der behobene 404 beim Absenden -- an genau dem Fall, der ihn ausloeste:
 *      eine Umfrage, die nur an eine FREMDE Rolle freigegeben ist.
 *   2. Der oeffentliche Link -- in einem Fenster OHNE Sitzung.
 *
 * NIEMALS gegen die Arbeitsdatenbank -- der Lauf richtet einen Stamm ein, und
 * /setup ist danach dauerhaft gesperrt. Aufsetzen wie bei scripts/smoke.mjs:
 *
 *   docker run -d --name pg-smoke -p 5433:5432 -e POSTGRES_USER=intern  *     -e POSTGRES_PASSWORD=intern -e POSTGRES_DB=intern postgres:17-alpine
 *   DATABASE_URL=postgres://intern:intern@localhost:5433/intern npm run db:migrate
 *   npm run build
 *   DATABASE_URL=... SESSION_SECRET=... APP_ENC_KEY=... ORIGIN=http://127.0.0.1:5178  *     npm run preview -- --port 5178 --host 127.0.0.1
 *
 *   SMOKE_DB_CONTAINER=pg-smoke node scripts/abnahme-umfragen.mjs http://127.0.0.1:5178
 *
 * Der Lauf wartet einmal 62 Sekunden: `resolveGrants` haelt die aufgeloesten
 * Rechte 60 Sekunden vor, und der Zwei-Faktor-Zwang wird per SQL entfernt.
 */

const BASE = process.argv[2] ?? "http://127.0.0.1:5178";
const DB = process.env.SMOKE_DB_CONTAINER ?? "pg-smoke";

const results = [];
const check = (name, ok, detail = "") => {
    results.push(`${ok ? "OK  " : "FEHL"} ${name}${ok ? "" : " — " + detail}`);
    return ok;
};
/**
 * Eine Abfrage gegen die Wegwerf-Datenbank.
 *
 * `psql -tAc` haengt bei `INSERT ... RETURNING` die Statuszeile ("INSERT 0 1")
 * an das Ergebnis. Genommen wird deshalb nur die ERSTE Zeile -- sonst landet
 * sie in der Kennung und PostgreSQL weist sie beim naechsten Mal als
 * ungueltige UUID ab.
 */
const sql = (q) =>
    execFileSync("docker", ["exec", DB, "psql", "-U", "intern", "-d", "intern", "-tAc", q])
        .toString()
        .trim()
        .split("\n")[0]
        .trim();

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

// --- Einrichtung ------------------------------------------------------------
await page.goto(`${BASE}/setup`, { waitUntil: "networkidle" });
await page.fill('input[name="organizationName"]', "Stamm Abnahme");
await page.fill('input[name="city"]', "Musterstadt");
await page.fill('input[name="name"]', "Test Admin");
await page.fill('input[name="email"]', "admin@example.org");
await page.fill('input[name="password"]', "Sehr-Sicheres-Passwort-2026");
await page.fill('input[name="passwordRepeat"]', "Sehr-Sicheres-Passwort-2026");
const demo = page.locator('input[name="demoData"]');
if (await demo.count()) await demo.check();
await page.click('button[type="submit"]');
// Kontenrahmen, Geschaeftsjahr und Demodaten brauchen spuerbar Zeit.
await page.waitForURL(/\/intern/, { timeout: 90000 });
check("Einrichtung durchgelaufen", true);

// Zwei-Faktor abschalten, sonst leitet jeder /intern-Aufruf um.
execFileSync("docker", [
    "exec", DB, "psql", "-U", "intern", "-d", "intern", "-c",
    "update roles set require_mfa = false"
]);
await ctx.clearCookies();
await page.waitForTimeout(62_000); // Rechte-Cache
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', "admin@example.org");
await page.fill('input[name="password"]', "Sehr-Sicheres-Passwort-2026");
await page.click('button[type="submit"]');
await page.waitForURL(/\/intern/, { timeout: 30000 });

// --- 1. Der Assistent -------------------------------------------------------
await page.goto(`${BASE}/intern/umfragen/neu`, { waitUntil: "networkidle" });
check("Assistent erreichbar", page.url().includes("/umfragen/neu"));

const body = await page.locator("body").innerText();
check("Schritt 1 zeigt die Eckdaten", body.includes("Titel"));

// --- 2. Der behobene 404 ----------------------------------------------------
/*
 * Genau der Fall aus dem Fehlerbericht: die Umfrage ist NUR an eine Rolle
 * freigegeben, die der angemeldete Zugang nicht traegt. Sichtbar ist sie
 * trotzdem -- kraft Verwaltungsrecht. Frueher endete das Absenden in 404.
 */
const surveyId = sql(
    "insert into surveys (title, status, audience) values ('Abnahme 404', 'published', 'user') returning id"
);
const fieldId = sql(
    `insert into survey_fields (survey_id, position, type, label, required)
     values ('${surveyId}', 0, 'text', 'Wie heisst du?', false) returning id`
);
const roleId = sql("select id from roles where key = 'mitglied'");
sql(
    `insert into survey_shares (survey_id, target_kind, target_id)
     values ('${surveyId}', 'role', '${roleId}')`
);

await page.goto(`${BASE}/intern/umfragen/${surveyId}`, { waitUntil: "networkidle" });
check("Umfrage trotz fremder Rolle sichtbar", page.url().includes(surveyId));

const formCount = await page.locator('form[action*="respond"]').count();
check("Antwortformular wird angeboten", formCount > 0);

if (formCount > 0) {
    await page.fill(`[name="f_${fieldId}"]`, "Abnahme");
    await page.locator('form[action*="respond"]').first().evaluate((f) => f.requestSubmit());
    await page.waitForTimeout(2500);

    const after = await page.locator("body").innerText();
    check(
        "Absenden endet NICHT in 404",
        !after.includes("Diese Seite gibt es nicht") && !after.includes("nicht gefunden"),
        after.slice(0, 160)
    );
    const stored = sql(`select count(*) from survey_responses where survey_id = '${surveyId}'`);
    check("Antwort ist gespeichert", stored === "1", `es sind ${stored}`);
}

// --- 3. Externer Link -------------------------------------------------------
await page.goto(`${BASE}/intern/umfragen/${surveyId}`, { waitUntil: "networkidle" });
const issue = page.locator('form[action*="issueLink"]').first();
check("Karte für die externe Freigabe vorhanden", (await issue.count()) > 0);

let token = null;
if (await issue.count()) {
    await issue.evaluate((f) => f.requestSubmit());
    await page.waitForTimeout(2500);
    const shown = await page.locator("body").innerText();
    const match = shown.match(/\/umfrage\/([A-Za-z0-9_-]{20,})/);
    token = match?.[1] ?? null;
    check("Link wird genau einmal angezeigt", Boolean(token), shown.slice(0, 200));

    // Der Abdruck in der Datenbank darf NICHT das Token sein.
    const hash = sql(`select public_token_hash from surveys where id = '${surveyId}'`);
    check("Datenbank speichert nur den Abdruck", Boolean(hash) && hash !== token);

    // Beim Neuladen darf das Token NICHT wieder auftauchen.
    await page.reload({ waitUntil: "networkidle" });
    const again = await page.locator("body").innerText();
    check("Nach dem Neuladen ist das Token weg", !again.includes(token ?? "###"));
}

// --- 4. Antworten OHNE Anmeldung -------------------------------------------
if (token) {
    const anon = await browser.newContext({ viewport: { width: 900, height: 900 } });
    const guest = await anon.newPage();

    const res = await guest.goto(`${BASE}/umfrage/${token}`, { waitUntil: "networkidle" });
    check("Öffentliche Seite ohne Anmeldung erreichbar", res?.status() === 200, `Status ${res?.status()}`);

    const guestBody = await guest.locator("body").innerText();
    check("Fragebogen wird gezeigt", guestBody.includes("Wie heisst du?"));
    check("Keine interne Navigation sichtbar", !guestBody.includes("Adminbereich"));

    await guest.fill(`[name="f_${fieldId}"]`, "Gast von aussen");
    const nameField = guest.locator('[name="publicName"]');
    if (await nameField.count()) await nameField.fill("Anna Gast");

    await guest.locator("form").first().evaluate((f) => f.requestSubmit());
    await guest.waitForURL(/\/danke/, { timeout: 20000 }).catch(() => {});
    check("Weiterleitung auf die Danke-Seite", guest.url().includes("/danke"), guest.url());

    const stored = sql(
        `select count(*) from survey_responses where survey_id = '${surveyId}' and source = 'link'`
    );
    check("Antwort mit Herkunft „link“ gespeichert", stored === "1", `es sind ${stored}`);

    const name = sql(
        `select public_name from survey_responses where survey_id = '${surveyId}' and source = 'link'`
    );
    check("Selbst angegebener Name gespeichert", name === "Anna Gast", `steht: ${name}`);

    // --- 5. Widerrufen ------------------------------------------------------
    await page.goto(`${BASE}/intern/umfragen/${surveyId}`, { waitUntil: "networkidle" });
    const revoke = page.locator('form[action*="revokeLink"]').first();
    if (await revoke.count()) {
        await revoke.evaluate((f) => f.requestSubmit());
        await page.waitForTimeout(2000);
        const dead = await guest.goto(`${BASE}/umfrage/${token}`, { waitUntil: "networkidle" });
        check("Widerrufener Link liefert 404", dead?.status() === 404, `Status ${dead?.status()}`);
    } else {
        check("Widerrufen angeboten", false, "kein revokeLink-Formular");
    }

    await anon.close();
}

// --- 6. Auswertung ----------------------------------------------------------
await page.goto(`${BASE}/intern/umfragen/${surveyId}/auswertung`, { waitUntil: "networkidle" });
const auswertung = await page.locator("body").innerText();
check("Auswertung erreichbar", auswertung.includes("Wie heisst du?"));
check("Herkunft wird ausgewiesen", /Link|extern/i.test(auswertung));

console.log("\n--- Abnahme Umfragen ---");
for (const line of results) console.log(line);
console.log(`\n${results.filter((r) => r.startsWith("OK")).length} von ${results.length} bestanden.`);
if (pageErrors.length) console.log("Seitenfehler:", pageErrors.slice(0, 5));

await browser.close();
