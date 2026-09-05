<script lang="ts">
    import { page } from "$app/state";
    import { canAny } from "$lib/can";

    /**
     * Bereichsnavigation der Kasse.
     *
     * Die Kasse hat mit Journal, Kontenplan, Bankkonten, Berichten und
     * wiederkehrenden Buchungen genug Unterbereiche, dass ein einzelner
     * Eintrag in der Hauptnavigation nicht mehr genuegt. Die Leiste steht auf
     * jeder Kassenseite und markiert den aktuellen Bereich.
     */

    interface Item {
        name: string;
        href: string;
        icon: string;
        perms: string[];
        /** Nur bei genauer Uebereinstimmung hervorheben. */
        exact?: boolean;
    }

    const ITEMS: Item[] = [
        { name: "Übersicht", href: "/intern/finance", icon: "grid", perms: ["finance.view"], exact: true },
        { name: "Journal", href: "/intern/finance/journal", icon: "journal-text", perms: ["finance.view"] },
        { name: "Offene Posten", href: "/intern/finance/outstanding", icon: "hourglass-split", perms: ["finance.view"] },
        { name: "Eingangsrechnungen", href: "/intern/finance/bills", icon: "receipt-cutoff", perms: ["finance.view"] },
        { name: "Konten", href: "/intern/finance/bank-accounts", icon: "bank", perms: ["finance.view"] },
        { name: "Kontenplan", href: "/intern/finance/accounts", icon: "list-columns", perms: ["finance.view"] },
        { name: "Wiederkehrend", href: "/intern/finance/recurring", icon: "arrow-repeat", perms: ["finance.manage"] },
        { name: "Berichte", href: "/intern/finance/reports", icon: "bar-chart", perms: ["finance.view"] }
    ];

    const permissions = $derived(page.data.permissions ?? []);
    const visible = $derived(ITEMS.filter((item) => canAny(permissions, item.perms)));

    function isActive(item: Item): boolean {
        const path = page.url.pathname;
        return item.exact ? path === item.href : path === item.href || path.startsWith(`${item.href}/`);
    }
</script>

<nav aria-label="Bereiche der Kasse" class="border-b border-border">
    <ul class="flex gap-1 overflow-x-auto -mb-px">
        {#each visible as item (item.href)}
            <li class="shrink-0">
                <a
                    href={item.href}
                    aria-current={isActive(item) ? "page" : undefined}
                    class={`inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition ${
                        isActive(item)
                            ? "border-primary text-primary"
                            : "border-transparent text-fg-muted hover:text-fg hover:border-border-strong"
                    }`}
                >
                    <span class={`bi bi-${item.icon}`} aria-hidden="true"></span>
                    {item.name}
                </a>
            </li>
        {/each}
    </ul>
</nav>
