<script lang="ts">
    import type { Snippet } from "svelte";
    import PublicFooter from "$lib/components/PublicFooter.svelte";

    /** Gemeinsamer Rahmen fuer Anmeldung, Passwort-Seiten und Ersteinrichtung. */

    interface Props {
        title: string;
        subtitle?: string;
        eyebrow?: string;
        icon?: string;
        footer?: Snippet;
        children: Snippet;
    }

    let { title, subtitle, eyebrow = "Intern", icon = "box-arrow-in-right", footer, children }: Props =
        $props();
</script>

<div class="min-h-screen w-full flex flex-col bg-surface-muted">
    <main id="hauptinhalt" class="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div class="w-full max-w-md">
            <div
                class="bg-surface border border-border rounded-2xl p-6 sm:p-8 space-y-6"
                style="box-shadow: var(--shadow-raised);"
            >
                <div class="flex items-start justify-between gap-4">
                    <div class="min-w-0">
                        <p class="text-xs uppercase tracking-[0.2em] text-primary font-semibold">
                            {eyebrow}
                        </p>
                        <h1 class="text-2xl sm:text-3xl font-bold text-fg mt-2">{title}</h1>
                        {#if subtitle}
                            <p class="text-sm text-fg-muted mt-2">{subtitle}</p>
                        {/if}
                    </div>
                    <div
                        class="hidden sm:flex h-12 w-12 shrink-0 rounded-full bg-primary-soft border border-primary-soft-border items-center justify-center"
                    >
                        <span class={`bi bi-${icon} text-xl text-primary`} aria-hidden="true"></span>
                    </div>
                </div>

                {@render children()}
            </div>

            {#if footer}
                <div class="mt-4 text-center text-sm text-fg-muted">
                    {@render footer()}
                </div>
            {/if}
        </div>
    </main>

    <PublicFooter />
</div>
