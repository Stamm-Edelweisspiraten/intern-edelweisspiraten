<script lang="ts">
    import { applyTheme, nextTheme, THEME_ICONS, THEME_LABELS, type Theme } from "$lib/theme";

    interface Props {
        theme: Theme;
        collapsed?: boolean;
    }

    let { theme, collapsed = false }: Props = $props();

    let current = $state<Theme>(theme);

    function cycle() {
        current = nextTheme(current);
        applyTheme(current);
    }
</script>

<button
    type="button"
    onclick={cycle}
    class="flex items-center justify-center gap-2 w-full py-3 rounded-lg border border-border bg-surface text-fg hover:bg-surface-muted font-semibold transition"
    title={`Darstellung: ${THEME_LABELS[current]}`}
    aria-label={`Darstellung umschalten, aktuell ${THEME_LABELS[current]}`}
>
    <span class={`bi bi-${THEME_ICONS[current]}`} aria-hidden="true"></span>
    {#if !collapsed}
        <span>{THEME_LABELS[current]}</span>
    {/if}
</button>
