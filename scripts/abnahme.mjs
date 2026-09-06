import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

/**
 * Abnahme der neuen Funktionen im Browser.
 *
 * Ergaenzt scripts/smoke.mjs: das dort geprueft, ob jede Seite laedt, hier
 * wird geprueft, ob die neuen Ablaeufe wirklich bis zur Datenbank
 * durchlaufen -- Abmelden von der Fehlerseite, SMTP-Verbindung, Zugang
 * anlegen, Mehrfachauswahl samt Ausfuhr der Einladungslinks, Dateimanager.
 *
 * Setzt einen bereits eingerichteten Stamm voraus; scripts/smoke.mjs legt ihn
 * an. NIEMALS gegen die Arbeitsdatenbank -- der Lauf legt Zugaenge an und
 * entzieht zwischendurch Rechte.
 *
 *   SMOKE_DB_CONTAINER=pg-smoke node scripts/abnahme.mjs http://localhost:5178 ./abnahme
 *
 * Zwei Eigenheiten, die beim ersten Versuch Zeit gekostet haben und deshalb
 * hier festgehalten sind:
 *
 *   1. Die Formulare laufen ueber `use:enhance`. Es gibt also keine
 *      vollstaendige Navigation, auf die `networkidle` warten koennte -- der
 *      Zustand wechselt erst nach der Antwort im Browser. Gewartet wird
 *      deshalb auf die Adresse oder auf einen Inhalt, nie auf das Netz.
 *   2. `resolveGrants()` haelt die aufgeloesten Rechte 60 Sekunden vor und
 *      verwirft den Zwischenspeicher nur prozessintern. Wer Rechte per SQL
 *      aendert, sieht die Wirkung erst nach Ablauf. Der Rechteentzug steht
 *      darum zuletzt und wartet ausdruecklich ab.
 */

const BASE = process.argv[2] ?? "http://localhost:5178";
const OUT = process.argv[3] ?? "./abnahme";
const DB = process.env.SMOKE_DB_CONTAINER ?? "pg-smoke";
mkdirSync(OUT, { recursive: true });

const EMAIL = "admin@example.org";
const PASSWORD = "Sehr-Sicheres-Passwort-2026";
const NEUE_ADRESSE = `neu-${Date.now()}@example.org`;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await context.newPage();

const problems = [];
page.on("pageerror", (err) => problems.push(`pageerror: ${err}`));
page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(`console: ${msg.text()}`);
});

const results = [];
function check(label, ok, detail = "") {
    results.push({ label, ok: Boolean(ok), detail });
}

function sql(statement) {
    return execFileSync(
        "docker",
        ["exec", DB, "psql", "-U", "intern", "-d", "intern", "-tAc", statement],
        { encoding: "utf8" }
    ).trim();
}

/** Ein gescheiterter Abschnitt darf den Rest der Abnahme nicht verschlucken. */
async function abschnitt(name, fn) {
    console.log(`... ${name}`);
    try {
        await fn();
    } catch (err) {
        check(name, false, String(err).split("\n")[0].slice(0, 160));
    }
}

async function text() {
    return (await page.textContent("body")) ?? "";
}

/**
 * Zaehlt Nachrichten an eine Adresse im Wegwerf-Postfach.
 *
 * Gibt `null` zurueck, wenn kein Mailpit laeuft -- dann wird die Pruefung
 * uebersprungen statt einen Fehler zu melden, den es nicht gibt:
 *
 *   docker run -d --name mail -p 1025:1025 -p 8025:8025 axllent/mailpit
 */
async function mailpitSuche(adresse) {
    const basis = process.env.MAILPIT_URL ?? "http://localhost:8025";
    try {
        const res = await fetch(`${basis}/api/v1/search?query=${encodeURIComponent("to:" + adresse)}`);
        if (!res.ok) return null;
        const daten = await res.json();
        return Number(daten.messages_count ?? daten.total ?? (daten.messages ?? []).length);
    } catch {
        return null;
    }
}

async function login() {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
    await page.waitForLoadState("networkidle");
}

/*
 * Vor dem ersten Aufruf abwarten, bis der Adminbereich wirklich offen ist.
 *
 * Der letzte Abschnitt dieses Skripts entzieht der Rolle ihre Rechte. Setzt
 * ein Folgelauf sie zwar sofort zurueck, haelt der Zwischenspeicher in
 * permissionService den alten Stand trotzdem bis zu 60 Sekunden -- der
 * Adminbereich antwortete dann mit 403, waehrend spaetere Abschnitte schon
 * wieder durchliefen. Das sah nach einem Fehler in der Rechtepruefung aus und
 * war doch nur die Reihenfolge.
 *
 * Deshalb wird nicht der Datenbankstand geraten, sondern die Erreichbarkeit
 * geprueft: im Normalfall kostet das einen Versuch.
 */
sql("update roles set permissions = '{*}' where key = 'admin'");
await login();

for (let versuch = 1; versuch <= 18; versuch++) {
    const res = await page.goto(`${BASE}/intern/admin`, { waitUntil: "networkidle" });
    if (res?.status() === 200) break;
    if (versuch === 1) console.log("Adminbereich noch gesperrt -- warte auf den Rechte-Zwischenspeicher ...");
    if (versuch === 18) console.log("Adminbereich bleibt gesperrt; der Lauf geht trotzdem weiter.");
    await new Promise((r) => setTimeout(r, 5_000));
}

await abschnitt("Anmeldung", async () => {
    check("Anmeldung", page.url().includes("/intern"), page.url());
});

await abschnitt("Neue Adminseiten", async () => {
    for (const [pfad, muster] of [
        ["/intern/admin/email", /SMTP|E-Mail/i],
        ["/intern/admin/datenbank", /Datenbank|PostgreSQL/i]
    ]) {
        const res = await page.goto(`${BASE}${pfad}`, { waitUntil: "networkidle" });
        check(`${pfad} (${res?.status()})`, res?.status() === 200 && muster.test(await text()));
        // Fuehrenden Schraegstrich erst entfernen, sonst faellt das Bild
        // neben den Ausgabeordner statt hinein.
        const name = pfad.replace(/^\//, "").replace(/\//g, "-");
        await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    }

    // Das Passwort darf auch dann nicht in der Seite stehen, wenn eines gilt.
    await page.goto(`${BASE}/intern/admin/datenbank`, { waitUntil: "networkidle" });
    const quelle = await page.content();
    check("Datenbankseite zeigt kein Passwort", !quelle.includes("intern:intern"));
});

await abschnitt("SMTP-Verbindungstest", async () => {
    await page.goto(`${BASE}/intern/admin/email`, { waitUntil: "networkidle" });
    check("SMTP stammt aus der Umgebung und ist gesperrt", /Umgebungsvariablen/i.test(await text()));

    const knopf = page.locator('form[action="?/test"] button[type="submit"]').first();
    if ((await knopf.count()) === 0) {
        check("Schaltflaeche Verbindung testen vorhanden", false);
        return;
    }

    /*
     * Dieses Formular laeuft OHNE use:enhance -- der Klick loest also eine
     * vollstaendige Navigation aus. Ein waitForSelector, das vorher startet,
     * wartet auf ein Dokument, das gerade ersetzt wird, und laeuft in den
     * Zeitablauf. Deshalb erst die Navigation abwarten, dann lesen.
     */
    await Promise.all([
        page.waitForURL(/\?\/test/, { timeout: 30_000 }).catch(() => null),
        knopf.click()
    ]);
    await page.waitForLoadState("networkidle");
    const meldung = (await page.locator('[role="status"], [role="alert"]').allTextContents()).join(" ");
    check("SMTP-Verbindungstest erfolgreich", /erfolgreich|steht|funktioniert/i.test(meldung), meldung.slice(0, 160));
    await page.screenshot({ path: `${OUT}/smtp-test.png`, fullPage: true });

    const mailKnopf = page.locator('form[action="?/testmail"] button[type="submit"]').first();
    if ((await mailKnopf.count()) > 0) {
        const feld = page.locator('input[name="to"]').first();
        if ((await feld.count()) > 0) await feld.fill("abnahme@example.org");
        await Promise.all([
            page.waitForURL(/\?\/testmail/, { timeout: 30_000 }).catch(() => null),
            mailKnopf.click()
        ]);
        await page.waitForLoadState("networkidle");
        const m = (await page.locator('[role="status"], [role="alert"]').allTextContents()).join(" ");
        check("Testnachricht angenommen", /uebergeben|übergeben|versendet|verschickt/i.test(m), m.slice(0, 160));

        // Der eigentliche Nachweis: liegt sie im Posteingang? Ohne Mailpit
        // wird diese Pruefung uebersprungen statt falsch zu melden.
        const eingang = await mailpitSuche("abnahme@example.org");
        if (eingang !== null) {
            check("Testnachricht ist im Posteingang angekommen", eingang > 0, `${eingang} gefunden`);
        }
    }
});

await abschnitt("Zugang anlegen", async () => {
    await page.goto(`${BASE}/intern/admin/user/create`, { waitUntil: "networkidle" });
    await page.fill('input[name="name"]', "Neuer Zugang");
    await page.fill('input[name="email"]', NEUE_ADRESSE);
    await page.click('form[action="?/createUser"] button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.endsWith("/create"), { timeout: 20_000 });
    await page.waitForLoadState("networkidle");

    const meldung = (await page.locator('[role="status"], [role="alert"]').allTextContents()).join(" ");
    check("Anlegen gibt eine sichtbare Rueckmeldung", meldung.trim().length > 0, meldung.slice(0, 200));
    check(
        "Zugang steht in der Datenbank",
        sql(`select count(*) from users where email='${NEUE_ADRESSE}'`) === "1"
    );
    await page.screenshot({ path: `${OUT}/zugang-angelegt.png`, fullPage: true });

    await page.goto(`${BASE}/intern/admin/user`, { waitUntil: "networkidle" });
    check("Zugang erscheint sofort in der Liste", (await text()).includes(NEUE_ADRESSE));

    // Der Ablauf endet nicht in der Datenbank: ohne zugestellte Einladung
    // kann sich der neue Zugang nie anmelden.
    const eingang = await mailpitSuche(NEUE_ADRESSE);
    if (eingang !== null) {
        check("Einladung wurde tatsaechlich versendet", eingang > 0, `${eingang} gefunden`);
    }
});

await abschnitt("Zugang: doppelte und ungueltige Adresse", async () => {
    await page.goto(`${BASE}/intern/admin/user/create`, { waitUntil: "networkidle" });
    await page.fill('input[name="name"]', "Doppelt");
    await page.fill('input[name="email"]', NEUE_ADRESSE);
    await page.click('form[action="?/createUser"] button[type="submit"]');
    await page.waitForSelector('[role="alert"]', { timeout: 20_000 });
    check("Doppelte Adresse wird verstaendlich abgewiesen", /existiert bereits/i.test(await text()));

    await page.goto(`${BASE}/intern/admin/user/create`, { waitUntil: "networkidle" });
    await page.fill('input[name="name"]', "Ungueltig");
    await page.fill('input[name="email"]', "keine-adresse");
    await page.click('form[action="?/createUser"] button[type="submit"]');
    await page.waitForTimeout(2500);
    check("Ungueltige Adresse fuehrt nicht zu einem Zugang", page.url().includes("/create"), page.url());
});

await abschnitt("Mitglieder: Mehrfachauswahl", async () => {
    await page.goto(`${BASE}/intern/members`, { waitUntil: "networkidle" });
    const boxen = page.locator('table input[type="checkbox"]');
    const anzahl = await boxen.count();
    check("Mitgliedertabelle hat Auswahlkaestchen", anzahl > 1, `${anzahl} gefunden`);
    if (anzahl < 2) return;

    await boxen.nth(1).check();
    if (anzahl > 2) await boxen.nth(2).check();
    await page.waitForTimeout(500);
    check("Bulk-Leiste erscheint", /ausgewählt|Auswahl aufheben/i.test(await text()));
    await page.screenshot({ path: `${OUT}/mitglieder-auswahl.png`, fullPage: true });

    const warten = page.waitForEvent("download", { timeout: 20_000 }).catch(() => null);
    const knopf = page.locator('button:has-text("Einladungslinks")').first();
    if ((await knopf.count()) === 0) {
        check("Schaltflaeche Einladungslinks vorhanden", false);
        return;
    }
    await knopf.click();
    const datei = await warten;
    if (!datei) {
        check("Einladungslinks heruntergeladen", false, "kein Download ausgeloest");
        return;
    }

    /*
     * Playwright legt den Download zuerst in seinem eigenen Verzeichnis ab.
     * `saveAs` in den Projektordner scheiterte unter Windows wiederholt mit
     * EPERM -- gelesen wird deshalb der Pfad, den Playwright selbst nennt,
     * und die Kopie ist nur noch fuer den Menschen da.
     */
    const quelle = await datei.path();
    const inhaltRoh = readFileSync(quelle, "utf8");
    const ziel = `${OUT}/${datei.suggestedFilename()}`;
    try {
        writeFileSync(ziel, inhaltRoh, "utf8");
    } catch {
        // Nur die Ablage der Kopie; die Pruefung unten laeuft trotzdem.
    }
    const inhalt = inhaltRoh;
    check("Einladungslinks heruntergeladen", true, datei.suggestedFilename());
    check("Dateiname traegt das Datum", /einladungslinks-\d{4}-\d{2}-\d{2}\./.test(datei.suggestedFilename()));
    check("CSV beginnt mit einer BOM", inhalt.charCodeAt(0) === 0xfeff);
    check("CSV nennt die Spalte invitation_link", /invitation_link/.test(inhalt));
    check("CSV benutzt Semikolon", inhalt.split("\n")[0].includes(";"));
    check("CSV enthaelt einen Beitrittslink", /\/join\//.test(inhalt));
    writeFileSync(`${OUT}/einladungslinks-auszug.txt`, inhalt.split("\n").slice(0, 4).join("\n"), "utf8");
});

await abschnitt("Dateimanager", async () => {
    const res = await page.goto(`${BASE}/intern/dateien`, { waitUntil: "networkidle" });
    check(`/intern/dateien (${res?.status()})`, res?.status() === 200);
    check("Ablageflaeche fuer Drag & Drop vorhanden", /ziehen|ablegen|Dateien hier/i.test(await text()));

    /*
     * Ein eigener Ordner, damit der Lauf nichts Vorhandenes anfasst.
     *
     * Das Formular liegt in einem Modal und existiert im DOM erst, wenn der
     * Dialog offen ist -- ein direktes requestSubmit() auf die Kennung ging
     * deshalb ins Leere.
     */
    const ordner = `Abnahme ${Date.now()}`;
    await page.click('button:has-text("Neuer Ordner"), button:has-text("Ersten Ordner anlegen")');
    await page.waitForSelector("#ordner-anlegen", { timeout: 10_000 });
    await page.fill('#ordner-anlegen input[name="name"]', ordner);
    // Der Absenden-Knopf steht in der Fusszeile des Dialogs, nicht im
    // Formular -- er ruft submitForm("ordner-anlegen") auf.
    await page.click('[role="dialog"] button:has-text("Anlegen")');
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    check("Ordner angelegt", (await text()).includes(ordner));

    const ordnerId = sql(`select id from folders where name='${ordner}' limit 1`);
    check("Ordner steht in der Datenbank", /^[0-9a-f-]{36}$/.test(ordnerId), ordnerId.slice(0, 40));
    if (!ordnerId) return;

    await page.goto(`${BASE}/intern/dateien?ordner=${ordnerId}`, { waitUntil: "networkidle" });

    /*
     * Vier Dateien, jede fuer einen Zweck:
     *  - klein.txt und notiz.md fuer die Vorschau,
     *  - bild.png fuer die Signaturpruefung (echter PNG-Kopf),
     *  - gross.txt mit 1 MB fuer die eigentliche Regression: ohne
     *    BODY_SIZE_LIMIT kappt adapter-node bei 512K, und genau dieser Upload
     *    scheiterte in Produktion mit 413.
     */
    const png = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.alloc(64, 7)
    ]);
    const dateien = [
        { name: "klein.txt", mimeType: "text/plain", buffer: Buffer.from("Hallo aus der Abnahme.\nZweite Zeile.\n", "utf8") },
        { name: "notiz.md", mimeType: "text/markdown", buffer: Buffer.from("# Überschrift\n\nText mit **fett**.\n", "utf8") },
        { name: "bild.png", mimeType: "image/png", buffer: png },
        { name: "gross.txt", mimeType: "text/plain", buffer: Buffer.alloc(1024 * 1024, 0x61) }
    ];

    await page.setInputFiles('input[type="file"]:not([webkitdirectory])', dateien);
    await page.waitForTimeout(6000);
    await page.reload({ waitUntil: "networkidle" });

    const nachUpload = await text();
    for (const d of dateien) {
        check(`Upload sichtbar: ${d.name}`, nachUpload.includes(d.name));
    }
    check(
        "Datei ueber 512 KB angekommen (BODY_SIZE_LIMIT)",
        Number(sql(`select coalesce(max(f.size),0) from documents d join files f on f.id=d.file_id where d.folder_id='${ordnerId}'`)) > 512 * 1024
    );
    await page.screenshot({ path: `${OUT}/dateien-hochgeladen.png`, fullPage: true });

    // Vorschau je Dateiart.
    for (const [name, muster] of [
        ["klein.txt", /Hallo aus der Abnahme/],
        ["notiz.md", /Überschrift/]
    ]) {
        const id = sql(
            `select d.id from documents d join files f on f.id=d.file_id where d.folder_id='${ordnerId}' and f.filename='${name}' limit 1`
        );
        if (!id) {
            check(`Vorschau ${name}`, false, "Dokument nicht gefunden");
            continue;
        }
        const r = await page.goto(`${BASE}/intern/dateien/${id}/vorschau`, { waitUntil: "networkidle" });
        check(`Vorschau ${name} (${r?.status()})`, r?.status() === 200 && muster.test(await text()));
        await page.screenshot({ path: `${OUT}/vorschau-${name}.png`, fullPage: true });
    }

    // Markdown darf kein rohes HTML durchreichen.
    const mdId = sql(
        `select d.id from documents d join files f on f.id=d.file_id where d.folder_id='${ordnerId}' and f.filename='notiz.md' limit 1`
    );
    if (mdId) {
        await page.goto(`${BASE}/intern/dateien/${mdId}/vorschau`, { waitUntil: "networkidle" });
        const html = await page.content();
        check("Markdown wird gerendert, nicht roh gezeigt", html.includes("<h1") || html.includes("<strong"));
    }

    // Aufraeumen: der Ordner loescht seine Dokumente mit.
    sql(`delete from folders where id='${ordnerId}'`);
});

/*
 * Zuletzt: Rechte entziehen und pruefen, dass man aus der Fehlerseite
 * herausfindet. Danach ist die Anmeldung des Laufs verbraucht.
 */
await abschnitt("Fehlerseite mit Abmelden", async () => {
    /*
     * try/finally ist hier Pflicht, nicht Kosmetik: bricht der Abschnitt
     * zwischendrin ab, bliebe die Rolle ohne Rechte zurueck und JEDER
     * folgende Lauf scheiterte an lauter 403ern -- mit einer Ursache, die
     * nach einem Fehler in der Anwendung aussieht. Genau das ist beim ersten
     * Versuch passiert.
     */
    try {
        await pruefeFehlerseite();
    } finally {
        sql("update roles set permissions = '{*}' where key = 'admin'");
    }
});

async function pruefeFehlerseite() {
    sql("update roles set permissions = '{}' where key = 'admin'");
    console.log("    warte 65 s auf den Ablauf des Rechte-Zwischenspeichers ...");
    await new Promise((r) => setTimeout(r, 65_000));

    await page.goto(`${BASE}/intern/dashboard`, { waitUntil: "networkidle" });
    check("Fehlende Rechte fuehren zu 403 statt in eine Schleife", /Kein Zugriff|403/i.test(await text()), page.url());

    // Vor dem Abmelden zaehlen: aus frueheren Laeufen koennen weitere offene
    // Sitzungen stammen, die revokeSession zu Recht nicht anfasst. Geprueft
    // wird deshalb die Abnahme um genau eine, nicht der Absolutwert.
    const offeneVorher = Number(sql("select count(*) from sessions where revoked_at is null"));

    const abmelden = page.locator('form[action="/logout"] button');
    check("Abmelden ist auf der Fehlerseite sichtbar", (await abmelden.count()) > 0);
    await page.screenshot({ path: `${OUT}/fehlerseite-403.png`, fullPage: true });

    if ((await abmelden.count()) > 0) {
        await abmelden.first().click();
        await page.waitForURL(/\/login/, { timeout: 20_000 });
        check("Abmelden fuehrt zur Anmeldeseite", page.url().includes("/login"), page.url());
        const cookies = await context.cookies();
        check("Sitzungscookie ist entfernt", !cookies.some((c) => c.name === "ep_session"));
        const offeneNachher = Number(sql("select count(*) from sessions where revoked_at is null"));
        check(
            "Sitzung ist auch in der Datenbank beendet",
            offeneNachher === offeneVorher - 1,
            `vorher ${offeneVorher}, nachher ${offeneNachher}`
        );
    }
}


console.log("\n--- Ergebnis ---");
for (const r of results) {
    console.log(`${r.ok ? "OK  " : "FEHL"} ${r.label}${r.detail && !r.ok ? `  [${r.detail}]` : ""}`);
}
const ok = results.filter((r) => r.ok).length;
console.log(`\n${ok} von ${results.length} bestanden.`);

if (problems.length > 0) {
    console.log("\n--- Browserkonsole ---");
    for (const p of [...new Set(problems)].slice(0, 20)) console.log(p);
}

await browser.close();
process.exit(ok === results.length ? 0 : 1);
