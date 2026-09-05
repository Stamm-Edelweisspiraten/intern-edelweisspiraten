# Kasse – fachliche Ergänzungen

Für Gestaltung, Farben und Komponenten gilt uneingeschränkt
[`intern-design-sheet.md`](./intern-design-sheet.md). Dieses Blatt hält nur
fest, was für die Kasse darüber hinaus gilt.

---

## 1. Geld ist ganzzahlig

Beträge werden **als Cents** geführt – in der Datenbank, in den Services, in
den Typen und in der REST-API. Fließkommazahlen für Geld gibt es nicht.

```ts
import { formatEuro, parseEuro, splitEvenly, sumCents } from "$lib/money";

formatEuro(1234);        // "12,34 EUR"
parseEuro("1.234,56");   // 123456  (null bei ungültiger Eingabe)
splitEvenly(1000, 3);    // [334, 333, 333]  – Summe bleibt 1000
```

- Eingabefelder zeigen `(cents / 100).toFixed(2).replace(".", ",")`.
- `parseEuro` liefert bei ungültiger Eingabe `null`; das ist ein Formularfehler
  und darf **nicht** stillschweigend als 0 verbucht werden.
- Aufteilungen laufen über `splitEvenly`, damit keine Cents verschwinden.
- Die API weist einen Betrag mit Nachkommastellen ausdrücklich ab: 12,50 EUR
  sind `1250`, nicht `12.5`.

---

## 2. Doppelte Buchführung

Jede Geldbewegung ist ein **Buchungssatz** (`journal_entries`) aus mindestens
zwei **Zeilen** (`journal_lines`). Je Zeile ist genau einer der beiden Beträge
– Soll oder Haben – größer als 0, und über den ganzen Satz stimmen die Summen
überein.

Geprüft wird das dreifach, und das ist Absicht:

1. `validateLines()` vor dem Schreiben – für eine verständliche Meldung.
2. `postEntry()` beim Schreiben.
3. Ein **aufgeschobener Constraint-Trigger** in PostgreSQL
   (`journal_lines_balanced`). Er greift auch bei Zugriffen, die an der
   Anwendung vorbeigehen. Aufgeschoben deshalb, weil ein Satz nach dem
   Einfügen der ersten Zeile zwangsläufig unausgeglichen ist.

**Gebucht wird ausschließlich über `postEntry()`.** Das gilt für die einfache
Maske, die Zahlung auf eine Rechnung, die Abrechnung einer Bestellung,
wiederkehrende Buchungen, den Kontoauszug-Import und die REST-API. Wer daran
vorbei schreibt, erzeugt einen unausgeglichenen Satz – und die Datenbank weist
ihn ab.

### Zwei Masken

| Maske | Für wen | Wie |
|---|---|---|
| `createTransaction()` | Kassenwart | Einnahme/Ausgabe + Buchungsart + Konto → zwei Zeilen entstehen im Hintergrund |
| `postEntry()` | Expertenmaske `/intern/finance/journal/create` | Beliebig viele Zeilen mit Soll und Haben von Hand |

Soll und Haben tauchen in der einfachen Maske bewusst nicht auf.

### Storno statt Löschen

Es gibt **kein** Löschen von Buchungen. Eine falsche Buchung wird über
`reverseEntry()` storniert: der ursprüngliche Beleg bleibt erhalten, ein
Gegensatz mit vertauschten Seiten hebt ihn auf, und beide verweisen
aufeinander (`reverses_id` / `reversed_by_id`). Auch die REST-API hat deshalb
kein `DELETE` auf Buchungssätze, sondern `POST …/reverse`.

In Berichten werden Stornos **nicht** ausgeblendet: Original und Gegensatz
heben sich in der Summe auf. Sie herauszufiltern wäre falsch, weil dann nur
die Gegenbuchung stehenbliebe.

---

## 3. Kontenrahmen

Der mitgelieferte Kontenrahmen steht als reine Daten in
`src/lib/server/finance/chartData.ts` – ohne Datenbankzugriff, damit das
Seed-Skript außerhalb von Vite dieselbe Liste benutzt und sie nicht ein
zweites Mal existiert.

Er ist an SKR49 angelehnt, aber bewusst schlank. Vier steuerliche Sphären:
ideeller Bereich, Vermögensverwaltung, Zweckbetrieb, wirtschaftlicher
Geschäftsbetrieb. Konten des Rahmens sind als `system` markiert und nicht
löschbar; Nummer und Kontoart bleiben unveränderlich, weil die
Geschäftslogik sie über die Nummer sucht (siehe `SYSTEM_ACCOUNTS`).

Bebuchte Konten lassen sich nie löschen, nur deaktivieren.

**Buchungsarten** (`booking_categories`) sind die Auswahlliste der einfachen
Maske und zeigen auf ein Erfolgskonto. Sie ersetzen den früheren festen Enum
`TRANSACTION_KINDS` – vorher gab es zwei Auswahllisten in der Oberfläche mit
unterschiedlichem Inhalt.

---

## 4. Kalendertage

Alle `date`-Spalten halten einen **Tag ohne Uhrzeit**. Ein aus Ortszeit
gebautes Datum (`new Date(2026, 4, 10)` = lokale Mitternacht) landet über
`toISOString()` östlich von Greenwich im Vortag. Genau das ist beim Einlesen
eines Kontoauszugs passiert: aus dem 10.05. wurde der 09.05.

Deshalb: **jedes Kalenderdatum läuft durch `$lib/server/db/dates`.**

```ts
import { toCalendarDate, todayCalendar, calendarDate } from "$lib/server/db/dates";
```

`toCalendarDate()` nimmt die Ortszeit-Bestandteile und legt sie auf
UTC-Mitternacht. Ein Jahresvergleich läuft über `calendarYear()`, nie über
`getFullYear()` eines rohen Datums.

---

## 5. Farbrollen der Kasse

| Sachverhalt | Ton |
|---|---|
| Einnahme, bezahlt, erledigt | `success` |
| Ausgabe, Storno, Löschen | `danger` |
| Offener Posten, Abschluss, fällig | `warning` |
| Teilzahlung, Hinweis, Herkunft | `info` |
| Navigation, Hauptaktion | `primary` |
| Archiv, storniert | `neutral`, zusätzlich `opacity-70` |

Beträge werden fett gesetzt, mit `tabular-figures`; Ausgaben mit
vorangestelltem Minuszeichen.

Dieselben Rollen gelten in den **Diagrammen**: Erträge `success`,
Aufwendungen `danger`, Ergebnisse und Verläufe `primary`, offene Posten
`warning`. Die Farben kommen als CSS-Variablen ins SVG
(`var(--color-success)`), nie als Hexwert — sonst müsste für den dunklen
Modus eine zweite Palette gepflegt werden. Die Zuordnung steht an einer
Stelle: `src/lib/components/finance/charts/colors.ts`.

---

## 6. Zustände

**Rechnung** (Forderung wie Verbindlichkeit):
`open` → `partial` → `paid`, dazu `cancelled` als Sonderfall.

- Der offene Rest ergibt sich aus `amount - paidAmount` und wird über
  `computeOutstanding()` ermittelt – **an genau einer Stelle**. Frühere
  Kopien dieser Berechnung wichen voneinander ab, sodass Übersicht und
  Detailansicht unterschiedliche Summen zeigten.
- `overdue` bedeutet: offen **und** `dueDate` liegt vor dem heutigen
  Kalendertag. Eine heute fällige Rechnung ist noch nicht überfällig.
- Zahlungen laufen ausschließlich über `payInvoice()` bzw. `payBill()`; der
  Überzahlungsschutz steckt in der Prüfbedingung `invoices_paid_check` der
  Datenbank, nicht in der Oberfläche.
- Eine Zahlung wird über `reversePayment()` zurückgenommen: der Buchungssatz
  wird storniert, die Zahlung gekennzeichnet, der bezahlte Betrag reduziert.

**Bestellung:** Lieferung und Bezahlung sind **zwei unabhängige Merkmale** und
werden als zwei getrennte Kennzeichen dargestellt:

- `status`: `ordered` → `processing` → `delivered`, dazu `cancelled`
- `paymentStatus`: `open` → `partial` → `paid`

`paid` ist bewusst **kein** Lieferstatus. Früher überschrieb eine vollständige
Zahlung den Status `delivered` und löschte damit die Lieferinformation.

**Geschäftsjahr:** `active` → `closed` → `archived`. Der Trigger
`journal_entries_year_open` weist Buchungen in einem nicht aktiven Jahr ab.
Deshalb schreibt `closeFiscalYear()` erst die Übertragsbuchungen und setzt
danach den Status – andersherum liefe der Abschluss in seine eigene Sperre.

---

## 7. Kontoabgleich

Der Import erkennt die Spalten über die Kopfzeile, weil jede Bank andere
Bezeichnungen verwendet. Gegen doppeltes Einlesen schützt ein Fingerabdruck je
Zeile (Konto, Datum, Betrag, Verwendungszweck) mit eindeutigem Index.

Der Abgleich **schlägt nur vor**; bestätigt wird immer von Hand. Der Betrag
muss exakt stimmen – eine Zuordnung „ungefähr“ wäre in einer Buchhaltung
wertlos. Datumsnähe und Textüberschneidung entscheiden nur über die
Reihenfolge der Vorschläge.

---

## 8. Absicherung

SvelteKit führt bei Formular-Aktionen **kein** `load` aus. Eine Absicherung im
`load` schützt die zugehörigen Aktionen deshalb nicht. Jede Aktion ruft
`requirePermission` selbst auf:

```ts
export const actions: Actions = {
    add: async (event) => {
        requirePermission(event, "finance.manage");
        // ...
    }
};
```

Berechtigungen und wo sie erzwungen werden:

| Schlüssel | Wofür |
|---|---|
| `finance.view` | Alles Lesende: Journal, Konten, Berichte, offene Posten |
| `finance.manage` | Buchen, Stornieren, Zahlungen, Beiträge, Konten pflegen |
| `finance.export` | CSV-Ausgaben (Jahresexport, Berichte) |
| `finance.close` | Jahresabschluss |

`finance.export` und `finance.close` waren früher deklariert, aber an keiner
Stelle erzwungen – der Export hing an `finance.view`, der Abschluss an
`finance.manage`.

Anzeigebedingungen (`canManage`) laufen über `matchesPermission`, nie über
`Array.includes`: Letzteres kennt keine Platzhalter, sodass eine Rolle mit
`finance.*` die Schaltflächen nicht sah, obwohl die Aktion durchging.

---

## 9. Auswertungen

Alle Berichte lesen ausschließlich aus den Buchungszeilen. Es gibt keine
zweite Wahrheit, die auseinanderlaufen könnte, und keinen gespeicherten
Saldo.

| Bericht | Was er beantwortet |
|---|---|
| GuV | Erträge und Aufwendungen eines Zeitraums, aufgeteilt nach steuerlichen Bereichen |
| Vermögensübersicht | Aktiva gegen Passiva zum Stichtag; das Ergebnis schließt sie rechnerisch |
| **Summen- und Saldenliste** | Je Konto: Anfangsbestand, Soll, Haben, Saldo. Die Kontrollrechnung der Buchhaltung |
| **Monatsübersicht** | Erträge, Aufwendungen und Ergebnis je Monat, mit Jahressumme |
| Kassenbericht | Bewegungen eines Kassen- oder Bankkontos mit laufendem Bestand |
| Kontenblatt | Buchungen eines Sachkontos |
| Fälligkeitsstaffel | Offene Forderungen nach Alter |

Zwei Regeln, die bei der Summen- und Saldenliste zählen und beide beim ersten
Anlauf falsch waren:

1. **Erfolgskonten tragen keinen Anfangsbestand.** Erträge und Aufwendungen
   beginnen jede Periode bei null — genau dafür wird ein Geschäftsjahr
   abgeschlossen. Nur Bestandskonten (Aktiva, Passiva, Eigenkapital) tragen
   ihren Saldo vor.
2. **Ein Konto ohne Bewegung, aber mit Vortrag, bleibt in der Liste.** Es
   über die Bewegungen des Zeitraums zu suchen lässt genau diese Konten
   verschwinden — und damit den Vortrag. Deshalb: Konten, Vortragssummen und
   Zeitraumsummen getrennt abfragen und im Speicher zusammenführen.

Die Probe der Liste ist, dass die Summe der Soll-Bewegungen der Summe der
Haben-Bewegungen entspricht (`balanced`). Weicht sie ab, zeigt die Seite das
deutlich an, statt die Zahl zu verstecken.

**Diagramme** stehen neben ihrer Tabelle, nie statt ihr — Näheres im
[`intern-design-sheet.md`](./intern-design-sheet.md), Abschnitt „Diagramme“.

---

## 10. PDFs

Eine Vorlagenliste für alles: `src/lib/server/pdf/registry.ts`. Jede Vorlage
trägt Namen, benötigtes Recht, zod-Schema der Eingabe und Erzeugerfunktion.

- **Eine Rechteprüfung**, nicht drei verschiedene Muster. Das Recht steht auf
  der Vorlage; `POST /api/v1/pdf/{vorlage}` und die Adressen unter `/intern`
  lesen es dort ab.
- **Ein gemeinsames Gerüst** (`pdf/layout.ts`): Kopf mit Organisation und
  Logo, Fußzeile mit Seitenzahl, eine Tabellenfunktion, die umbricht und den
  Tabellenkopf auf der neuen Seite wiederholt. Vorher baute jeder Erzeuger
  das selbst — und schrieb bei mehr Zeilen, als auf eine Seite passen, über
  den Rand hinaus.
- **Selbstbeschreibung**: `GET /api/v1/pdf` liefert die Liste samt JSON
  Schema. Eine Vorlage, die dazukommt, steht dort automatisch.
- Beträge laufen auch hier über `formatEuro`; das PDF rechnet nie selbst.

---

## 11. REST-API

`/api/v1` liegt **vor** dem HTML-Gate im Hook. Ohne gültiges Token gibt es
`401` als JSON, keine Weiterleitung auf `/login` – sonst bekäme ein
Fremdsystem eine Anmeldeseite mit Status 200, und jede Fehlerbehandlung auf
der Gegenseite wäre unbrauchbar.

- Tokens tragen als Scopes dieselben Berechtigungsschlüssel wie das Portal.
  Es gibt **kein zweites Berechtigungsmodell**.
- Schreibende Zugriffe laufen durch dieselben Dienstfunktionen wie die
  Formular-Aktionen. Insbesondere gebucht wird ausschließlich über
  `postEntry()`.
- Fehler folgen RFC 9457 (`application/problem+json`).
- Listen antworten einheitlich mit `data` und `meta`.

---

## 12. Textbausteine

Schaltflächen: „Neues Geschäftsjahr“, „Buchung“, „Freier Buchungssatz“,
„Zahlung erfassen“, „Stornieren“, „Beiträge anlegen“, „Jahr abschließen“,
„Kontoauszug einlesen“, „Export (CSV)“.

Leere Zustände: „Alle Forderungen sind ausgeglichen.“ ·
„Noch keine Buchungssätze in diesem Geschäftsjahr.“ ·
„Keine Bestellungen in diesem Geschäftsjahr.“ ·
„Noch kein Kontoauszug eingelesen“.
