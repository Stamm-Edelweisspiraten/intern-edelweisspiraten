<script lang="ts">
    /** Kompakte Kennzahl-Kachel fuer Kasse, Dashboard und Kaemmerer. */

    type Tone = "neutral" | "primary" | "success" | "warning" | "danger";

    interface Props {
        label: string;
        value: string | number;
        hint?: string;
        icon?: string;
        tone?: Tone;
        href?: string;
    }

    let { label, value, hint, icon, tone = "neutral", href }: Props = $props();

    const VALUE_TONES: Record<Tone, string> = {
        neutral: "text-fg",
        primary: "text-primary",
        success: "text-success",
        warning: "text-warning",
        danger: "text-danger"
    };
</script>

<svelte:element
    this={href ? "a" : "div"}
    href={href ?? undefined}
    class={`block bg-surface border border-border rounded-2xl p-5 ${href ? "hover:border-primary-soft-border transition" : ""}`}
    style="box-shadow: var(--shadow-card);"
>
    <div class="flex items-center justify-between gap-3">
        <p class="text-xs font-semibold text-fg-subtle uppercase tracking-wide">{label}</p>
        {#if icon}
            <span class={`bi bi-${icon} ${VALUE_TONES[tone]}`} aria-hidden="true"></span>
        {/if}
    </div>
    <p class={`mt-2 text-2xl font-bold ${VALUE_TONES[tone]}`}>{value}</p>
    {#if hint}
        <p class="mt-1 text-xs text-fg-subtle">{hint}</p>
    {/if}
</svelte:element>
