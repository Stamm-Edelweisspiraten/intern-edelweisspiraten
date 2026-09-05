# Edelweisspiraten – Internes Portal

Verwaltungsportal des Stamms Edelweisspiraten Bremen: Mitglieder, Gruppen,
Ämter, Kasse, Kämmerer und interne Kommunikation.

SvelteKit 2 · Svelte 5 · TypeScript · MongoDB · Tailwind CSS 4 · adapter-node

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

**Gruppen und Ämter**
Übersicht und Details, Ämter mit Typ und Gruppenbindung, Gruppenleitungen mit
eigenem Berechtigungsumfang, Mitgliederliste als PDF.

**Kasse**
Geschäftsjahre mit Beitragssätzen, Jahresbeiträge je Mitglied, Buchungen
anlegen, ändern und löschen, Rechnungen mit Teilzahlungen und Fälligkeiten,
offene Posten je Jahr und übergreifend, CSV-Export, Jahresabschluss mit
Übertrag offener Posten, Änderungsprotokoll, Bankdaten für Beitragsbescheide.

**Kämmerer**
Artikel mit Größen und Preisen, Lagerbestand mit Zu- und Abgängen sowie
Inventurkorrektur, Nachbestellliste anhand von Mindestbeständen,
Selbstbedienungs-Bestellungen und Bestellverwaltung, Lieferverfolgung je
Position, Storno mit Rückbuchung, automatische Abrechnung über die Kasse.

**Weiteres**
E-Mail-Versand an Gruppen oder ausgewählte Mitglieder mit formatiertem Text
und Anhängen, heller und dunkler Darstellungsmodus, durchgängig responsiv.

---

## Einrichtung

```bash
npm install
cp .env.example .env      # anschließend ausfüllen
npm run dev
```

### MongoDB

Ein Replica Set mit einem Knoten genügt und ermöglicht Transaktionen:

```bash
docker run -d --name ep-mongo -p 27017:27017 mongo:7 --replSet rs0
docker exec ep-mongo mongosh --eval "rs.initiate()"
```

Ohne Replica Set läuft die Anwendung ebenfalls; Schreibfolgen laufen dann ohne
Transaktion, mit ausgleichenden Gegenbuchungen im Fehlerfall.

### Erster Zugang

Beim ersten Start existiert kein Benutzer. **`/setup`** legt den ersten Zugang
mit Administrationsrechten an und ist danach dauerhaft gesperrt.

Falls man sich später aussperrt, gibt es einen Wiederherstellungsweg über die
Umgebungsvariablen `BOOTSTRAP_ADMIN_EMAIL` und `BOOTSTRAP_ADMIN_PASSWORD`:
beim Start wird der Zugang angelegt beziehungsweise repariert. Die Variablen
sollten danach wieder entfernt werden.

Die Administrationsrolle verlangt Zwei-Faktor-Authentifizierung; die
Einrichtung erfolgt direkt nach der ersten Anmeldung unter
`/intern/profil/sicherheit`.

### Umgebungsvariablen

Siehe `.env.example`. Erforderlich sind `MONGODB_URI`, `MONGODB_DB`,
`SESSION_SECRET`, `MFA_ENC_KEY`, `PUBLIC_APP_URL` und die `SMTP_*`-Angaben.

Hinter einem Reverse Proxy müssen zusätzlich `ADDRESS_HEADER=X-Forwarded-For`
und `XFF_DEPTH` gesetzt sein – sonst sieht die Anwendung nur die Adresse des
Proxys und die Begrenzung der Anmeldeversuche pro Adresse wäre wirkungslos.

---

## Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver |
| `npm run build` | Produktionsbuild |
| `npm run preview` | Build lokal ansehen |
| `npm run check` | Typprüfung (svelte-check) |
| `npm test` | Unit-Tests (Vitest) |

---

## Aufbau

```
src/
  lib/
    components/ui/        Gemeinsame Oberflächenkomponenten
    money.ts              Geldbeträge als ganzzahlige Cents
    format.ts             Datum, Alter, Namen
    permissions/          Berechtigungsprüfung (eine Implementierung)
    server/
      auth/               Passwörter, Sitzungen, 2FA, Sperren
      db/                 Collections mit Typen, Indizes
      finance/            Geschäftsjahre, Rechnungen, Buchungen, Beiträge
      kaemmerer/          Artikel, Lager, Bestellungen
      orders/             Verbindung zwischen Bestellungen und Kasse
  routes/
    login, password, setup, join   Öffentlich
    intern/                        Geschützt
    dev/ui                         Komponentenübersicht (nur Entwicklung)
```

**Gestaltung:** [`intern-design-sheet.md`](./intern-design-sheet.md) ist
verbindlich, [`finance-design-sheet.md`](./finance-design-sheet.md) ergänzt es
um die Besonderheiten der Kasse. Unter `/dev/ui` liegt eine lauffähige
Übersicht aller Komponenten in hell und dunkel.

---

## Tests

`npm test` deckt die Logik ab, in der erfahrungsgemäß die Fehler stecken:
Geldbeträge und Aufteilung, Beitragsberechnung, offene Posten,
Berechtigungsprüfung, Passwort-Hashing und -Richtlinie, TOTP samt
Wiederherstellungscodes, Statusprüfungen und IBAN-Validierung.

Manuell zu prüfen bleiben: Anmeldung samt Zwei-Faktor, Mitglied anlegen und
Einladungs-PDF, Gruppen-E-Mail, ein vollständiger Zahlungsvorgang sowie eine
Bestellung von der Anlage bis zum Storno.

---

## Betrieb

`Dockerfile` erzeugt ein Image auf Basis von `node:20`; die
GitHub-Action `deploy.yml` baut es bei jedem Push auf `master` und lädt es
nach `ghcr.io`. Der Server hört auf Port 3000.
