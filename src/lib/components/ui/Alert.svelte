<script lang="ts">
    import type { Snippet } from "svelte";

    /**
     * Macht Formularfehler sichtbar. 28 Routen haben Actions, aber nur zwei
     * Seiten deklarierten bisher `form` -- jedes fail() verpuffte damit
     * wirkungslos und der Nutzer sah eine Seite, die scheinbar nichts tat.
     */

    import type { Tone } from "./types";

    /*
     * Der Tonwert kommt aus ./types und deckt damit dieselben sechs Werte ab
     * wie Badge, Card und StatTile. Vorher kannte Alert nur vier davon --
     * jede Stelle, die einen Tonwert weiterreichte (etwa readHint() aus
     * $lib/hints), musste ihn deshalb von Hand auf die kleinere Liste
     * abbilden. Drei Seiten hatten dafuer dieselbe Hilfsfunktion kopiert.
     *
     * `neutral` und `primary` sind bewusst zurueckhaltend gestaltet: eine
     * Rueckmeldung ohne Wertung soll nicht wie eine Warnung aussehen.
     */

    interface Props {
        tone?: Tone;
        title?: string;
        message?: string;
        children?: Snippet;
    }

    let { tone = "info", title, message, children }: Props = $props();

    const TONES: Record<Tone, { box: string; icon: string }> = {
        neutral: { box: "bg-surface-muted border-border text-fg", icon: "info-circle" },
        primary: { box: "bg-primary-soft border-primary-soft-border text-primary-soft-fg", icon: "info-circle" },
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
