# Design-Leitfaden – Interner Bereich

Verbindliche Vorgabe für alle Seiten unter `/intern`, `/login`, `/join`,
`/password` und `/setup`.

> **Wichtigste Regel:** Dieses Blatt beschreibt keine kopierbaren
> Klassenstrings, sondern **Komponenten**. Wer eine Karte braucht, schreibt
> `<Card>` – nicht `bg-white border border-gray-200 rounded-2xl shadow-sm`.
> Rohe Paletten-Klassen sind ausdrücklich unerwünscht, weil sie den
> Dunkelmodus brechen.

---

## 1. Farben: nur semantische Tokens

Farben stehen als CSS-Variablen in `src/routes/layout.css` und sind als
Tailwind-Utilities verfügbar. Sie werden im Dunkelmodus neu belegt – deshalb
funktioniert das Umschalten, ohne eine einzige Seite anzufassen.

| Zweck | Utility | Beispiel |
|---|---|---|
| Kartenfläche | `bg-surface` | Karten, Dialoge, Eingabefelder |
| Ruhige Fläche | `bg-surface-muted` | Seitenhintergrund |
| Vertiefte Fläche | `bg-surface-sunken` | Tabellenkopf, Codeblöcke |
| Rahmen | `border-border`, `border-border-strong` | Karten bzw. Eingabefelder |
| Text | `text-fg`, `text-fg-muted`, `text-fg-subtle` | Haupttext, Nebentext, Hinweise |
| Primär | `bg-primary`, `text-primary`, `text-primary-fg` | Hauptaktionen, Navigation |
| Erfolg | `text-success`, `bg-success-soft`, `text-success-soft-fg` | Einnahmen, „bezahlt“ |
| Warnung | `text-warning`, `bg-warning-soft`, … | offene Posten, Hinweise |
| Gefahr | `text-danger`, `bg-danger-soft`, … | Ausgaben, Löschen, Fehler |
| Info | `text-info`, `bg-info-soft`, … | neutrale Hervorhebungen |

**Nicht verwenden:** `bg-white`, `bg-gray-50`, `text-gray-900`,
`border-gray-200`, `bg-blue-600`, `text-emerald-700`, `text-white` und alle
weiteren rohen Paletten-Klassen. Sie sind im Dunkelmodus unlesbar. Die einzige
begründete Ausnahme im Projekt ist die weiße Fläche hinter dem QR-Code der
Zwei-Faktor-Einrichtung – ein QR-Code auf dunklem Grund ist von vielen
Kamera-Apps nicht lesbar.

### Terminfarben sind eine eigene Reihe

Ein Termin trägt eine frei wählbare Farbe (`events.color`). Sie kennzeichnet die
**Art** des Termins – Gruppenstunde, Fahrt, Elternabend – und ist damit etwas
anderes als der **Status**, den die semantischen Tokens tragen. Beide Reihen zu
vermischen ginge schief: ein abgesagter roter Termin wäre von einem roten
laufenden nicht zu unterscheiden.

Deshalb acht eigene Farben in `src/lib/events/colors.ts`, je drei CSS-Variablen
in `layout.css`, getrennt für hell und dunkel:

| Variable | Wofür |
|---|---|
| `--event-<key>` | Kräftig – Punkte im Kalender, Farbstreifen an der Zeile |
| `--event-<key>-soft` | Fläche |
| `--event-<key>-soft-fg` | Schrift darauf, mindestens 4,5:1 |

**Klassennamen werden nie zusammengesetzt.** `bg-event-{key}` findet Tailwind
beim Bauen nicht und lässt die Regel weg. Die Farbe kommt als Inline-Stil über
`eventColorVars(key)` und danach `style="background: var(--ev-soft)"` – dasselbe
Verfahren wie bei `box-shadow: var(--shadow-card)`.

**Farbe ist nie das einzige Unterscheidungsmerkmal.** Die Farbauswahl zeigt zu
jedem Feld den deutschen Namen, und im Kalender steht neben dem Farbpunkt immer
der Titel.

### Graustufen sind neutral

Beide Modi laufen auf einer **neutralen** Graustufenreihe. Der Dunkelmodus lag
früher auf blaustichigen Slate-Tönen (`#0b1220`, `#0f172a`, `#111827`); die
Flächen wirkten dadurch eingefärbt statt neutral. Die Rollenfarben sind die
einzigen Farbträger.

`--fg-subtle` erreicht 4,8:1 auf heller und 5,1:1 auf dunkler Fläche. Wer
diesen Wert ändert, prüft den Kontrast nach – eine frühere Fassung lag bei
2,8:1 und verfehlte damit AA.

---

## 2. Kanten: minimal gerundet

Karten sind mit **4 px** gerundet (`rounded-card`), Bedienelemente mit
**2 px** (`rounded-control`). Beides steht als Token in `layout.css`.

* Neue Komponenten benutzen `rounded-card` bzw. `rounded-control` – nie
  `rounded-xl` oder `rounded-2xl`.
* Die Tailwind-Radien sind zusätzlich flachgelegt, damit noch nicht
  umgestellte Stellen mitziehen. Das ist eine Übergangshilfe, keine
  Einladung, weiter `rounded-*` zu schreiben.
* `rounded-full` ist Abzeichen und Filterchips genommen worden; runde Pillen
  passen nicht zum kantigen Bild.

---

## 3. Schrift und Zahlen

Die Schrift ist **Inter**, lokal eingebunden über
`@fontsource-variable/inter`. Kein externer Schrifthoster – das Portal läuft
selbst gehostet.

Zahlen stehen untereinander: `table` und die Klasse `tabular-figures` setzen
`font-variant-numeric: tabular-nums`. In einer Buchhaltung ist das kein
Detail – mit proportionalen Ziffern springen die Nachkommastellen einer
Betragsspalte von Zeile zu Zeile. **Jede Betragsanzeige außerhalb einer
Tabelle bekommt `tabular-figures`.**

---

## 4. Komponenten

Alle unter `src/lib/components/ui`, gesammelt exportiert:

```svelte
import { Button, Card, DataTable, FormField, Select } from "$lib/components/ui";
```

Eine lauffähige Übersicht aller Komponenten in hell und dunkel liegt unter
**`/dev/ui`** (nur im Entwicklungsmodus erreichbar).

| Komponente | Wofür |
|---|---|
| `PageHeader` | Seitenkopf: Titel, Unterzeile, Zurück-Link, Aktionen. Bestimmt den oberen Abstand – Seiten setzen **kein** eigenes `mt-16`. |
| `Card` | Abschnitt mit Titel, Unterzeile, Meta-Angabe, Aktionen und Fußzeile. Bei `padding="none"` behalten Kopf und Fußzeile ihren eigenen Innenabstand – sonst klebt der Titel in der Ecke. |
| `DataTable` | Aus **einer** Spaltendefinition entstehen Desktop-Tabelle *und* mobile Karten |
| `Button` | `primary`, `secondary`, `success`, `warning`, `danger`, `ghost`; Größen `sm`/`md`; `loading`, `icon`, `href` |
| `Badge` | Status-Kennzeichnung, Tonwerte wie oben |
| `StatTile` | Kennzahl mit Symbol, optional verlinkt |
| `Alert` | Rückmeldungen, insbesondere `form?.error` und `form?.success` |
| `FormField` | Label, Feld, Hinweis und Fehler – erzeugt `id`/`for` selbst |
| `TextInput` | Einzeiliges Eingabefeld |
| `Textarea` | Mehrzeiliges Eingabefeld. **Kein rohes `<textarea>` mehr** – der Klassenstring stand viermal von Hand in Routen, jedes Mal mit `rounded-xl` und ohne Fehlerzustand |
| `Select` | Auswahlfeld. **Kein rohes `<select>` mehr** – der Klassenstring war 45-fach kopiert |
| `RichTextEditor` | Formatierter Text (Quill, lokal eingebunden) |
| `Modal` | Dialog mit `role="dialog"`, Fokus-Falle, Escape und Scroll-Sperre |
| `ConfirmDialog` | Rückfrage vor zerstörenden Aktionen |
| `SearchInput` | Suchfeld mit Symbol und unsichtbarem Label |
| `EmptyState` | Leerer Zustand, `inline` für eine Zeile innerhalb einer Tabelle |
| `Pagination` | Seitenweise Navigation über URL-Parameter |
| `ThemeToggle` | Hell / Dunkel / System |
| `SkipLink` | Sprung zum Hauptinhalt |

Für die Kasse zusätzlich unter `src/lib/components/finance`:
`FinanceNav` (Bereichsleiste), `PeriodFilter` (Zeitraumwahl als GET-Formular),
`OutstandingTable` (offene Posten mit Zahlung und Storno).

### Diagramme

Unter `src/lib/components/finance/charts` (LayerChart, SVG, Svelte 5).
`ChartFrame` trägt Titel, Höhe, leeren Zustand und Beschriftung; die fünf
Diagramme darüber sind dünne Hüllen.

| Diagramm | Wofür |
|---|---|
| `MonthlyBarChart` | Erträge und Aufwendungen je Monat, gruppierte Balken |
| `BalanceLineChart` | Kontostandsverlauf eines Bankkontos |
| `SphereDonutChart` | Erträge nach steuerlichen Bereichen |
| `TopExpensesChart` | Die größten Aufwandskonten, waagerecht |
| `AgingBarChart` | Fälligkeitsstaffel der offenen Forderungen |

Drei Regeln, die ohne Ausnahme gelten:

1. **Ein Diagramm steht neben seiner Tabelle, nie statt ihr.** Ohne
   JavaScript und für einen Screenreader müssen die Zahlen vollständig
   lesbar bleiben. `ChartFrame` setzt deshalb `aria-hidden="true"` auf das
   Diagramm; die Beschriftung trägt die Tabelle.
2. **Farben kommen aus den Tokens**, nie als Hexwert:
   `var(--color-success)` für Erträge, `var(--color-danger)` für
   Aufwendungen, `var(--color-primary)` für Ergebnisse. Damit stimmt hell
   wie dunkel ohne zweite Palette. Die Zuordnung ist über alle Diagramme
   dieselbe.
3. **Eine eigene Beschriftung muss zum Diagramm passen.** Wer die Legende
   selbst zeichnet, gibt dem Diagramm dieselben Farben vor (`cRange`,
   `series[].color`) – sonst vergibt die Bibliothek eine eigene Palette und
   die Legende zeigt etwas anderes als die Fläche daneben.

Alles Gemeinsame steht in `colors.ts` und wird nicht je Diagramm neu
erfunden:

| Baustein | Wofür |
|---|---|
| `CHART_COLORS`, `CHART_SERIES`, `seriesColor()` | Semantische Zuordnung und Reihenfolge mehrerer Reihen |
| `agingColor()` | Abstufung `warning` → `danger` mit steigender Fälligkeit, über `color-mix` aus den Tokens |
| `axisEuro()`, `axisEuroCompact()` | Achsenbeschriftung; die gekürzte Fassung erst ab 10.000, weil „1.200 €“ kürzer liest als „1,2 Tsd. €“ |
| `chartTooltip()`, `tooltipEuro()` | Kurzinfo aus Tokens, damit sie hell wie dunkel lesbar bleibt |
| `CHART_GRID`, `CHART_AXIS`, `CHART_PADDING` | Dezente Gitterlinien, Achsen und Abstände |
| `charsPerBand()` | Wie viele Zeichen eine Achsenbeschriftung tragen darf |

**Höhen kommen aus `size`** (`sm` 180, `md` 240, `lg` 300), nicht aus frei
gewählten Zahlen. `ChartFrame` misst seine Breite selbst und reicht sie an das
Diagramm weiter; daraus entscheidet `charsPerBand()` für die **ganze** Achse,
ob voller Name, Kürzel oder Anfangsbuchstabe angezeigt wird. Waagerechte Balken
berechnen ihren linken Rand aus der längsten tatsächlich gezeigten
Beschriftung und deckeln ihn bei einem Drittel der Breite — sonst schneidet die
Bibliothek die Namen am Rand ab. Gekürzt wird immer nur die Achse, nie die
Daten: die Kurzinfo zeigt den vollen Namen.

Eine Farbe je Balken geht über `c` + `cDomain` + `cRange`, so wie beim Ring.
Die Reihe darf dann **keine** eigene `color` tragen (`Bars.base` wertet
`fill ?? series.color ?? cGet(d)` aus, die Reihenfarbe gewänne sonst), und
`seriesLayout="overlap"` verhindert, dass `"auto"` bei ordinalem `c` stapelt.

---

## 5. Seitenaufbau

```svelte
<script lang="ts">
    import { Alert, Button, Card, PageHeader } from "$lib/components/ui";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<div class="space-y-8">
    <PageHeader title="Seitentitel" eyebrow="Bereich" subtitle="Kurze Beschreibung.">
        {#snippet actions()}
            <Button variant="primary" icon="plus-circle">Primäre Aktion</Button>
        {/snippet}
    </PageHeader>

    {#if form?.error}<Alert tone="danger" message={form.error} />{/if}
    {#if form?.success}<Alert tone="success" message={form.success} />{/if}

    <Card title="Abschnitt">
        <!-- Inhalt -->
    </Card>
</div>
```

Breite und Außenabstand kommen aus dem Layout (`max-w-6xl`) und `PageHeader`.

---

## 6. Sprache und Namen

**Korrektes Deutsch mit Umlauten.** „Zurück“, „Ämter“, „Geschäftsjahr“,
„Größe“, „Kämmerer“. `.editorconfig` erzwingt UTF-8.

ASCII bleibt verbindlich für: URLs, Verzeichnisnamen von Routen,
Berechtigungsschlüssel, Bezeichner im Quelltext und Spaltennamen in der
Datenbank.

**Der Name des Stamms steht nirgends im Quelltext.** Er kommt aus den
Organisationseinstellungen und steht auf jeder Seite als
`data.organization` bzw. `page.data.organization` zur Verfügung. Dasselbe gilt
für Logo, Impressum, Datenschutz und Instagram.

Beträge immer über `formatEuro()` aus `$lib/money` – Geld wird als ganzzahlige
**Cents** geführt, nie als Fließkommazahl. Datum über `formatDate()`.

---

## 7. Barrierefreiheit

- Jedes Eingabefeld über `FormField` – das verknüpft Label und Feld.
- Symbolschaltflächen brauchen `ariaLabel`, schmückende Symbole `aria-hidden="true"`.
- Sichtbarer Fokusrahmen ist global gesetzt und darf nicht entfernt werden.
- Zerstörende Aktionen nur mit `ConfirmDialog`.
- Tabellen über `DataTable` (liefert `scope="col"` und Beschriftung mit).
- Rückmeldungen über `Alert` bzw. Toasts, nicht nur über Farbe.
- Diagramme sind `aria-hidden`; daneben steht immer eine Tabelle mit
  denselben Zahlen und einer `<caption>`.

---

## 8. Responsives Verhalten

- `DataTable` schaltet bei `xl` zwischen Tabelle und Karten um – von Hand
  gebaute Tabellen sind nicht erwünscht.
- Breite Tabellen, die sich nicht als Karten abbilden lassen (Buchungssatz,
  Kontenblatt), stehen in einem eigenen `overflow-x-auto`-Behälter mit
  `min-w-[…]`. **Der Seiteninhalt selbst scrollt nie waagerecht.**
- Kopfzeilen laufen um (`flex-wrap gap-4`), Schaltflächen auf schmalen
  Displays über die volle Breite.
- Raster: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`; Formulare einspaltig,
  ab `md` zweispaltig.
- Geprüft wird bei 375, 768, 1280 und 1920 Pixeln, jeweils hell und dunkel.

---

## 9. Rechte und Freigaben in der Oberfläche

Rechte gelten **stammesweit oder für einzelne Gruppen**. Für die Oberfläche
folgt daraus zweierlei:

- **`page.data.permissions` reicht nicht für Schaltflächen.** Dort stehen nur
  die stammesweiten Rechte. Wer `members.edit` allein für die Meute hat,
  taucht darin nicht auf, darf deren Mitglieder aber bearbeiten. Der Server
  entscheidet deshalb je Datensatz und schickt das Ergebnis mit
  (`canEdit`, `editableGroups`), statt die Seite raten zu lassen.
- **Die Navigation zählt großzügiger.** Ein Menüpunkt ist keine Absicherung;
  er erscheint, sobald ein Recht *irgendwo* vorliegt (`navPermissions`). Die
  Seite dahinter zeigt dann nur, was erlaubt ist.

Freigaben von Ordnern und Terminen gehen an **Gruppen, Ämter, Rollen oder
einzelne Personen**. Die vier Arten werden immer gleich beschriftet und mit
demselben Symbol gezeigt (`SHARE_TARGET_LABELS`, `SHARE_TARGET_ICONS` in
`shareService.ts`).

---

## 10. Rückmeldungen

- **Immer** `form?.error` und `form?.success` anzeigen. Fehlt das, wirkt ein
  fehlgeschlagenes Formular so, als passiere nichts.
- `use:enhance` mit `loading` an der Schaltfläche für Ladezustände.
- Toasts (`addToast`) für Rückmeldungen nach clientseitigen Aktionen.
- Z-Index-Ordnung: Inhalt 0, Kopfzeile 30, Menü-Overlay 40, Menü 50,
  Dialog 60, Toasts 70.

---

## 11. Prüfliste für neue Seiten

- [ ] Svelte-5-Runes (`$props`, `$state`, `$derived`), kein `export let`, kein `on:click`
- [ ] `import type { ActionData, PageData } from "./$types"`
- [ ] Kein `export const csr = false`
- [ ] Komponenten statt kopierter Klassenstrings, `Select` statt rohem `<select>`,
      `Textarea` statt rohem `<textarea>`
- [ ] Ausschließlich semantische Farb-Tokens
- [ ] `rounded-card` / `rounded-control` statt `rounded-xl`
- [ ] Beträge mit `tabular-figures`
- [ ] `form?.error` und `form?.success` sichtbar
- [ ] Jede Server-Aktion mit `requirePermission` abgesichert
      (ein `load`-Guard schützt Aktionen **nicht**)
- [ ] Anzeigebedingungen über `matchesPermission`, nie über `Array.includes`
- [ ] Gruppenbezogene Rechte über die Guards aus `permissionGuard.ts`
      (`requirePermissionForGroup`, `groupsWithPermission`) – nie von Hand
- [ ] Schaltflächen je Datensatz aus Server-Angaben, nicht aus `permissions`
- [ ] Jedes Diagramm mit `aria-hidden` und einer Tabelle daneben
- [ ] Beträge über `formatEuro`, Datum über `formatDate`
- [ ] Name des Stamms aus `organization`, nicht aus dem Quelltext
- [ ] Deutsch mit Umlauten
- [ ] In hell und dunkel geprüft, Tastaturbedienung durchgespielt
