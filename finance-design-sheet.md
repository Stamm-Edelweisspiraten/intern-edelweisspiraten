# Finance Design Sheet (intern/finance)

## Leitidee
- Verwaltungs-UI mit ruhigem White-Space: `max-w-6xl`, `mt-16`, grosse `space-y`-Abstaende, Karten mit `rounded-2xl`, `border border-gray-200`, `shadow-sm`.
- Primarer Farbkanal Blau/Sky fuer Navigation und primaere CTAs; Statusfarben: Gruen/Emerald fuer Erfolg, Rot fuer Abgang, Amber fuer offene Posten, Grautoene fuer Grundrauschen.
- Tabellenzentrierter Inhalt, ergaenzt durch kompakte Stat-Karten und Sektionen mit klaren Ueberschriften.
- Bootstrap Icons (`bi ...`) als Inline-Icons mit `gap-2` in Buttons oder Labels.
- Textton sachlich/klar, deutsche Begriffe ohne Umlaute (Geschaeftsjahr, Uebersicht, Zurueck, Hat bezahlt).

## Farb- und Typostil (Tailwind Tokens)
- Hintergrund: `bg-white`, Karten-Rand `border-gray-200`, Tabellenkopf `bg-gray-50`, Grautext `text-gray-600/700`, Titel `text-gray-900`.
- Primaer: `bg-blue-600 hover:bg-blue-700 text-white`; Alternative Link-CTA: `text-blue-700 bg-blue-50 border-blue-200`.
- Info/Sekundaer: Sky fuer Highlights (`bg-sky-50 to-white`, Tags `bg-sky-100 border-sky-200 text-sky-800`).
- Warnung: Amber (`text-amber-600`) fuer offene Betraege.
- Erfolg: Emerald (`bg-emerald-50 border-emerald-200 text-emerald-700`).
- Gefahr/Abgang: Rot (`text-red-500/600`).
- Schrift-Hierarchie: H1 `text-3xl-4xl font-bold`, Sektionen `text-xl font-semibold`, Tabellenkopf `text-xs font-semibold uppercase tracking-wide`, Body `text-sm`.

## Layout- und Strukturmuster
- Seitenkopf: Titel + Kurzbeschreibung links, CTA(s) rechts; `flex` mit `gap-4` und Wrap fuer Mobile.
- Raster: `grid grid-cols-1 lg:grid-cols-3` fuer Hero/Stats, mit 2/1 Split bei Hauptkarte + CTA-Kachel.
- Karten: `p-5/6` innen, `space-y-4`; alternative weiche Flaeche via `bg-gradient-to-br from-sky-50 to-white` fuer Hero.
- Tabellen: `overflow-x-auto` Container; Tabelle mit `divide-y divide-gray-200`, Kopf `bg-gray-50`, Zeilen Hover `hover:bg-gray-50`; leere Zustaende als einzelne Zeile mit grauem Text.
- Badges/Pills: kleine Caps `text-[11px] font-semibold`, runde Form (`rounded-full`) mit Border (z.B. Aktuelles Jahr Tag `bg-sky-100 border-sky-200 text-sky-800`).
- Abstaende: `gap-3/4/6`, Buttons `px-4 py-3` (gross) oder `px-3 py-2` (kompakt), Inputs `px-3/4 py-2/3` mit `rounded-lg/xl`.

## Komponentenrezepturen
- Primaer-Button: `inline-flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-sm transition`.
- Sekundaer/Neutral: `bg-white hover:bg-gray-50 border border-gray-200 text-gray-800 rounded-xl shadow-sm`.
- Erfolg ("Hat bezahlt"): `text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg`.
- Warnung/CTA-Kachel: Zahl in `text-amber-600`, Kachel mit `hover:border-amber-200 hover:shadow`.
- Sucheingabe: `w-60 px-4 py-3 rounded-xl text-sm border border-gray-300 bg-white shadow-sm focus:ring-2 focus:ring-sky-200 focus:border-sky-300`.
- Tabellenzellen: Text `text-sm`, Zahlen fett; Zusatzinfos in `text-xs text-gray-500` unter Hauptzeile.
- Modals: Overlay `fixed inset-0 bg-black/50 backdrop-blur-sm flex center z-50 px-4`; Card `bg-white rounded-2xl border-gray-200 shadow-2xl max-w-lg w-full`, Header mit Titel + Close, Body `space-y-4`, Footer Buttons rechts.
- Formfelder: `border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500` (oder Emerald in Zahlungsmodals); Labels `text-sm font-semibold text-gray-700`.
- Dropdown (custom): Button mit Border + Shadow; Liste `absolute z-10 w-full bg-white border border-gray-300 rounded-lg mt-1 shadow`; Close-on-click-outside via Svelte `onMount` listener.
- Tags fuer Counters: `px-3 py-1 text-xs font-semibold rounded-full border` (z.B. `text-sky-800 bg-sky-100`).

## Interaktionsmuster
- Filter: Clientseitig via `search.trim().toLowerCase()`, Match ueber zusammengesetzten String aus Titel/Typ/Note/Betrag; Ergebnislisten und Counts aktualisieren sich reaktiv (`filteredItems`, `filteredTransactions`).
- Sortierung: Transaktionen nach Datum desc (`new Date(...).getTime()`), Outstanding nach Jahr gruppiert.
- Waehrungsformat: helper `const euro = (value:number) => `${value.toFixed(2)} EUR`; immer 2 Nachkommastellen.
- Statusfarben in Tabellenzeilen: aktuelles Jahr mit `bg-sky-50/70 ring-1 ring-sky-200`, archivierte in `bg-gray-50 text-gray-500`.
- Scroll-Lock bei Modals: Body-Overflow sichern und beim Schliessen wiederherstellen (`document.body.style.overflow`).
- Form-Submit: klassische `<form method="post" action="?...">` Buttons, versteckte Inputs fuer IDs.

## Textbausteine
- CTA-Texte: "Neues Geschaeftsjahr", "Transaktion", "Hat bezahlt", "Offene Rechnung".
- Hilfetexte kurz halten: "Offene Positionen aus allen aktiven Geschaeftsjahren." / "Keine offenen Einnahmen hinterlegt." / "Keine passenden Transaktionen gefunden.".
- Nummern immer fett, Einheiten in EUR ausschreiben.

## Svelte-Grundgeruest fuer neue Finance-Seiten
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

## Wann welches Farbschema
- Geld-Eingaenge/OK-Aktionen: Gruen/Emerald (Buttons, Icons).
- Offene/warnende Infos: Amber-Ton fuer Zahlen oder Icons.
- Navigation/Standard-CTA: Blau/Sky.
- Archiv/sekundaer: Grautoene, keine intensiven Hintergruende.

## Checkliste bei neuen Screens
- Nutze `max-w-6xl` + `space-y-8` fuer vertikale Rhythmik.
- Primaere Aktion rechts im Kopf; Rueck-Link als neutraler Button oder Link.
- Tabellen immer mit Kopfzeile, Hover-State und Empty-State-Zeile.
- Betragsfelder/Anzeigen immer ueber `euro()` formatieren.
- Bei Modals Body-Scroll sperren, Buttons rechtsbuendig, Inputs mit Fokus-Ring.
- Zaehler/Badges fuer Anzahl Eintraege oder Filterergebnisse anzeigen.
