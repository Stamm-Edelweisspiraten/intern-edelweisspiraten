# Design-Leitfaden – Interner Bereich

Verbindliche Vorgabe für alle Seiten unter `/intern`, `/login`, `/join`,
`/password` und `/setup`.

> **Wichtigste Änderung gegenüber der früheren Fassung:** Dieses Blatt
> beschreibt keine kopierbaren Klassenstrings mehr, sondern **Komponenten**.
> Wer eine Karte braucht, schreibt `<Card>` – nicht
> `bg-white border border-gray-200 rounded-2xl shadow-sm`. Rohe Paletten-
> Klassen sind ausdrücklich unerwünscht, weil sie den Dunkelmodus brechen.

---

## 1. Farben: nur semantische Tokens

Farben stehen als CSS-Variablen in `src/routes/layout.css` und sind als
Tailwind-Utilities verfügbar. Sie werden im Dunkelmodus neu belegt – deshalb
funktioniert das Umschalten, ohne eine einzige Seite anzufassen.

| Zweck | Utility | Beispiel |
|---|---|---|
| Kartenfläche | `bg-surface` | Karten, Dialoge, Eingabefelder |
| Ruhige Fläche | `bg-surface-muted` | Tabellenkopf, Seitenhintergrund |
| Rahmen | `border-border`, `border-border-strong` | Karten bzw. Eingabefelder |
| Text | `text-fg`, `text-fg-muted`, `text-fg-subtle` | Haupttext, Nebentext, Hinweise |
| Primär | `bg-primary`, `text-primary`, `text-primary-fg` | Hauptaktionen, Navigation |
| Erfolg | `text-success`, `bg-success-soft`, `text-success-soft-fg` | Einnahmen, „bezahlt“ |
| Warnung | `text-warning`, `bg-warning-soft`, … | offene Posten, Hinweise |
| Gefahr | `text-danger`, `bg-danger-soft`, … | Ausgaben, Löschen, Fehler |
| Info | `text-info`, `bg-info-soft`, … | neutrale Hervorhebungen |

**Nicht verwenden:** `bg-white`, `bg-gray-50`, `text-gray-900`,
`border-gray-200`, `bg-blue-600`, `text-emerald-700` und alle weiteren rohen
Paletten-Klassen. Sie sind im Dunkelmodus unlesbar.

`text-fg-subtle` entspricht `gray-500`, nicht `gray-400` – letzteres verfehlte
mit rund 2,8:1 die Kontrastanforderung.

---

## 2. Komponenten

Alle unter `src/lib/components/ui`, gesammelt exportiert:

```svelte
import { Button, Card, DataTable, FormField } from "$lib/components/ui";
```

Eine lauffähige Übersicht aller Komponenten in hell und dunkel liegt unter
**`/dev/ui`** (nur im Entwicklungsmodus erreichbar).

| Komponente | Wofür |
|---|---|
| `PageHeader` | Seitenkopf: Titel, Unterzeile, Zurück-Link, Aktionen. Bestimmt den oberen Abstand – Seiten setzen **kein** eigenes `mt-16`. |
| `Card` | Abschnitt mit Titel, Unterzeile, Meta-Angabe, Aktionen und Fußzeile |
| `DataTable` | Aus **einer** Spaltendefinition entstehen Desktop-Tabelle *und* mobile Karten |
| `Button` | `primary`, `secondary`, `success`, `warning`, `danger`, `ghost`; Größen `sm`/`md`; `loading`, `icon`, `href` |
| `Badge` | Status-Kennzeichnung, Tonwerte wie oben |
| `StatTile` | Kennzahl mit Symbol, optional verlinkt |
| `Alert` | Rückmeldungen, insbesondere `form?.error` und `form?.success` |
| `FormField` | Label, Feld, Hinweis und Fehler – erzeugt `id`/`for` selbst |
| `TextInput` | Einzeiliges Eingabefeld |
| `RichTextEditor` | Formatierter Text (Quill, lokal eingebunden) |
| `Modal` | Dialog mit `role="dialog"`, Fokus-Falle, Escape und Scroll-Sperre |
| `ConfirmDialog` | Rückfrage vor zerstörenden Aktionen |
| `SearchInput` | Suchfeld mit Symbol und unsichtbarem Label |
| `EmptyState` | Leerer Zustand, `inline` für eine Zeile innerhalb einer Tabelle |
| `Pagination` | Seitenweise Navigation über URL-Parameter |
| `ThemeToggle` | Hell / Dunkel / System |
| `SkipLink` | Sprung zum Hauptinhalt |

---

## 3. Seitenaufbau

```svelte
<script lang="ts">
    import { Button, Card, PageHeader } from "$lib/components/ui";
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

## 4. Sprache

**Korrektes Deutsch mit Umlauten.** „Zurück“, „Ämter“, „Geschäftsjahr“,
„Größe“, „Kämmerer“. Die frühere Vorgabe, Umlaute zu vermeiden, war eine
Notlösung gegen Zeichensatzprobleme und ist aufgehoben – `.editorconfig`
erzwingt UTF-8.

ASCII bleibt verbindlich für: URLs, Verzeichnisnamen von Routen,
Berechtigungsschlüssel, Bezeichner im Quelltext und Feldnamen in der Datenbank.

Beträge immer über `formatEuro()` aus `$lib/money` – Geld wird als ganzzahlige
**Cents** geführt, nie als Fließkommazahl.

---

## 5. Barrierefreiheit

- Jedes Eingabefeld über `FormField` – das verknüpft Label und Feld.
- Symbolschaltflächen brauchen `ariaLabel`, schmückende Symbole `aria-hidden="true"`.
- Sichtbarer Fokusrahmen ist global gesetzt und darf nicht entfernt werden.
- Zerstörende Aktionen nur mit `ConfirmDialog`.
- Tabellen über `DataTable` (liefert `scope="col"` und Beschriftung mit).
- Rückmeldungen über `Alert` bzw. Toasts, nicht nur über Farbe.

---

## 6. Responsives Verhalten

- `DataTable` schaltet bei `xl` zwischen Tabelle und Karten um – von Hand
  gebaute Tabellen sind nicht erwünscht.
- Kopfzeilen laufen um (`flex-wrap gap-4`), Schaltflächen auf schmalen
  Displays über die volle Breite.
- Raster: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`; Formulare einspaltig,
  ab `md` zweispaltig.
- Kein waagerechtes Scrollen des Seiteninhalts.
- Geprüft wird bei 375, 768, 1280 und 1920 Pixeln, jeweils hell und dunkel.

---

## 7. Rückmeldungen

- **Immer** `form?.error` und `form?.success` anzeigen. Fehlt das, wirkt ein
  fehlgeschlagenes Formular so, als passiere nichts.
- `use:enhance` mit `loading` an der Schaltfläche für Ladezustände.
- Toasts (`addToast`) für Rückmeldungen nach clientseitigen Aktionen.
- Z-Index-Ordnung: Inhalt 0, Kopfzeile 30, Menü-Overlay 40, Menü 50,
  Dialog 60, Toasts 70.

---

## 8. Prüfliste für neue Seiten

- [ ] Svelte-5-Runes (`$props`, `$state`, `$derived`), kein `export let`, kein `on:click`
- [ ] `import type { ActionData, PageData } from "./$types"`
- [ ] Kein `export const csr = false`
- [ ] Komponenten statt kopierter Klassenstrings
- [ ] Ausschließlich semantische Farb-Tokens
- [ ] `form?.error` und `form?.success` sichtbar
- [ ] Jede Server-Aktion mit `requirePermission` abgesichert
  (ein `load`-Guard schützt Aktionen **nicht**)
- [ ] Beträge über `formatEuro`, Datum über `formatDate`
- [ ] Deutsch mit Umlauten
- [ ] In hell und dunkel geprüft, Tastaturbedienung durchgespielt
