<script lang="ts">
    import type { Snippet } from "svelte";

    /**
     * Macht Formularfehler sichtbar. 28 Routen haben Actions, aber nur zwei
     * Seiten deklarierten bisher `form` -- jedes fail() verpuffte damit
     * wirkungslos und der Nutzer sah eine Seite, die scheinbar nichts tat.
     */

    type Tone = "info" | "success" | "warning" | "danger";

    interface Props {
        tone?: Tone;
        title?: string;
        message?: string;
        children?: Snippet;
    }

    let { tone = "info", title, message, children }: Props = $props();

    const TONES: Record<Tone, { box: string; icon: string }> = {
        info: { box: "bg-info-soft border-info-soft-border text-info-soft-fg", icon: "info-circle" },
        success: { box: "bg-success-soft border-success-soft-border text-success-soft-fg", icon: "check-circle" },
        warning: { box: "bg-warning-soft border-warning-soft-border text-warning-soft-fg", icon: "exclamation-triangle" },
        danger: { box: "bg-danger-soft border-danger-soft-border text-danger-soft-fg", icon: "exclamation-circle" }
    };
</script>

<div
    class={`border rounded-control px-4 py-3 flex items-start gap-3 ${TONES[tone].box}`}
    role={tone === "danger" ? "alert" : "status"}
>
    <span class={`bi bi-${TONES[tone].icon} mt-0.5`} aria-hidden="true"></span>
    <div class="text-sm leading-relaxed min-w-0">
        {#if title}<p class="font-semibold">{title}</p>{/if}
        {#if message}<p>{message}</p>{/if}
        {@render children?.()}
    </div>
</div>
