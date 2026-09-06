<script lang="ts">
    import { page } from "$app/state";

    /**
     * Fusszeile des internen Bereichs.
     *
     * Benutzte vorher rohe Paletten-Klassen (border-gray-200, bg-white,
     * text-gray-600, hover:text-blue-700) und war damit im dunklen Design
     * unlesbar -- weisse Flaeche auf dunklem Grund. Die Verweise standen
     * ausserdem fest im Quelltext; sie kommen jetzt aus den
     * Organisationseinstellungen.
     */

    const organization = $derived(page.data.organization);
</script>

<footer class="mt-12 border-t border-border pt-6 text-sm text-fg-muted">
    <div class="flex flex-wrap items-center gap-3 justify-between">
        <div class="flex flex-wrap items-center gap-3">
            <span>{organization?.name ?? ""}</span>
            {#if organization?.imprintUrl}
                <span class="text-fg-subtle" aria-hidden="true">•</span>
                <a
                    href={organization.imprintUrl}
                    class="hover:text-primary transition"
                    target="_blank"
                    rel="noreferrer">Impressum</a
                >
            {/if}
            {#if organization?.privacyUrl}
                <span class="text-fg-subtle" aria-hidden="true">•</span>
                <a
                    href={organization.privacyUrl}
                    class="hover:text-primary transition"
                    target="_blank"
                    rel="noreferrer">Datenschutz</a
                >
            {/if}
        </div>
        {#if organization?.instagramUrl}
            <a
                href={organization.instagramUrl}
                target="_blank"
                rel="noreferrer"
                class="inline-flex items-center gap-2 px-3 py-2 rounded-control border border-border bg-surface text-fg hover:bg-surface-muted transition"
            >
                <span class="bi bi-instagram" aria-hidden="true"></span>
                Instagram
            </a>
        {/if}
    </div>
</footer>
