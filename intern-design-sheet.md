# Intern UI Design Sheet (Template)

Ableitung aus den Finance-Screens (`/intern/finance`, `/intern/finance/outstanding`, `/intern/finance/fiscal-years/[id]`) als Vorgabe fuer den gesamten internen Bereich.

## Kernprinzipien
- Ruhige Verwaltungs-UI: viel White-Space (`max-w-6xl`, `space-y-8`), klare Kanten (`rounded-2xl`, `border-gray-200`, `shadow-sm`).
- Farbrollen klar trennen: Blau/Sky fuer Navigation & Primaer, Emerald fuer Erfolg, Amber fuer Warnung/Offen, Rot fuer Abgang, Grau als Basis.
- Texte sachlich, deutsch ohne Umlaute (Uebersicht, Zurueck, Geschaeftsjahr). Zahlen/Betraege immer fett + `EUR`.
- Tabellen- und Formular-zentriert; Icons ueber Bootstrap Icons (`bi ...`), in Buttons mit `gap-2`.
- Mobile-first: Flex/Wrap im Kopf, `overflow-x-auto` fuer Tabellen.

## Farb- und Typostil (Tailwind Tokens)
- Basis: Hintergrund `bg-white`, Kartenrand `border-gray-200`, Kopfzeile `bg-gray-50`, Schrift `text-gray-900/700/600`.
- Primaer: `bg-blue-600 hover:bg-blue-700 text-white`; Links/Light-CTA `text-blue-700 bg-blue-50 border-blue-200`.
- Info/Highlight: Sky (`bg-sky-50 to-white`, Tags `bg-sky-100 border-sky-200 text-sky-800`).
- Erfolg: Emerald (`bg-emerald-50 border-emerald-200 text-emerald-700`).
- Warnung: Amber (`text-amber-600`), Gefahr: Rot (`text-red-500/600`).
- Typo-Hierarchie: H1 `text-3xl-4xl font-bold`, H2 `text-xl font-semibold`, Sektionen/Meta `text-sm text-gray-600`, Table-Head `text-xs font-semibold uppercase tracking-wide`, Body `text-sm`.

## Layout-Skelett
- Seite: `<div class="max-w-6xl mx-auto mt-16 space-y-8">`.
- Kopfzeile: Linke Spalte Titel + Unterzeile, rechts CTAs / Filter; `flex items-center justify-between flex-wrap gap-4`.
- Raster: Hero/Stats `grid grid-cols-1 lg:grid-cols-3` mit 2/1 Split; Karten `p-5/6`, `space-y-3/4`. CTA-Kachel nutzt `hover:border-amber-200 hover:shadow`.
- Tabellen-Wrapper: `overflow-x-auto`; Tabelle `divide-y divide-gray-200`, Kopf `bg-gray-50`, Zeilenhover `hover:bg-gray-50`.
- Badges: `text-[11px] font-semibold rounded-full border px-2 py-0.5` (z.B. aktuelles Jahr in Sky).

## Komponentenrezepte
- Primaer-Button: `inline-flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-sm transition`.
- Neutral/Sekundaer: `bg-white hover:bg-gray-50 border border-gray-200 text-gray-800 rounded-xl shadow-sm`.
- Erfolg (Hat bezahlt / OK): `text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg`.
- Warn-CTA/Offen: Zahl in `text-amber-600`; Karten mit Amber-Hover-Rand.
- Inputs/Suche: `rounded-xl text-sm border border-gray-300 bg-white shadow-sm px-4 py-3 focus:ring-2 focus:ring-sky-200 focus:border-sky-300` (Forms auch `rounded-lg px-3 py-2`).
- Tabellenzelle: Body `text-sm`, Zahlen fett; Zusatzinfo `text-xs text-gray-500` unter der Zeile.
- Modals: Overlay `fixed inset-0 bg-black/50 backdrop-blur-sm flex center z-50 px-4`; Card `bg-white rounded-2xl border-gray-200 shadow-2xl max-w-lg w-full`, Header mit Titel + Close, Body `space-y-4`, Footer Buttons rechts.
- Dropdown (custom): Button mit Border+Shadow; Liste `absolute z-10 w-full bg-white border border-gray-300 rounded-lg mt-1 shadow`; Close-on-click-outside via `onMount` Listener.
- Tags/Counter: `px-3 py-1 text-xs font-semibold rounded-full border` (z.B. `text-sky-800 bg-sky-100`).
- Buttons/Aktionen: CTA-Block rechts im Kopf (`flex items-center gap-3 flex-wrap`), Primaer rechts aussen, Sekundaer links daneben; Zurueck-Link als neutraler Button links vor den CTAs. Karten-Footer-Buttons rechtsbuendig ausrichten.
- Toasts: globaler Container oben rechts; Farbrollen wie Status (Success = Emerald, Error = Rot, Info = Blau); Icon + kurzer Text; Auto-Dismiss ~4s, Close-Button rechts.

## Interaktionsmuster
- Suche/Filter: `search.trim().toLowerCase()`; Match ueber zusammengesetzten String aus Titel/Typ/Note/Betrag; Ergebnislisten + Counts reaktiv ableiten (`filteredItems`, `filteredTransactions`).
- Sortierung: Datum desc bei Transaktionen (`new Date(...).getTime()`), Gruppierungen (z.B. Outstanding nach Jahr).
- Waehrung: Helper `const euro = (v:number) => `${v.toFixed(2)} EUR`;` immer 2 Nachkommastellen.
- Statusfarben in Tabellen: aktuelles Jahr `bg-sky-50/70 ring-1 ring-sky-200`, Archiv `bg-gray-50 text-gray-500`.
- Modals: Body-Scroll sperren und wiederherstellen (`document.body.style.overflow`).
- Forms: klassisches `<form method="post" action="?...">`; versteckte Inputs fuer IDs; Primaer-Button rechts.
- CTA-Positionierung: In Seitenkopf immer rechts neben dem Titelbereich; auf Mobile umbrechen, Reihenfolge beibehalten. Innerhalb von Karten stehen Aktionen oben rechts oder unten rechts, nie mittig.
- Kopf-Leiste: Zurueck-Button (neutral) + Primaer-CTA mit Icon+Label; Abstaende `gap-2/3`, Buttons `px-4 py-3 rounded-xl`.

## Responsive Leitplanken
- Breakpoint-Policy: Tabellen erst ab `xl`; darunter Karten-/Stack-Ansicht beibehalten (`hidden xl:block` fuer Tabellen, `xl:hidden` fuer Cards), damit iPad quer + kleine Laptops nicht ueberlaufen.
- Kopfzeilen: immer `flex-wrap gap-4`; Buttons/Suchen auf Mobile vollbreit (`w-full sm:w-auto`), Suchfelder max `w-60` nur auf grossen Screens.
- Grids: Stats `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`; Formulare einspaltig, erst ab `md`/`lg` zweispaltig.
- Karteninhalte: Werte in kleinen Kacheln (`grid grid-cols-2 gap-2`) statt Spalten; Aktionen rechtsbuendig, aber untereinander stapelbar.
- Sidebar: desktop einklappbar (Content nutzt volle Breite), mobile Drawer; keine horizontale Scroll auf Content.

## Beispiel-Skeleton (Svelte)
```svelte
<script lang="ts">
  export let data;
  const euro = (v:number) => `${v.toFixed(2)} EUR`;
  let search = "";
</script>

<div class="max-w-6xl mx-auto mt-16 space-y-8">
  <div class="flex items-center justify-between flex-wrap gap-4">
    <div>
      <h1 class="text-4xl font-bold text-gray-900">Seitentitel</h1>
      <p class="text-sm text-gray-600 mt-1">Kurze Beschreibung.</p>
    </div>
    <div class="flex items-center gap-3 flex-wrap">
      <input type="search" placeholder="Suchen..." bind:value={search}
        class="w-60 px-4 py-3 rounded-xl text-sm border border-gray-300 bg-white shadow-sm focus:ring-2 focus:ring-sky-200 focus:border-sky-300" />
      <a href="#" class="inline-flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition">
        <span class="bi bi-plus-circle"></span>
        Primaere Aktion
      </a>
    </div>
  </div>

  <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold text-gray-900">Sektionstitel</h2>
      <span class="text-sm text-gray-500">Meta</span>
    </div>
    <!-- Tabelle/Liste/Stats hier -->
  </div>
</div>
```

## Navigation & Seitenmuster
- Zurueck-Link als neutraler Button links vom CTA-Block im Kopf oder oben links in Karten.
- Haupt-CTA immer rechts vom Titel; bei zwei Aktionen: Primaer rechts, Neutral links davon.
- Stats/Meta-Blenden als kompakte Karten (Einnahmen/Ausgaben/Saldo) mit passenden Farben.
- Empty States: einzeilige Info in grau innerhalb der Tabelle/Karte; kein separates Fullscreen-Empty.

## Feedback & Status
- Erfolg: Emerald-Button/Text; Fehlermeldungen als `text-red-600` unter Input oder `bg-red-50 border-red-200` Box.
- Warnung/Offen: Amber-Zahlen oder -Icon, nicht als Vollflaeche.
- Ladeindikator: minimal (z.B. `opacity-50 pointer-events-none` + Spinner-Icon in Button falls noetig).

## Barrierefreiheit & Motion
- Fokus: immer sichtbarer Ring (`focus:ring-2 focus:ring-blue-500` bzw. Sky/Emerald je Kontext).
- Motion sparsam: Button-`transition` fuer Farbe/Schatten; keine wilden Animations.
- Icons nur als Zusaetze, nie allein fuer Information.

## Checkliste fuer neue interne Screens
- Nutze das Seiten-Skelett (`max-w-6xl`, `space-y-8`, Kopf mit CTA rechts`).
- Wende Farbrollen strikt an: Blau = primaer, Emerald = Erfolg, Amber = offen/warnend, Grau = sekundar, Rot = Fehler/Abgang.
- Tabellen mit Kopf, Hover-State, Empty-Zeile und `overflow-x-auto`.
- Betrags- und Zahlenausgabe ueber `euro()`/fette Zahlen; Meta in `text-xs text-gray-500`.
- Modals mit Body-Scroll-Lock, Buttons rechtsbuendig; Eingabefelder mit klaren Fokus-Ringen.
- Zaehler/Badges fuer Anzahl Treffer/Items anzeigen; aktuelle Kontexte markieren (z.B. aktuelles Jahr Tag).
- Button-Abstaende: horizontal `gap-3` in Leisten, vertikal `mt-4` unter Formulargruppen; immer Icon+Label bei Listen-Header-CTAs.
