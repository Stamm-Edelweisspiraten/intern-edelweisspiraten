<script lang="ts">
    import type { Snippet } from "svelte";

    /**
     * Das Design-Sheet fordert einzeilige Leerzustaende innerhalb der Karte
     * bzw. Tabelle (inline), keine bildschirmfuellenden Platzhalter. Fuer
     * echte Erstnutzung ist die groessere Variante vorgesehen.
     */

    interface Props {
        title: string;
        description?: string;
        icon?: string;
        inline?: boolean;
        action?: Snippet;
    }

    let { title, description, icon, inline = false, action }: Props = $props();
</script>

{#if inline}
    <p class="text-sm text-fg-subtle py-6 text-center">{title}</p>
{:else}
    <div class="text-center py-12 px-4">
        {#if icon}
            <span class={`bi bi-${icon} text-3xl text-fg-subtle`} aria-hidden="true"></span>
        {/if}
        <p class="mt-3 text-base font-semibold text-fg">{title}</p>
        {#if description}
            <p class="mt-1 text-sm text-fg-muted max-w-md mx-auto">{description}</p>
        {/if}
        {#if action}
            <div class="mt-5 flex justify-center gap-3 flex-wrap">{@render action()}</div>
        {/if}
    </div>
{/if}
