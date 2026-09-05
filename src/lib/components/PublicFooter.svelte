<script lang="ts">
    import { page } from "$app/state";

    /**
     * Fusszeile unter der Anmeldemaske.
     *
     * Wie InternalFooter zuvor auf rohen Paletten-Klassen (bg-white/80,
     * text-gray-600, text-blue-600) und damit im dunklen Design gebrochen.
     * Name und Verweise kommen aus den Organisationseinstellungen.
     */

    const organization = $derived(page.data.organization);
</script>

<div
    class="border-t border-border bg-surface/80 backdrop-blur py-4 px-6 text-sm text-fg-muted flex flex-col sm:flex-row items-center justify-between gap-3"
>
    <div class="flex items-center gap-2 text-fg">
        <span class="font-semibold text-primary">{organization?.name ?? "Internes Portal"}</span>
        <span class="text-fg-subtle" aria-hidden="true">•</span>
        <span>Interner Bereich</span>
    </div>
    <div class="flex items-center gap-4">
        {#if organization?.imprintUrl}
            <a
                href={organization.imprintUrl}
                target="_blank"
                rel="noreferrer"
                class="text-primary hover:text-primary-hover transition">Impressum</a
            >
        {/if}
        {#if organization?.privacyUrl}
            <a
                href={organization.privacyUrl}
                target="_blank"
                rel="noreferrer"
                class="text-primary hover:text-primary-hover transition">Datenschutzerklärung</a
            >
        {/if}
    </div>
</div>
