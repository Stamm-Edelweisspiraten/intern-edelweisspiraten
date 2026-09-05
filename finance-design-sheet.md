# Kasse – fachliche Ergänzungen

Für Gestaltung, Farben und Komponenten gilt uneingeschränkt
[`intern-design-sheet.md`](./intern-design-sheet.md). Dieses Blatt hält nur
fest, was für die Kasse darüber hinaus gilt.

---

## 1. Geld ist ganzzahlig

Beträge werden **als Cents** geführt – in der Datenbank, in den Services und in
den Typen. Fließkommazahlen für Geld gibt es nicht mehr.

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

---

## 2. Farbrollen der Kasse

| Sachverhalt | Ton |
|---|---|
| Einnahme, bezahlt, erledigt | `success` |
| Ausgabe, Storno, Löschen | `danger` |
| Offener Posten, Abschluss | `warning` |
| Teilzahlung, Hinweis | `info` |
| Navigation, Hauptaktion | `primary` |
| Archiv | `neutral`, zusätzlich `opacity-70` |

Beträge werden fett gesetzt; Ausgaben mit vorangestelltem Minuszeichen.

---

## 3. Zustände einer Rechnung

`open` → `partial` → `paid`, dazu `cancelled` als Sonderfall.

- Der offene Rest ergibt sich aus `amount - paidAmount` und wird über
  `computeOutstanding()` ermittelt – **an genau einer Stelle**. Frühere
  Kopien dieser Berechnung wichen voneinander ab, sodass Übersicht und
  Detailansicht unterschiedliche Summen zeigten.
- `overdue` bedeutet: offen **und** `dueDate` liegt in der Vergangenheit.
- Zahlungen laufen ausschließlich über `payInvoice()`; der Überzahlungsschutz
  steckt in der Datenbankbedingung, nicht in der Oberfläche.

## 4. Zustände einer Bestellung

Lieferung und Bezahlung sind **zwei unabhängige Merkmale** und werden als zwei
getrennte Kennzeichen dargestellt:

- `status`: `ordered` → `processing` → `delivered`, dazu `cancelled`
- `paymentStatus`: `open` → `partial` → `paid`

`paid` ist bewusst **kein** Lieferstatus. Früher überschrieb eine vollständige
Zahlung den Status `delivered` und löschte damit die Lieferinformation.

---

## 5. Absicherung

SvelteKit führt bei Formular-Aktionen **kein** `load` aus. Eine Absicherung im
`load` schützt die zugehörigen Aktionen deshalb nicht. Jede Aktion ruft
`requirePermission` selbst auf:

```ts
export const actions: Actions = {
    addTransaction: async (event) => {
        requirePermission(event, "finance.manage");
        // ...
    }
};
```

Berechtigungen: `finance.view` zum Lesen, `finance.manage` für Buchungen und
Beiträge, `finance.export`, `finance.close`.

---

## 6. Textbausteine

Schaltflächen: „Neues Geschäftsjahr“, „Buchung“, „Zahlung erfassen“,
„Beiträge anlegen“, „Jahr abschließen“, „Export (CSV)“.

Leere Zustände: „Alle Forderungen sind ausgeglichen.“ ·
„Noch keine Buchungen erfasst.“ · „Keine Bestellungen in diesem Geschäftsjahr.“

Buchungsarten kommen aus `TRANSACTION_KINDS` in
`$lib/server/finance/types.ts` – nicht aus einer im Formular fest
eingetragenen Liste. Früher gab es zwei Auswahllisten mit unterschiedlichem
Inhalt.
