<script lang="ts">
    import { page } from "$app/state";

    /**
     * Seitenweise Navigation ueber URL-Parameter, damit sie auch ohne
     * JavaScript funktioniert. Bisher rendern alle Listen saemtliche
     * Datensaetze auf einmal.
     */

    interface Props {
        total: number;
        pageSize: number;
        current: number;
        param?: string;
    }

    let { total, pageSize, current, param = "page" }: Props = $props();

    const pageCount = $derived(Math.max(1, Math.ceil(total / pageSize)));

    function hrefFor(target: number): string {
        const url = new URL(page.url);
        url.searchParams.set(param, String(target));
        return `${url.pathname}${url.search}`;
    }

    const from = $derived(total === 0 ? 0 : (current - 1) * pageSize + 1);
    const to = $derived(Math.min(current * pageSize, total));
</script>

{#if pageCount > 1}
    <nav class="flex items-center justify-between gap-4 flex-wrap pt-2" aria-label="Seitennavigation">
        <p class="text-xs text-fg-subtle">
            {from}–{to} von {total}
        </p>
        <div class="flex items-center gap-2">
            <a
                href={hrefFor(Math.max(1, current - 1))}
                class={`inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-control border border-border bg-surface transition ${current <= 1 ? "opacity-40 pointer-events-none" : "hover:bg-surface-muted"}`}
                aria-label="Vorherige Seite"
            >
                <span class="bi bi-chevron-left" aria-hidden="true"></span>
            </a>
            <span class="text-sm text-fg-muted">Seite {current} von {pageCount}</span>
            <a
                href={hrefFor(Math.min(pageCount, current + 1))}
                class={`inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-control border border-border bg-surface transition ${current >= pageCount ? "opacity-40 pointer-events-none" : "hover:bg-surface-muted"}`}
                aria-label="Nächste Seite"
            >
                <span class="bi bi-chevron-right" aria-hidden="true"></span>
            </a>
        </div>
    </nav>
{/if}
