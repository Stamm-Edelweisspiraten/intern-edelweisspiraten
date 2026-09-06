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
Einladungscode. **Mehrfachauswahl** mit Sammelaktionen: Einladungslinks aller
Ausgewählten als eine Datei (CSV, JSON oder TXT), E-Mail an die Auswahl,
Einladungscodes erneuern, Löschen. Liegt auch nur ein ausgewähltes Mitglied
außerhalb der eigenen Zuständigkeit, wird die ganze Aktion abgewiesen statt
stillschweigend gefiltert.

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

Die Rückfrage „Wer kommt mit?“ ist **je Termin abschaltbar**: nicht jede
Stammesversammlung braucht eine Teilnehmerliste. Ist sie aus, verschwinden
Rückmeldung, Frist und Liste — und der Server weist eine trotzdem
abgeschickte Rückmeldung ab. Jeder Termin trägt außerdem eine **Farbe**, die
in Liste, Monatsraster und Detailansicht durchgehalten wird, und wahlweise ein
**Titelbild** im Objektspeicher. Wer `events.manage` nur für eine Gruppe hält,
verwaltet genau die Termine, die auf diese Gruppe freigegeben sind.

**Umfragen und Formulare**
Frei zusammengestellte Formulare aus Text, Langtext, Einfach- und
Mehrfachauswahl sowie Ja/Nein, mit Pflichtfeldern, Hinweistexten, Zeitfenster
und Entwurfs-, Veröffentlicht- und Geschlossen-Zustand. Antworten wahlweise je
Zugang oder je verknüpftem Mitglied — Eltern antworten dann für jedes Kind
einzeln. Auf Wunsch **anonym**: die Antwort trägt dann keinen Absender, und
wer teilgenommen hat, steht getrennt davon. Auswertung mit Balken **neben**
einer Tabelle mit denselben Zahlen, dazu ein CSV-Export. Freigabe wie bei
Terminen; optional an einen Termin gekoppelt.

**Umfragen extern freigeben**
Eine Umfrage lässt sich über einen Link freigeben, den auch Menschen ohne
Zugang öffnen können — für den Elternabend, eine Anmeldung oder eine Rückfrage
an Ehemalige. Je Umfrage wird entschieden, ob ein Name **Pflicht**, **freiwillig**
oder **gar nicht** erfasst wird. Der Link ist jederzeit neu erzeugbar,
widerrufbar und kann ein Ablaufdatum tragen.

Drei Dinge, die man dazu wissen muss:

* **Der Link ist der Ausweis.** Gespeichert wird nur sein sha256-Abdruck, wie
  bei Sitzungen und Kalenderabos; angezeigt wird er genau einmal. Wer ihn hat,
  darf antworten — wer ihn weitergibt, gibt das Antwortrecht mit.
* **Ohne Anmeldung gibt es keine verlässliche Identität.** Mehrfaches Absenden
  lässt sich deshalb nicht sicher verhindern. Eine Begrenzung je Adresse fängt
  stumpfes Fluten ab, mehr nicht. Antworten aus dem Link werden in der
  Auswertung getrennt ausgewiesen, damit niemand die Zahlen überinterpretiert.
* **Hinter einem Reverse Proxy** müssen `ADDRESS_HEADER` und `XFF_DEPTH`
  gesetzt sein (siehe unten). Sonst sieht die Anwendung nur die Adresse des
  Proxys, und die Begrenzung je Adresse fällt für alle Besucher auf einen
  einzigen Topf zusammen.

Umfragen, die **je Mitglied** beantwortet werden, lassen sich nicht extern
freigeben: ohne Anmeldung ist kein Mitglied bekannt, dem eine Antwort gehören
könnte. Die Oberfläche weist das mit dieser Begründung ab.

**Galerie**
Bildergalerien mit beliebig vielen Bildern, wahlweise einem Termin zugeordnet.
Upload per Drag & Drop mit Fortschritt, Bildunterschriften, freie Sortierung,
Titelbild, Einzelansicht. Die Bilder liegen im **Objektspeicher**; das
Vorschaubild entsteht im Browser vor dem Hochladen, sodass ein Raster aus
vierzig Bildern nicht vierzig Vollbilder lädt. Ohne JavaScript funktioniert
der Upload weiter — dann eben ohne Vorschaubild. Beim Löschen eines Bildes
oder einer ganzen Galerie verschwinden Datenbankzeile und Objekt gemeinsam;
verwaiste Dateien im Speicher gibt es nicht.

**Dateien**
Ordner mit Unterordnern, freigegeben an Gruppen, Ämter, Rollen oder einzelne
Personen; Unterordner erben die Freigaben ihres Elternordners. Schreibrecht je
Freigabe. **Drag & Drop** für mehrere Dateien und ganze Ordner mit Fortschritt
je Datei (höchstens drei gleichzeitig), dazu Umbenennen, Verschieben,
Mehrfachauswahl, Sortierung, Suche, Kontextmenü und Breadcrumbs.
**Vorschau** für Bilder, Text (`.txt`, `.log`, `.json`, `.yaml`, `.csv`),
Markdown und PDF — im Dialog oder unter einer eigenen Adresse.
Wahlweise Ablage im **Objektspeicher** statt in der Datenbank —
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

Ist beim Aufruf **keine Datenbank erreichbar**, stellt der Assistent einen
Schritt **0. Datenbank** voran: Host, Port, Datenbank, Benutzer, Passwort und
SSL-Modus, wahlweise auch ein vollständiger Connection String. Der Schritt
prüft die Verbindung, legt sie unter `./data/database.json` ab (`DB_CONFIG_FILE`)
und wendet die Migrationen an. Danach geht es ohne Neustart mit den vier
Schritten oben weiter. Wer `DATABASE_URL` gesetzt hat, sieht diesen Schritt
nie — die Umgebung hat Vorrang, und eine Datei daneben wäre eine stille Falle.

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

Für den häufigeren Fall — ein Zugang, dem ein Recht fehlt — trägt **jede
Fehlerseite einen Abmelde-Knopf**. Vorher war das eine Sackgasse: die
Fehlerseite ersetzt die interne Hülle samt Seitenleiste, und dort saß der
einzige Abmelde-Knopf. Beide angebotenen Wege führten zurück in denselben
Fehler, weil `/` auf `/login` und ein angemeldeter Zugang von dort auf
`/intern/dashboard` weitergeleitet wurde — das ohne `dashboard.view` wieder mit
403 antwortet. Wer in diesem Kreis saß, kam nur über das Löschen des Cookies
heraus.

Abmelden hängt an keiner Berechtigung und beendet Sitzung samt Cookie
vollständig. 401 (Sitzung abgelaufen) und 403 (Recht fehlt) sind auf der
Fehlerseite getrennt beschrieben.

Jeder Serverfehler bekommt eine **Korrelations-ID**: sie steht im Protokoll
(`Serverfehler: {...}` als JSON auf stdout) und auf der Fehlerseite als
„Kennung für Rückfragen“. Damit lässt sich eine Meldung ohne Suche nach dem
Zeitfenster wiederfinden.

### Datenbank

Die Anwendung setzt **PostgreSQL 15 oder neuer** voraus — `NULLS NOT DISTINCT`
und die aufgeschobenen Trigger der Buchungsprüfung gibt es nicht darunter. Die
Verbindung wird in dieser Reihenfolge ermittelt; die erste vollständige Quelle
gewinnt:

```text
DATABASE_URL  →  einzelne DB_* Variablen  →  Setup-Konfiguration  →  keine
```

| Stufe | Woher | Wann sinnvoll |
|---|---|---|
| 1 | `DATABASE_URL` | Container, CI, alles Übliche |
| 2 | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL`, `DB_TYPE` | Wenn Sonderzeichen im Passwort stehen — die Einzelwerte werden beim Zusammenbau kodiert, in einer URL müsste man das selbst tun |
| 3 | `./data/database.json`, geschrieben von `/setup` | Erstinbetriebnahme ohne Zugriff auf die Betriebsumgebung |
| 4 | – | Die Anwendung startet, jeder Datenbankzugriff scheitert mit einer verständlichen Meldung. Build und `svelte-check` bleiben dadurch ohne Datenbank möglich |

`DB_TYPE` dient nur der Kontrolle: erlaubt sind `postgres` und `postgresql`,
alles andere bricht mit klarer Meldung ab, statt still PostgreSQL anzunehmen.
Der Startbefehl des Containers migriert vor dem Start — schlägt das fehl, kommt
der Server gar nicht hoch.

Unter **`/intern/admin/datenbank`** stehen Herkunft der Konfiguration, Host,
Port, Datenbank, Benutzer, SSL, Poolgröße und der Stand der Migrationen, dazu
ein Verbindungstest. Das Passwort wird dort nie angezeigt.

**Bewusst kein Wechsel der Datenbank im laufenden Betrieb.** Der
Verbindungspool entsteht beim Laden des Moduls und wird prozessweit geteilt;
ein Wechsel zur Laufzeit hinge mit offenen Transaktionen und dem
Sitzungsspeicher an zwei Datenbanken gleichzeitig, und ohne Migration und
Datenumzug bedeutet er schlicht Datenverlust. Die Adminseite zeigt deshalb die
nötigen Variablen an und verweist auf einen Neustart.

### E-Mail (SMTP)

Einstellbar unter **`/intern/admin/email`** — mit „Verbindung testen“ und
„Testmail senden“. Die Reihenfolge ist dieselbe wie beim Objektspeicher:

1. **Umgebungsvariablen.** Sind `SMTP_HOST` **und** `SMTP_FROM` gesetzt, stammt
   die gesamte Einstellung aus der Umgebung; die Adminseite zeigt die Werte nur
   noch an und sperrt das Formular. Es wird nicht feldweise gemischt — eine
   halb aus der Umgebung, halb aus der Datenbank zusammengesetzte Konfiguration
   wäre im Fehlerfall nicht mehr nachvollziehbar.
2. **Der Adminbereich.** Das Passwort liegt verschlüsselt in der Datenbank
   (`APP_ENC_KEY`, ersatzweise `MFA_ENC_KEY`) und verlässt den Server nie; das
   Formular zeigt nur, ob eines hinterlegt ist. Leer lassen heißt „behalten“.
3. **Vorgaben:** Port 587, STARTTLS, Absendername aus den
   Organisationseinstellungen.

So bleibt ein Betrieb ganz ohne Geheimnisse in der Datenbank möglich.

`SMTP_ENCRYPTION` ist `none`, `starttls` oder `tls`. Ohne Angabe wird aus dem
Port abgeleitet — 465 bedeutet `tls`, alles andere `starttls` —, damit
bestehende Installationen unverändert weiterlaufen.

Zum Ausprobieren genügt ein Wegwerf-Server:

```bash
docker run -d --name mail -p 1025:1025 -p 8025:8025 axllent/mailpit
# SMTP_HOST=localhost SMTP_PORT=1025 SMTP_ENCRYPTION=none SMTP_FROM=test@example.org
# Posteingang: http://localhost:8025
```

### Dateien: was hochgeladen werden darf

Beim Hochladen wird in dieser Reihenfolge geprüft: **Endungssperre**, dann die
**Positivliste der Typen**, dann ein **Abgleich der Dateisignatur** mit dem
angegebenen Typ, bei Textformaten zusätzlich eine UTF-8-Prüfung. Passt der
Inhalt nicht zur Angabe, wird die Datei abgewiesen — vorher wurde jeder
unbekannte Typ stillschweigend zu `application/octet-stream` umetikettiert und
trotzdem gespeichert. Auch das Umbenennen darf die Endung nicht wechseln.

Erlaubt: PDF, PNG, JPEG, GIF, WebP, Text, CSV, Markdown, JSON, YAML sowie
Word-, Excel- und ODF-Dokumente. Gesperrt sind ausführbare und
skriptfähige Endungen (`exe`, `dll`, `bat`, `ps1`, `sh`, `jar`, `msi`, `html`,
`js`, `vbs` und weitere).

**Bilder** — Titelbild eines Termins und Galerie — laufen durch dieselbe
Prüfung, nur mit einer engeren Positivliste: PNG, JPEG, WebP und (in der
Galerie) GIF, höchstens 10 MB. Das im Browser erzeugte Vorschaubild wird
genauso geprüft wie das Original; es kommt aus derselben Quelle und ist
deshalb genauso ungeprüfte Eingabe. Kommt keines an — etwa ohne JavaScript —
wird das Original als Vorschau ausgeliefert.

**Zu den Bildern selbst:** die Anwendung entfernt **keine EXIF-Daten** aus dem
Original. Ein Foto aus einem Mobiltelefon kann damit Aufnahmezeitpunkt und
GPS-Koordinaten enthalten, und wer das Bild herunterlädt, liest sie mit. Für
einen Stamm mit Fotos von Kindern ist das eine bewusste Entscheidung, die man
kennen muss. Serverseitiges Entfernen bräuchte eine Bildbibliothek, die dieses
Projekt bewusst nicht mitbringt.

**SVG ist bewusst gesperrt.** Ein SVG ist skriptfähiges XML. Die Anwendung
liefert Dateien zwar mit `nosniff` und für SVG mit einer restriktiven
`Content-Security-Policy` aus — sobald aber ein Objektspeicher eingerichtet
ist, leitet der Download auf eine vorsignierte S3-Adresse um, und dort greift
keine Kopfzeile der Anwendung mehr. Die Datei liefe dann als Skript unter
fremdem Ursprung.

Markdown wird mit einem eigenen Renderer angezeigt (`src/lib/server/markdown.ts`,
keine zusätzliche Abhängigkeit): erst wird der gesamte Text escaped, dann
werden die Auszeichnungen einer Positivliste eingesetzt. Rohes HTML wird nie
durchgereicht, Links nur mit `http`, `https` oder `mailto`.

Weitere Riegel: Objektschlüssel entstehen ausschließlich aus der von der
Datenbank vergebenen UUID — ein Dateiname erreicht den Schlüssel nie, womit
Directory Traversal strukturell ausgeschlossen ist (durch einen Test
festgehalten). Symlink-Angriffe sind nicht anwendbar, weil es keine Ablage im
lokalen Dateisystem gibt, nur Datenbank oder S3. Sichtbarkeit und Schreibrecht
kommen immer aus dem Ordner, nie aus dem Dokument allein.

### Umgebungsvariablen

Siehe `.env.example`. Erforderlich sind eine Datenbankangabe (siehe oben),
`SESSION_SECRET`, `APP_ENC_KEY` (ersatzweise `MFA_ENC_KEY`), `PUBLIC_APP_URL`
und die `SMTP_*`-Angaben, sofern der Versand nicht im Adminbereich eingerichtet
wird. Für die Garage-Dienste zusätzlich `GARAGE_RPC_SECRET` und
`GARAGE_ADMIN_TOKEN`.

`PUBLIC_APP_URL` bestimmt die Adressen in E-Mails, im Einladungs-PDF samt
QR-Code und im Export der Einladungslinks. Ohne die Variable gilt der Ursprung
der jeweiligen Anfrage.

**`ORIGIN`** ist im Produktionsbetrieb (`node build`) Pflicht und muss mit
`PUBLIC_APP_URL` übereinstimmen. `adapter-node` prüft bei jedem Formular-POST,
ob die `Origin`-Kopfzeile zur Adresse passt. Ohne die Variable rät es aus den
Kopfzeilen der Anfrage — hinter einem Reverse Proxy mit HTTPS liegt es damit
falsch und weist **jeden** POST mit 403 ab, die Anmeldung eingeschlossen. Für
`npm run dev` spielt das keine Rolle, weshalb der Fehler erst im Betrieb
auffällt.

**`BODY_SIZE_LIMIT`** begrenzt den Anfragekörper im Produktionsbetrieb
(`node build`). Ohne die Angabe nimmt `adapter-node` **512 KB** an — jeder
größere Upload scheiterte mit 413, bevor Anwendungscode überhaupt lief, obwohl
die Oberfläche 10 MB je Datei zulässt. `Dockerfile` und `docker-compose.yml`
setzen deshalb `12M`; der Wert muss über `MAX_FILE_BYTES` aus
`src/lib/server/fileStore.ts` liegen. Für `npm run dev` ist er wirkungslos.

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
    events/colors.ts      Farbpalette der Termine (Tokens, nie Hexwerte)
    surveys/fields.ts     Feldtypen der Umfragen, geteilt Server/Oberfläche
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
      shareService.ts     Freigabeziele – gemeinsam für Ordner, Termine,
                          Umfragen und Galerien; dazu die Gruppenregel
                          sharesGrantGroupScope()
      documentService.ts  Ordner, Dokumente, Sichtbarkeit
      eventService.ts     Termine, Freigaben, Rückmeldungen, Titelbild
      surveyService.ts    Umfragen, Felder, Antworten, Auswertung
      galleryService.ts   Galerien, Bilder, Vorschaubilder, Sortierung
      calendar.ts         iCal-Erzeugung und Kalender-Tokens
  routes/
    login, password, setup, join   Öffentlich
    intern/                        Geschützt
    intern/termine/kalender.ics    Kalenderabo (Token statt Anmeldung)
    intern/umfragen                Umfragen und Formulare
    intern/galerie                 Bildergalerien
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

### Abnahme der Abläufe

`scripts/abnahme.mjs` setzt auf demselben Stamm auf und prüft nicht, ob eine
Seite lädt, sondern ob ein Ablauf **bis zur Datenbank und bis ins Postfach**
durchläuft: Abmelden von der Fehlerseite samt widerrufener Sitzung,
SMTP-Verbindung und Testnachricht, Zugang anlegen mit zugestellter Einladung,
doppelte und ungültige Adresse, Mehrfachauswahl mit Ausfuhr der
Einladungslinks, Ordner anlegen, Mehrfach-Upload und Vorschau.

Es läuft gegen den **Produktionsserver**, nicht gegen `npm run preview` — nur
dort greifen `BODY_SIZE_LIMIT` und die CSRF-Prüfung von `adapter-node`:

```bash
docker run -d --name mail -p 1025:1025 -p 8025:8025 axllent/mailpit

DATABASE_URL=postgres://intern:intern@localhost:5433/intern \
  SESSION_SECRET=... APP_ENC_KEY=... \
  PUBLIC_APP_URL=http://localhost:3000 ORIGIN=http://localhost:3000 \
  SMTP_HOST=localhost SMTP_PORT=1025 SMTP_ENCRYPTION=none \
  SMTP_FROM=portal@example.org BODY_SIZE_LIMIT=12M PORT=3000 node build &

SMOKE_DB_CONTAINER=pg-smoke node scripts/abnahme.mjs http://localhost:3000 ./abnahme
```

Ohne Mailpit werden die beiden Postfach-Prüfungen übersprungen statt zu
scheitern. Der letzte Abschnitt entzieht der Administrationsrolle
vorübergehend alle Rechte, um die Fehlerseite zu prüfen, und gibt sie in einem
`finally` zurück — deshalb gehört auch dieses Skript ausschließlich an einen
Wegwerf-Container.

Zwei Eigenheiten kosten sonst Zeit: die Formulare laufen über `use:enhance`,
es gibt also keine vollständige Navigation, auf die sich warten ließe. Und
`resolveGrants()` hält aufgelöste Rechte 60 Sekunden vor und verwirft den
Zwischenspeicher nur prozessintern — wer Rechte per SQL ändert, sieht die
Wirkung erst danach.

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
