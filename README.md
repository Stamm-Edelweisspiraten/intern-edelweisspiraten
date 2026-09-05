# Internes Portal für Pfadfinderstämme

Verwaltungsportal für einen Pfadfinderstamm: Mitglieder, Gruppen, Ämter,
Kasse mit doppelter Buchführung, Kämmerer und interne Kommunikation. Dazu eine
REST-API, über die Fremdsysteme auf dieselben Daten zugreifen.

Die Anwendung ist **nicht auf einen bestimmten Stamm zugeschnitten**. Name,
Logo und Kontaktdaten werden beim ersten Start eingerichtet; jeder Stamm
betreibt seine eigene Installation.

SvelteKit 2 · Svelte 5 · TypeScript · PostgreSQL mit Drizzle · Tailwind CSS 4 ·
adapter-node

---

## Funktionsumfang

**Anmeldung und Zugänge**
Eigene Anmeldung mit E-Mail und Passwort (Argon2id), server-seitige Sitzungen
mit Geräteliste und „überall abmelden“, Zwei-Faktor-Authentifizierung per
Authenticator-App samt Wiederherstellungscodes, Passwort-Zurücksetzen per
E-Mail, Schutz gegen automatisiertes Durchprobieren, Rollen und
Berechtigungen, Ansicht als anderer Benutzer.

**Mitglieder**
Anlegen, Bearbeiten, Suchen und Filtern, Mehrfach-E-Mail und -Telefon,
Einwilligungen und Unterlagen als Datei, Änderungsprotokoll,
Einladungsschreiben als PDF mit QR-Code, Selbstregistrierung über einen
Einladungscode.

**Gruppen, Ämter und Rechte**
Übersicht und Details, Mitgliederliste als PDF. Rollen werden **je Gruppe**
vergeben: dieselbe Rolle „Gruppenleitung“ kann einmal für die Meute und einmal
für die Sippe gelten, und wer sie für die Meute hat, sieht auch nur deren
Mitglieder. Ämter tragen selbst eine Rolle — wer das Amt innehat, bekommt
deren Rechte, bei einem Amt mit Gruppenbezug nur dort. Jede Gruppenseite im
Adminbereich zeigt, wer hier welche Rechte hat.

**Kasse (doppelte Buchführung)**
Mitgelieferter Vereins-Kontenrahmen (an SKR49 angelehnt) mit ideellem Bereich,
Vermögensverwaltung, Zweckbetrieb und wirtschaftlichem Geschäftsbetrieb.
Buchungsjournal mit Belegnummern, einfache Erfassungsmaske und Expertenmaske
für freie Buchungssätze, Storno statt Löschen, mehrere Kassen- und Bankkonten,
Kontoauszug-Import mit Abgleich, Forderungen und Eingangsrechnungen mit
Teilzahlungen, wiederkehrende Buchungen, Geschäftsjahre mit Beitragssätzen und
Jahresabschluss, Berichte (GuV, Vermögensübersicht, Summen- und Saldenliste,
Monatsübersicht, Kassenbericht, Kontenblatt, Fälligkeitsstaffel) als Ansicht,
CSV und PDF, Beitragsbescheid, Änderungsprotokoll. Zu jeder Auswertung ein
Diagramm **neben** der Tabelle — nie statt ihr: ohne JavaScript und für einen
Screenreader bleiben die Zahlen vollständig lesbar.

**Termine**
Liste und Monatsraster, Rückmeldung je verknüpftem Mitglied (Zusage, Absage,
Vielleicht) mit optionaler Frist, Teilnehmerliste mit Zählern und als PDF zum
Abhaken, Absagen bleiben sichtbar. Freigabe an Gruppen, Ämter, Rollen oder
einzelne Personen; ohne Freigabe gilt ein Termin für alle. Kalenderabonnement
(iCal) über eine persönliche, jederzeit widerrufbare Adresse — ein
Kalenderprogramm kann sich nicht anmelden.

**Dateien**
Ordner mit Unterordnern, freigegeben an Gruppen, Ämter, Rollen oder einzelne
Personen; Unterordner erben die Freigaben ihres Elternordners. Schreibrecht je
Freigabe. Wahlweise Ablage im **Objektspeicher** statt in der Datenbank —
einrichtbar im Adminbereich, mit Verbindungstest und einem wiederholbaren
Umzug der vorhandenen Dateien per Knopfdruck. **Garage** liegt samt
Bedienoberfläche bei und ist mit einem Befehl eingerichtet; jeder andere
S3-kompatible Anbieter geht genauso.

**Kämmerer**
Artikel mit Größen und Preisen, Lagerbestand mit Zu- und Abgängen sowie
Inventurkorrektur und Bewegungsprotokoll, Nachbestellliste anhand von
Mindestbeständen, Selbstbedienungs-Bestellungen und Bestellverwaltung,
Lieferverfolgung je Position, Storno mit Rückbuchung, automatische Abrechnung
über die Kasse.

**REST-API**
`/api/v1` für Mitglieder, Gruppen, Kasse und Kämmerer. Zugang über API-Tokens
mit Berechtigungsumfang, Fehler als Problem Details nach RFC 9457,
Schnittstellenbeschreibung nach OpenAPI 3.1 unter `/api/v1/openapi.json`.

Dazu eine zentrale Stelle für **PDFs**: `GET /api/v1/pdf` listet die acht
Vorlagen samt benötigtem Recht und JSON Schema ihrer Eingabe,
`POST /api/v1/pdf/{vorlage}` erzeugt das Dokument. Dieselbe Vorlagenliste
bedient auch die Adressen unter `/intern` — Kopfzeile, Fußzeile mit
Seitenzahl und die Tabellen mit Seitenumbruch stehen an einer Stelle.

**Weiteres**
E-Mail-Versand an Gruppen oder ausgewählte Mitglieder mit formatiertem Text
und Anhängen, heller und dunkler Darstellungsmodus, durchgängig responsiv.

---

## Einrichtung

```bash
cp .env.example .env      # anschließend ausfüllen
docker compose up -d      # Datenbank und Objektspeicher
npm install
npm run db:migrate
npm run storage:setup     # optional, siehe unten
npm run dev
```

Danach **`/setup`** aufrufen. Der Assistent richtet in einem Durchgang ein:

1. **Organisation** – Name, Kurzform und Ort des Stamms.
2. **Zugang** – der erste Zugang mit Administrationsrechten.
3. **Kasse** – Kontenrahmen, erstes Geschäftsjahr mit Beitragssätzen und
   erstes Konto.
4. **Demodaten** – wahlweise ein Beispielbestand zum Ausprobieren.

`/setup` ist nur erreichbar, solange kein anmeldefähiger Zugang existiert;
danach antwortet die Route dauerhaft mit 404.

Die Administrationsrolle verlangt Zwei-Faktor-Authentifizierung; die
Einrichtung erfolgt direkt nach dem Abschluss unter
`/intern/profil/sicherheit`.

### Objektspeicher (optional)

Die `docker-compose.yml` bringt **Garage** mit — einen S3-kompatiblen
Objektspeicher, der für genau diesen Fall gebaut ist: wenige Knoten, selbst
betrieben, keine Cloud dahinter. Dazu eine Bedienoberfläche unter
**http://localhost:3909**.

Gebraucht wird er nicht. Ohne ihn liegen alle Dateien wie bisher in der
Datenbank, und für einen Stamm reicht das. Wer ihn will:

```bash
# Beide Geheimnisse gehören in die .env, sonst startet Garage nicht.
openssl rand -hex 32       # -> GARAGE_RPC_SECRET
openssl rand -base64 32    # -> GARAGE_ADMIN_TOKEN

docker compose up -d
npm run storage:setup
```

`storage:setup` legt die Aufteilung des Knotens fest, erstellt den Bucket
`portal` samt Zugangsschlüssel und hinterlegt die Zugangsdaten unter
**`/intern/admin/speicher`** — der geheime Teil verschlüsselt mit
`APP_ENC_KEY`. Der Lauf ist wiederholbar und legt nichts doppelt an.

Danach im Adminbereich **„Verbindung prüfen“** und, wenn schon Dateien in der
Datenbank liegen, **„Dateien umziehen“**. Neue Dateien landen ab sofort oben;
alte bleiben lesbar, bis sie umgezogen sind.

Für den Containerbetrieb (`--profile app`) gehört das Schlüsselpaar
zusätzlich in die `.env`: im Container heißt der Dienst `garage`, nicht
`localhost`. `npm run storage:setup` gibt die passenden Zeilen am Ende aus.

Ein anderer Anbieter geht genauso — die Zugangsdaten trägt man dann direkt
unter `/intern/admin/speicher` ein und lässt die Garage-Dienste weg.

### Falls man sich aussperrt

Über die Umgebungsvariablen `BOOTSTRAP_ADMIN_EMAIL` und
`BOOTSTRAP_ADMIN_PASSWORD` wird der Zugang beim Start angelegt beziehungsweise
repariert. Die Variablen sollten danach wieder entfernt werden.

### Umgebungsvariablen

Siehe `.env.example`. Erforderlich sind `DATABASE_URL`, `SESSION_SECRET`,
`MFA_ENC_KEY`, `PUBLIC_APP_URL` und die `SMTP_*`-Angaben. Für die
Garage-Dienste zusätzlich `GARAGE_RPC_SECRET` und `GARAGE_ADMIN_TOKEN`.

Hinter einem Reverse Proxy müssen zusätzlich `ADDRESS_HEADER=X-Forwarded-For`
und `XFF_DEPTH` gesetzt sein – sonst sieht die Anwendung nur die Adresse des
Proxys und die Begrenzung der Anmeldeversuche pro Adresse wäre wirkungslos.

Für Zugriffe auf die REST-API aus einem Browser wird `API_CORS_ORIGINS`
gebraucht. Ohne diese Angabe ist der Zugriff aus fremden Seiten gesperrt;
Server-zu-Server-Aufrufe mit Token sind davon nicht betroffen.

---

## Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver |
| `npm run build` | Produktionsbuild |
| `npm run preview` | Build lokal ansehen |
| `npm run check` | Typprüfung (svelte-check) |
| `npm test` | Unit-Tests (Vitest) |
| `npm run db:generate` | Migration aus dem Schema erzeugen |
| `npm run db:migrate` | Ausstehende Migrationen anwenden |
| `npm run db:seed` | Systemrollen und Kontenrahmen anlegen |
| `npm run storage:setup` | Objektspeicher einrichten: Bucket, Schlüssel, Eintrag im Adminbereich |
| `npm run db:studio` | Datenbank im Browser ansehen |

Nach **jeder** Änderung an `src/lib/server/db/schema/` muss
`npm run db:generate` laufen und die erzeugte Datei mit eingecheckt werden.
Die CI prüft das und schlägt fehl, wenn eine Migration fehlt.

---

## Aufbau

```
src/
  lib/
    components/ui/        Gemeinsame Oberflächenkomponenten
    components/finance/   Bereichsnavigation, offene Posten, Zeitraumfilter
    components/finance/charts/  Diagramme (LayerChart) mit gemeinsamen Farben
    finance/labels.ts     Beschriftungen der Kontoarten und Bereiche
    money.ts              Geldbeträge als ganzzahlige Cents
    format.ts             Datum, Alter, Namen
    permissions/          Berechtigungsprüfung (eine Implementierung)
    permissions/labels.ts Deutsche Beschriftungen der Berechtigungen
    server/
      api/                REST-API: Tokens, Antworten, Schemata, Hook
      auth/               Passwörter, Sitzungen, 2FA, Sperren
      crypto.ts           Verschlüsselung der Geheimnisse in der Datenbank
      db/                 Drizzle-Schema, Verbindung, Kennungen, Kalendertage
      finance/            Journal, Konten, Rechnungen, Berichte, Abgleich
      kaemmerer/          Artikel, Lager, Bestellungen
      orders/             Verbindung zwischen Bestellungen und Kasse
      pdf/                Vorlagenliste, gemeinsames Gerüst, Erzeuger
      seed/               Demodaten
      storage/            Objektspeicher (S3) hinter einer Schnittstelle
      shareService.ts     Freigabeziele – gemeinsam für Ordner und Termine
      documentService.ts  Ordner, Dokumente, Sichtbarkeit
      eventService.ts     Termine, Freigaben, Rückmeldungen
      calendar.ts         iCal-Erzeugung und Kalender-Tokens
  routes/
    login, password, setup, join   Öffentlich
    intern/                        Geschützt
    intern/termine/kalender.ics    Kalenderabo (Token statt Anmeldung)
    api/v1/                        REST-API
    dev/ui                         Komponentenübersicht (nur Entwicklung)
drizzle/                           Migrationen (erzeugt, eingecheckt)
docker/garage.toml                 Konfiguration des Objektspeichers
scripts/                           Migration, Seed, Objektspeicher, Abnahme
```

**Gestaltung:** [`intern-design-sheet.md`](./intern-design-sheet.md) ist
verbindlich, [`finance-design-sheet.md`](./finance-design-sheet.md) ergänzt es
um die Besonderheiten der Kasse. Unter `/dev/ui` liegt eine lauffähige
Übersicht aller Komponenten in hell und dunkel.

---

## Grundregeln

Vier Regeln tragen den größten Teil der Fehlerfreiheit; sie stehen ausführlich
in den Design-Blättern:

1. **Geld ist ganzzahlig.** Beträge sind Cents – in der Datenbank, in den
   Diensten, in der API. Fließkommazahlen für Geld gibt es nicht.
2. **Gebucht wird nur über `postEntry()`.** Soll und Haben müssen
   übereinstimmen; geprüft wird das im Dienst und noch einmal von der
   Datenbank über einen aufgeschobenen Trigger. Korrigiert wird per Storno,
   nie durch Löschen.
3. **Jede Server-Aktion sichert sich selbst ab.** SvelteKit führt bei
   Formular-Aktionen kein `load` aus; eine Prüfung im `load` schützt die
   zugehörige Aktion also nicht.
4. **`null` heißt stammesweit, `[]` heißt kein Recht.** Ein Recht gilt
   entweder für den ganzen Stamm oder für einzelne Gruppen.
   `groupsWithPermission()` liefert deshalb `null` (nicht filtern), ein Array
   (nur diese Gruppen) oder ein leeres Array (gar nichts). Wer die beiden
   Enden verwechselt, baut ein Leck oder eine leere Seite — die Prüfung
   gehört in die Guards aus `permissionGuard.ts`, nicht in die Route.

---

## Tests

```bash
npm test            # alles, was ohne Datenbank läuft
```

Die reinen Logiktests brauchen nichts weiter. Daneben gibt es
**Integrationstests**, die gegen eine echte Datenbank laufen und sich ohne
`DATABASE_URL` selbst überspringen — an der Zusammenfassung als „skipped“
erkennbar:

```bash
docker compose up -d postgres
DATABASE_URL=postgres://intern:intern@localhost:5432/intern npm test
```

Geprüft werden dort die Dinge, die sich nur im Zusammenspiel zeigen: die
Vererbung der Ordnerfreigaben an Unterordner, die Sichtbarkeit von Terminen,
dass Soll und Haben in der Summen- und Saldenliste übereinstimmen, und dass
jede PDF-Vorlage ein Dokument erzeugt, das sich öffnen lässt.

Für den Objektspeicher gibt es zwei Tests, weil es zwei Wege gibt, auf denen
die Zugangsdaten hereinkommen:

`storage.integration` prüft den Weg über die Umgebungsvariablen. Das
Schlüsselpaar dafür steht in der Garage-Oberfläche unter
http://localhost:3909 → Keys:

```bash
S3_ENDPOINT=http://localhost:3900 S3_BUCKET=portal S3_REGION=garage \
S3_ACCESS_KEY_ID=GK… S3_SECRET_ACCESS_KEY=… S3_FORCE_PATH_STYLE=true \
DATABASE_URL=postgres://intern:intern@localhost:5432/intern \
npx vitest run storage.integration
```

`panel.integration` prüft den Weg über die Einstellung im Adminbereich — den,
den ein normaler Betrieb geht. Er braucht **keine** `S3_*`-Variablen (die
hätten Vorrang), wohl aber denselben Verschlüsselungsschlüssel, mit dem
`npm run storage:setup` geschrieben hat:

```bash
DATABASE_URL=postgres://intern:intern@localhost:5432/intern \
APP_ENC_KEY=$MFA_ENC_KEY npx vitest run storage/panel.integration
```

Der zweite fängt einen Fehler, den man sonst lange nicht bemerkt: passt der
Schlüssel nicht, fällt die Anwendung still auf die Datenbank zurück.

Ein Test ist bewusst zusätzlich gesperrt: `seed/demo.integration` räumt die
Datenbank hinterher vollständig ab und läuft deshalb nur mit
`DEMO_SEED_TEST=1` — gedacht für einen frischen Wegwerf-Container, nicht für
die Arbeitsdatenbank.

Die Integrationstests teilen sich eine Datenbank und laufen deshalb seriell
(`fileParallelism: false`).

### Abnahme im Browser

`scripts/smoke.mjs` richtet über `/setup` einen Stamm samt Demodaten ein und
klappert danach jede Seite ab: Statuscode, erwarteter Inhalt, Fehler in der
Browserkonsole, dazu ein Bildschirmfoto je Seite. Gedacht für die Abnahme von
Hand — die CI führt es nicht aus.

Es braucht einen **Wegwerf-Container** als Datenbank, niemals die
Arbeitsdatenbank: der Lauf legt einen Stamm an, und `/setup` ist danach
dauerhaft gesperrt.

```bash
docker run -d --name pg-smoke -p 5433:5432 -e POSTGRES_USER=intern \
  -e POSTGRES_PASSWORD=intern -e POSTGRES_DB=intern postgres:17-alpine
DATABASE_URL=postgres://intern:intern@localhost:5433/intern npm run db:migrate

npm run build
DATABASE_URL=postgres://intern:intern@localhost:5433/intern \
  SESSION_SECRET=... APP_ENC_KEY=... npm run preview -- --port 5178 &

npx playwright install chromium          # einmalig
SMOKE_DB_CONTAINER=pg-smoke node scripts/smoke.mjs http://localhost:5178 ./smoke
```

Beim ersten Lauf fällt auf: die Rolle „Administration“ verlangt Zwei-Faktor,
weshalb der Hook jeden Aufruf unter `/intern` auf die Einrichtungsseite
umleitet. Mit `SMOKE_DB_CONTAINER` schaltet das Skript die Anforderung in der
Testdatenbank ab und meldet sich neu an — geprüft werden sollen die Seiten,
nicht der Zwei-Faktor-Ablauf.

---

## Betrieb

`Dockerfile` erzeugt ein Image auf Basis von `node:22`; die GitHub-Action
`deploy.yml` baut es bei jedem Push auf `master` und lädt es nach `ghcr.io`.
Der Startbefehl wendet ausstehende Migrationen an und startet erst danach den
Server – schlägt die Migration fehl, kommt der Server gar nicht erst hoch.
Er hört auf Port 3000.

Für einen vollständigen Stapel aus Datenbank und Anwendung:

```bash
docker compose --profile app up -d
```
