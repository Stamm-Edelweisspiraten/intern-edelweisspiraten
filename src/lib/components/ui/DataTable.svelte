<script lang="ts" generics="Row">
    import type { Snippet } from "svelte";
    import type { Column } from "./types";

    /**
     * Rendert aus EINER Spaltendefinition sowohl die Desktop-Tabelle als auch
     * die mobile Kartenansicht.
     *
     * Bisher war beides in 13 Seiten von Hand doppelt geschrieben
     * (hidden xl:block / xl:hidden), was jede Listenseite verdoppelt hat und
     * bei einer Tabelle schlicht vergessen wurde -- die haengt seitdem mit
     * min-w-[800px] im horizontalen Scroll.
     *
     * Mit `selectable` kommt eine Auswahlspalte dazu. Sie steht bewusst hier
     * und nicht in den Seiten: Mitgliederliste und Dateimanager brauchen
     * dieselbe Mehrfachauswahl, und eine zweite Tabelle daneben waere genau
     * der Zustand, den diese Komponente aufgeloest hat. Die Auswahl gilt fuer
     * beide Darstellungen gemeinsam.
     */

    interface Props {
        columns: Column<Row>[];
        rows: Row[];
        getKey: (row: Row) => string;
        empty?: string;
        /** Titelzeile der mobilen Karte. */
        cardTitle?: (row: Row) => string;
        cardSubtitle?: (row: Row) => string | undefined;
        rowHref?: (row: Row) => string | undefined;
        rowClass?: (row: Row) => string;
        actions?: Snippet<[Row]>;
        caption?: string;
        /** Blendet die Auswahlspalte ein. */
        selectable?: boolean;
        /** Ausgewaehlte Schluessel; zweiseitig gebunden. */
        selected?: string[];
        /** Beschriftung des Kontrollkaestchens fuer Screenreader. */
        selectLabel?: (row: Row) => string;
        /** Zeilen, die nicht ausgewaehlt werden duerfen (etwa ohne Recht). */
        selectDisabled?: (row: Row) => boolean;
    }

    let {
        columns,
        rows,
        getKey,
        empty = "Keine Einträge vorhanden.",
        cardTitle,
        cardSubtitle,
        rowHref,
        rowClass,
        actions,
        caption,
        selectable = false,
        selected = $bindable([]),
        selectLabel,
        selectDisabled
    }: Props = $props();

    const tableColumns = $derived(columns.filter((c) => !c.hideOnTable));
    const cardColumns = $derived(columns.filter((c) => !c.hideOnCard));

    const ALIGN = { left: "text-left", right: "text-right", center: "text-center" } as const;

    const CHECKBOX_CLASS = "rounded-control border-border-strong text-primary focus:ring-primary";

    /** Auswaehlbare Zeilen -- nur sie zaehlen fuer "alle auswaehlen". */
    const selectableKeys = $derived(rows.filter((row) => !selectDisabled?.(row)).map(getKey));

    const allSelected = $derived(
        selectableKeys.length > 0 && selectableKeys.every((key) => selected.includes(key))
    );
    const someSelected = $derived(
        !allSelected && selectableKeys.some((key) => selected.includes(key))
    );

    function isSelected(row: Row): boolean {
        return selected.includes(getKey(row));
    }

    function toggle(row: Row, checked: boolean): void {
        const key = getKey(row);
        // Neues Array statt push -- sonst bemerkt $bindable die Aenderung nicht.
        selected = checked ? [...new Set([...selected, key])] : selected.filter((k) => k !== key);
    }

    /**
     * "Alle sichtbaren" meint wirklich nur die sichtbaren. Eine Auswahl aus
     * einem anderen Filterstand bleibt erhalten, sonst verliert man sie beim
     * Umschalten des Filters.
     */
    function toggleAll(checked: boolean): void {
        selected = checked
            ? [...new Set([...selected, ...selectableKeys])]
            : selected.filter((key) => !selectableKeys.includes(key));
    }

    function display(column: Column<Row>, row: Row): string {
        const raw = column.value?.(row);
        return raw === null || raw === undefined || raw === "" ? "–" : String(raw);
    }
</script>

<!-- Desktop: Tabelle ab xl, entsprechend der Vorgabe im Design-Sheet -->
<div class="hidden xl:block overflow-x-auto">
    <table class="w-full">
        {#if caption}
            <caption class="sr-only">{caption}</caption>
        {/if}
        <thead class="bg-surface-sunken border-b border-border">
            <tr>
                {#if selectable}
                    <th scope="col" class="px-4 py-2.5 w-10 text-left">
                        <input
                            type="checkbox"
                            class={CHECKBOX_CLASS}
                            checked={allSelected}
                            indeterminate={someSelected}
                            disabled={selectableKeys.length === 0}
                            aria-label="Alle sichtbaren Einträge auswählen"
                            onchange={(event) => toggleAll(event.currentTarget.checked)}
                        />
                    </th>
                {/if}
                {#each tableColumns as column (column.key)}
                    <th
                        scope="col"
                        style={column.width ? `width:${column.width}` : undefined}
                        class={`px-4 py-2.5 text-xs font-semibold text-fg-muted uppercase tracking-wide ${ALIGN[column.align ?? "left"]}`}
                    >
                        {column.label}
                    </th>
                {/each}
                {#if actions}
                    <th scope="col" class="px-4 py-2.5 text-right text-xs font-semibold text-fg-muted uppercase tracking-wide">
                        Aktionen
                    </th>
                {/if}
            </tr>
        </thead>
        <tbody class="divide-y divide-border">
            {#if rows.length === 0}
                <tr>
                    <td
                        colspan={tableColumns.length + (actions ? 1 : 0) + (selectable ? 1 : 0)}
                        class="px-4 py-8 text-center text-sm text-fg-subtle"
                    >
                        {empty}
                    </td>
                </tr>
            {:else}
                {#each rows as row (getKey(row))}
                    <tr
                        class={`hover:bg-surface-muted transition ${isSelected(row) ? "bg-primary-soft" : ""} ${rowClass?.(row) ?? ""}`}
                    >
                        {#if selectable}
                            <td class="px-4 py-2.5">
                                <input
                                    type="checkbox"
                                    class={CHECKBOX_CLASS}
                                    checked={isSelected(row)}
                                    disabled={selectDisabled?.(row)}
                                    aria-label={selectLabel?.(row) ?? "Eintrag auswählen"}
                                    onchange={(event) => toggle(row, event.currentTarget.checked)}
                                />
                            </td>
                        {/if}
                        {#each tableColumns as column (column.key)}
                            <td class={`px-4 py-2.5 text-sm text-fg ${ALIGN[column.align ?? "left"]}`}>
                                {#if column.cell}
                                    {@render column.cell(row)}
                                {:else if rowHref?.(row) && column === tableColumns[0]}
                                    <a href={rowHref(row)} class="font-semibold hover:text-primary transition">
                                        {display(column, row)}
                                    </a>
                                {:else}
                                    {display(column, row)}
                                {/if}
                            </td>
                        {/each}
                        {#if actions}
                            <td class="px-4 py-2.5 text-right">
                                <div class="inline-flex items-center gap-2 justify-end flex-wrap">
                                    {@render actions(row)}
                                </div>
                            </td>
                        {/if}
                    </tr>
                {/each}
            {/if}
        </tbody>
    </table>
</div>

<!-- Mobil und Tablet: Karten statt Tabelle -->
<div class="xl:hidden space-y-3">
    {#if selectable && rows.length > 0}
        <label class="flex items-center gap-2 text-sm text-fg-muted px-1">
            <input
                type="checkbox"
                class={CHECKBOX_CLASS}
                checked={allSelected}
                indeterminate={someSelected}
                disabled={selectableKeys.length === 0}
                onchange={(event) => toggleAll(event.currentTarget.checked)}
            />
            Alle sichtbaren auswählen
        </label>
    {/if}

    {#if rows.length === 0}
        <p class="text-sm text-fg-subtle py-6 text-center">{empty}</p>
    {:else}
        {#each rows as row (getKey(row))}
            <article
                class={`bg-surface border rounded-card p-4 space-y-3 ${isSelected(row) ? "border-primary" : "border-border"} ${rowClass?.(row) ?? ""}`}
                style="box-shadow: var(--shadow-card);"
            >
                <div class="flex items-start gap-3">
                    {#if selectable}
                        <input
                            type="checkbox"
                            class={`${CHECKBOX_CLASS} mt-1`}
                            checked={isSelected(row)}
                            disabled={selectDisabled?.(row)}
                            aria-label={selectLabel?.(row) ?? "Eintrag auswählen"}
                            onchange={(event) => toggle(row, event.currentTarget.checked)}
                        />
                    {/if}

                    {#if cardTitle}
                        <div class="min-w-0">
                            {#if rowHref?.(row)}
                                <a href={rowHref(row)} class="text-base font-semibold text-fg hover:text-primary transition">
                                    {cardTitle(row)}
                                </a>
                            {:else}
                                <p class="text-base font-semibold text-fg">{cardTitle(row)}</p>
                            {/if}
                            {#if cardSubtitle?.(row)}
                                <p class="text-xs text-fg-subtle mt-0.5">{cardSubtitle(row)}</p>
                            {/if}
                        </div>
                    {/if}
                </div>

                <dl class="grid grid-cols-2 gap-2">
                    {#each cardColumns as column (column.key)}
                        <div class="min-w-0">
                            <dt class="text-[11px] font-semibold text-fg-subtle uppercase tracking-wide">
                                {column.label}
                            </dt>
                            <dd class="text-sm text-fg mt-0.5 break-words tabular-figures">
                                {#if column.cell}
                                    {@render column.cell(row)}
                                {:else}
                                    {display(column, row)}
                                {/if}
                            </dd>
                        </div>
                    {/each}
                </dl>

                {#if actions}
                    <div class="flex items-center justify-end gap-2 flex-wrap pt-1">
                        {@render actions(row)}
                    </div>
                {/if}
            </article>
        {/each}
    {/if}
</div>
