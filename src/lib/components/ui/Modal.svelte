<script lang="ts">
    import type { Snippet } from "svelte";

    /**
     * Zugänglicher Dialog.
     *
     * Die vier bestehenden Modals hatten weder role="dialog" noch aria-modal,
     * keinen Fokus-Trap, kein Escape und kein Schliessen per Klick auf den
     * Hintergrund -- lediglich die Scroll-Sperre war umgesetzt (und die in
     * einer Variante, die sich bei zwei gleichzeitig offenen Dialogen selbst
     * ueberschrieben hat).
     */

    interface Props {
        open: boolean;
        title: string;
        description?: string;
        size?: "sm" | "md" | "lg";
        onclose?: () => void;
        footer?: Snippet;
        children?: Snippet;
    }

    let {
        open = $bindable(false),
        title,
        description,
        size = "md",
        onclose,
        footer,
        children
    }: Props = $props();

    const SIZES = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-3xl" } as const;

    const uid = $props.id();
    const titleId = `modal-title-${uid}`;
    const descriptionId = `modal-desc-${uid}`;

    let panel = $state<HTMLDivElement | null>(null);
    let previouslyFocused: HTMLElement | null = null;

    function close() {
        open = false;
        onclose?.();
    }

    function onkeydown(event: KeyboardEvent) {
        if (event.key === "Escape") {
            event.preventDefault();
            close();
            return;
        }

        if (event.key !== "Tab" || !panel) return;

        // Fokus innerhalb des Dialogs halten.
        const focusable = panel.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;

        if (event.shiftKey && active === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
        }
    }

    // Scroll-Sperre und Fokus-Verwaltung, sauber wiederhergestellt.
    $effect(() => {
        if (!open) return;

        previouslyFocused = document.activeElement as HTMLElement | null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        const timer = setTimeout(() => {
            const target = panel?.querySelector<HTMLElement>(
                'input:not([type="hidden"]), textarea, select, button, a[href]'
            );
            target?.focus();
        }, 0);

        return () => {
            clearTimeout(timer);
            document.body.style.overflow = previousOverflow;
            previouslyFocused?.focus?.();
        };
    });
</script>

<svelte:window onkeydown={open ? onkeydown : undefined} />

{#if open}
    <div class="fixed inset-0 z-[60] flex items-center justify-center px-4 py-8">
        <button
            type="button"
            class="absolute inset-0 bg-black/50 backdrop-blur-sm"
            aria-label="Dialog schließen"
            onclick={close}
        ></button>

        <div
            bind:this={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            class={`relative w-full ${SIZES[size]} bg-surface border border-border rounded-card shadow-2xl max-h-full flex flex-col`}
        >
            <div class="flex items-start justify-between gap-4 p-6 pb-4">
                <div class="min-w-0">
                    <h2 id={titleId} class="text-lg font-semibold text-fg">{title}</h2>
                    {#if description}
                        <p id={descriptionId} class="text-sm text-fg-muted mt-1">{description}</p>
                    {/if}
                </div>
                <button
                    type="button"
                    class="shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-control text-fg-muted hover:bg-surface-muted hover:text-fg transition"
                    aria-label="Dialog schließen"
                    onclick={close}
                >
                    <span class="bi bi-x-lg" aria-hidden="true"></span>
                </button>
            </div>

            <div class="px-6 pb-6 space-y-4 overflow-y-auto">
                {@render children?.()}
            </div>

            {#if footer}
                <div class="border-t border-border p-4 flex justify-end gap-3 flex-wrap">
                    {@render footer()}
                </div>
            {/if}
        </div>
    </div>
{/if}
