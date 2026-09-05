<script lang="ts">
    import type { Snippet } from "svelte";

    /**
     * Vereinheitlicht die rund 30 Seitenkoepfe und damit auch den bisher
     * uneinheitlichen oberen Abstand (26x mt-16, 11x mt-12, 2x mt-10,
     * je 1x mt-14 und mt-20). Der Abstand gehoert ab jetzt hierher und nicht
     * mehr in jede einzelne Seite.
     */

    interface Props {
        title: string;
        subtitle?: string;
        eyebrow?: string;
        back?: { href: string; label?: string };
        actions?: Snippet;
        badge?: Snippet;
    }

    let { title, subtitle, eyebrow, back, actions, badge }: Props = $props();
</script>

<header class="flex items-start justify-between flex-wrap gap-4">
    <div class="min-w-0">
        {#if eyebrow}
            <p class="text-xs font-semibold text-fg-subtle uppercase tracking-wide">{eyebrow}</p>
        {/if}
        <div class="flex items-center gap-3 flex-wrap">
            <h1 class="text-3xl sm:text-4xl font-bold text-fg">{title}</h1>
            {@render badge?.()}
        </div>
        {#if subtitle}
            <p class="text-sm text-fg-muted mt-1">{subtitle}</p>
        {/if}
    </div>

    <div class="flex items-center gap-3 flex-wrap w-full sm:w-auto">
        {#if back}
            <a
                href={back.href}
                class="inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold rounded-xl bg-surface text-fg border border-border hover:bg-surface-muted shadow-sm transition"
            >
                <span class="bi bi-arrow-left" aria-hidden="true"></span>
                {back.label ?? "Zurück"}
            </a>
        {/if}
        {@render actions?.()}
    </div>
</header>
