<script lang="ts">
    import type { Snippet } from "svelte";

    /** Vereinheitlicht die 4-5 kopierten statusTone/statusLabel-Bloecke. */

    type Tone = "neutral" | "primary" | "info" | "success" | "warning" | "danger";

    interface Props {
        tone?: Tone;
        size?: "xs" | "sm";
        icon?: string;
        label?: string;
        children?: Snippet;
    }

    let { tone = "neutral", size = "sm", icon, label, children }: Props = $props();

    const TONES: Record<Tone, string> = {
        neutral: "bg-surface-muted text-fg-muted border-border",
        primary: "bg-primary-soft text-primary-soft-fg border-primary-soft-border",
        info: "bg-info-soft text-info-soft-fg border-info-soft-border",
        success: "bg-success-soft text-success-soft-fg border-success-soft-border",
        warning: "bg-warning-soft text-warning-soft-fg border-warning-soft-border",
        danger: "bg-danger-soft text-danger-soft-fg border-danger-soft-border"
    };

    const SIZES = {
        xs: "text-[11px] px-2 py-0.5",
        sm: "text-xs px-3 py-1"
    } as const;
</script>

<span
    class={`inline-flex items-center gap-1.5 font-semibold rounded-full border whitespace-nowrap ${TONES[tone]} ${SIZES[size]}`}
>
    {#if icon}
        <span class={`bi bi-${icon}`} aria-hidden="true"></span>
    {/if}
    {#if label}{label}{/if}
    {@render children?.()}
</span>
