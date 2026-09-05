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
        caption
    }: Props = $props();

    const tableColumns = $derived(columns.filter((c) => !c.hideOnTable));
    const cardColumns = $derived(columns.filter((c) => !c.hideOnCard));

    const ALIGN = { left: "text-left", right: "text-right", center: "text-center" } as const;

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
        <thead class="bg-surface-muted">
            <tr>
                {#each tableColumns as column (column.key)}
                    <th
                        scope="col"
                        style={column.width ? `width:${column.width}` : undefined}
                        class={`px-6 py-3 text-xs font-semibold text-fg-subtle uppercase tracking-wide ${ALIGN[column.align ?? "left"]}`}
                    >
                        {column.label}
                    </th>
                {/each}
                {#if actions}
                    <th scope="col" class="px-6 py-3 text-right text-xs font-semibold text-fg-subtle uppercase tracking-wide">
                        Aktionen
                    </th>
                {/if}
            </tr>
        </thead>
        <tbody class="divide-y divide-border">
            {#if rows.length === 0}
                <tr>
                    <td
                        colspan={tableColumns.length + (actions ? 1 : 0)}
                        class="px-6 py-8 text-center text-sm text-fg-subtle"
                    >
                        {empty}
                    </td>
                </tr>
            {:else}
                {#each rows as row (getKey(row))}
                    <tr class={`hover:bg-surface-muted transition ${rowClass?.(row) ?? ""}`}>
                        {#each tableColumns as column (column.key)}
                            <td class={`px-6 py-4 text-sm text-fg ${ALIGN[column.align ?? "left"]}`}>
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
                            <td class="px-6 py-4 text-right">
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
    {#if rows.length === 0}
        <p class="text-sm text-fg-subtle py-6 text-center">{empty}</p>
    {:else}
        {#each rows as row (getKey(row))}
            <article
                class={`bg-surface border border-border rounded-2xl p-4 space-y-3 ${rowClass?.(row) ?? ""}`}
                style="box-shadow: var(--shadow-card);"
            >
                {#if cardTitle}
                    <div>
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

                <dl class="grid grid-cols-2 gap-2">
                    {#each cardColumns as column (column.key)}
                        <div class="min-w-0">
                            <dt class="text-[11px] font-semibold text-fg-subtle uppercase tracking-wide">
                                {column.label}
                            </dt>
                            <dd class="text-sm text-fg mt-0.5 break-words">
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
