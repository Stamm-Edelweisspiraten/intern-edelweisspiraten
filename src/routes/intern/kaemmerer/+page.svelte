<script lang="ts">
    import { Button, EmptyState, PageHeader } from "$lib/components/ui";
    import { can } from "$lib/can";
    import type { PageData } from "./$types";

    let { data }: { data: PageData } = $props();

    interface NavTile {
        title: string;
        description: string;
        href: string;
        icon: string;
        /** Ohne Angabe ist die Kachel fuer jeden mit Kaemmerer-Zugang sichtbar. */
        permission?: string;
    }

    /**
     * Die beiden Bestellbereiche heissen jetzt "Meine Bestellungen" und
     * "Bestellverwaltung". Vorher unterschieden sie sich nur im Plural-s der
     * Adresse ("/order" und "/orders") und im Titel "Bestellungen".
     */
    const TILES: NavTile[] = [
        {
            title: "Neue Bestellung",
            description: "Kostenpflichtig bestellen, Rechnungen entstehen automatisch.",
            href: "/intern/kaemmerer/order/create",
            icon: "plus-circle",
            permission: "kaemmerer.order.create"
        },
        {
            title: "Meine Bestellungen",
            description: "Bestellungen der mit dem Konto verknüpften Mitglieder.",
            href: "/intern/kaemmerer/order",
            icon: "basket",
            permission: "kaemmerer.order.view"
        },
        {
            title: "Bestellverwaltung",
            description: "Alle Bestellungen des Stammes: Lieferung, Zahlung, Storno.",
            href: "/intern/kaemmerer/orders",
            icon: "list-check",
            permission: "kaemmerer.orders.view"
        },
        {
            title: "Artikel",
            description: "Artikel anlegen, bearbeiten und deaktivieren.",
            href: "/intern/kaemmerer/articles",
            icon: "box",
            permission: "kaemmerer.articles.manage"
        },
        {
            title: "Lager",
            description: "Bestände einsehen, anpassen und korrigieren.",
            href: "/intern/kaemmerer/storage",
            icon: "building",
            permission: "kaemmerer.storage.manage"
        },
        {
            title: "Nachbestellliste",
            description: "Fehlmengen bis zum Mindestbestand, je Artikel und Größe.",
            href: "/intern/kaemmerer/storage/reorder",
            icon: "cart-plus",
            permission: "kaemmerer.storage.manage"
        }
    ];

    const tiles = $derived(
        TILES.filter((tile) => !tile.permission || can(data.permissions, tile.permission))
    );

    const canOrder = $derived(can(data.permissions, "kaemmerer.order.create"));
</script>

<svelte:head><title>Kämmerer - Intern</title></svelte:head>

<div class="space-y-8">
    <PageHeader
        title="Übersicht"
        eyebrow="Kämmerer"
        subtitle="Schneller Zugriff auf Bestellungen, Artikel und Lager."
    >
        {#snippet actions()}
            {#if canOrder}
                <Button href="/intern/kaemmerer/order/create" variant="primary" icon="plus-circle">
                    Neue Bestellung
                </Button>
            {/if}
        {/snippet}
    </PageHeader>

    {#if tiles.length === 0}
        <EmptyState
            icon="shield-lock"
            title="Keine Bereiche freigeschaltet"
            description="Für den Kämmerer-Bereich fehlen dir die nötigen Berechtigungen. Bitte wende dich an die Stammesführung."
        />
    {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {#each tiles as tile (tile.href)}
                <a
                    href={tile.href}
                    class="flex flex-col justify-between gap-4 bg-surface border border-border rounded-2xl p-5 hover:border-primary-soft-border transition"
                    style="box-shadow: var(--shadow-card);"
                >
                    <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                            <p class="text-xs font-semibold text-fg-subtle uppercase tracking-wide">
                                Bereich
                            </p>
                            <h2 class="text-xl font-semibold text-fg mt-1">{tile.title}</h2>
                            <p class="text-sm text-fg-muted mt-2">{tile.description}</p>
                        </div>
                        <span class={`bi bi-${tile.icon} text-2xl text-primary shrink-0`} aria-hidden="true"></span>
                    </div>
                    <span class="inline-flex items-center gap-2 text-sm font-semibold text-primary">
                        Öffnen
                        <span class="bi bi-arrow-right" aria-hidden="true"></span>
                    </span>
                </a>
            {/each}
        </div>
    {/if}
</div>
