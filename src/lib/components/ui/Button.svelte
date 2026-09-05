<script lang="ts">
    import type { Snippet } from "svelte";

    /**
     * Ersetzt die 35 Kopien des Primaer-Button-Klassenstrings und die 27
     * Kopien des neutralen Buttons. Bringt ausserdem einen sichtbaren
     * Fokus-Ring mit -- bisher hatte kein einziger Button oder Link im
     * Projekt einen Fokus-Stil.
     */

    type Variant = "primary" | "secondary" | "success" | "warning" | "danger" | "ghost";
    type Size = "sm" | "md";

    interface Props {
        variant?: Variant;
        size?: Size;
        href?: string;
        type?: "button" | "submit" | "reset";
        icon?: string;
        iconRight?: string;
        loading?: boolean;
        disabled?: boolean;
        full?: boolean;
        title?: string;
        ariaLabel?: string;
        formaction?: string;
        name?: string;
        value?: string;
        onclick?: (event: MouseEvent) => void;
        class?: string;
        children?: Snippet;
    }

    let {
        variant = "secondary",
        size = "md",
        href,
        type = "button",
        icon,
        iconRight,
        loading = false,
        disabled = false,
        full = false,
        title,
        ariaLabel,
        formaction,
        name,
        value,
        onclick,
        class: extraClass = "",
        children
    }: Props = $props();

    const VARIANTS: Record<Variant, string> = {
        primary: "bg-primary text-primary-fg hover:bg-primary-hover border border-transparent shadow-sm",
        secondary:
            "bg-surface text-fg border border-border hover:bg-surface-muted shadow-sm",
        success:
            "bg-success-soft text-success-soft-fg border border-success-soft-border hover:brightness-95",
        warning:
            "bg-warning-soft text-warning-soft-fg border border-warning-soft-border hover:brightness-95",
        danger: "bg-danger text-primary-fg border border-transparent hover:bg-danger-hover shadow-sm",
        ghost: "bg-transparent text-fg-muted border border-transparent hover:bg-surface-muted hover:text-fg"
    };

    const SIZES: Record<Size, string> = {
        sm: "px-3 py-2 text-sm rounded-control gap-2",
        md: "px-4 py-3 text-sm rounded-control gap-2"
    };

    const classes = $derived(
        [
            "inline-flex items-center justify-center font-semibold transition",
            SIZES[size],
            VARIANTS[variant],
            full ? "w-full" : "",
            disabled || loading ? "opacity-50 pointer-events-none" : "",
            extraClass
        ]
            .filter(Boolean)
            .join(" ")
    );

    const isDisabled = $derived(disabled || loading);
</script>

{#if href && !isDisabled}
    <a {href} class={classes} {title} aria-label={ariaLabel}>
        {#if loading}
            <span class="bi bi-arrow-repeat animate-spin" aria-hidden="true"></span>
        {:else if icon}
            <span class={`bi bi-${icon}`} aria-hidden="true"></span>
        {/if}
        {@render children?.()}
        {#if iconRight}
            <span class={`bi bi-${iconRight}`} aria-hidden="true"></span>
        {/if}
    </a>
{:else}
    <button
        {type}
        class={classes}
        {title}
        {formaction}
        {name}
        {value}
        aria-label={ariaLabel}
        aria-busy={loading}
        disabled={isDisabled}
        {onclick}
    >
        {#if loading}
            <span class="bi bi-arrow-repeat animate-spin" aria-hidden="true"></span>
        {:else if icon}
            <span class={`bi bi-${icon}`} aria-hidden="true"></span>
        {/if}
        {@render children?.()}
        {#if iconRight}
            <span class={`bi bi-${iconRight}`} aria-hidden="true"></span>
        {/if}
    </button>
{/if}
