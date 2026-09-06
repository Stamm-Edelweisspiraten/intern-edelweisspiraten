<script lang="ts">
    import { toasts, dismissToast } from "$lib/toastStore";

    /**
     * Ergaenzt gegenueber vorher: role/aria-live (Toasts waren fuer
     * Screenreader stumm), eine Breitenbegrenzung fuer schmale Displays und
     * ein hoeherer z-Index -- vorher lagen Toasts, Kopfzeile und
     * Impersonation-Banner alle auf z-50 und haben sich gegenseitig verdeckt.
     */

    const TONES: Record<string, string> = {
        success: "bg-success-soft border-success-soft-border text-success-soft-fg",
        error: "bg-danger-soft border-danger-soft-border text-danger-soft-fg",
        info: "bg-info-soft border-info-soft-border text-info-soft-fg"
    };

    const ICONS: Record<string, string> = {
        success: "check-circle",
        error: "exclamation-circle",
        info: "info-circle"
    };
</script>

<div
    class="fixed bottom-4 right-4 z-[70] space-y-2 w-[min(22rem,calc(100vw-2rem))]"
    role="status"
    aria-live="polite"
>
    {#each $toasts as toast (toast.id)}
        <div class={`border rounded-control px-4 py-3 flex items-start gap-3 shadow-lg ${TONES[toast.kind] ?? TONES.info}`}>
            <span class={`bi bi-${ICONS[toast.kind] ?? ICONS.info} mt-0.5 text-lg`} aria-hidden="true"></span>
            <div class="flex-1 text-sm leading-relaxed min-w-0">{toast.message}</div>
            <button
                type="button"
                class="shrink-0 opacity-70 hover:opacity-100 transition"
                aria-label="Meldung schließen"
                onclick={() => dismissToast(toast.id)}
            >
                <span class="bi bi-x-lg" aria-hidden="true"></span>
            </button>
        </div>
    {/each}
</div>
