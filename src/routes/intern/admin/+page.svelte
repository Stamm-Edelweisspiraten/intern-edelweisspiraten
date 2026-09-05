<script lang="ts">
    import { Button, Card, EmptyState, PageHeader } from "$lib/components/ui";
    import { canAny } from "$lib/can";
    import type { PageData } from "./$types";

    let { data }: { data: PageData } = $props();

    interface Tile {
        name: string;
        href: string;
        description: string;
        icon: string;
        /** Sichtbar, sobald eine dieser Berechtigungen vorliegt. */
        perms: string[];
    }

    const TILES: Tile[] = [
        {
            name: "Benutzerverwaltung",
            href: "/intern/admin/user",
            description: "Zugänge anlegen, bearbeiten und löschen.",
            icon: "people-fill",
            perms: ["user.view"]
        },
        {
            name: "Rollen und Berechtigungen",
            href: "/intern/admin/permissions",
            description: "Festlegen, welche Rolle auf welchen Bereich zugreifen darf.",
            icon: "shield-lock-fill",
            perms: ["system.settings.view", "roles.manage"]
        },
        {
            name: "Gruppen",
            href: "/intern/admin/groups",
            description: "Meuten und Sippen anlegen und pflegen.",
            icon: "diagram-3-fill",
            perms: ["groups.view"]
        },
        {
            name: "Ämter",
            href: "/intern/admin/position",
            description: "Ämter anlegen, Mitglieder zuordnen und löschen.",
            icon: "briefcase-fill",
            perms: ["admin.view"]
        },
        {
            name: "Einstellungen",
            href: "/intern/admin/settings",
            description: "Beitragssätze und Systemoptionen konfigurieren.",
            icon: "gear-fill",
            perms: ["system.settings.view"]
        }
    ];

    const permissions = $derived(data.permissions ?? []);
    const visibleTiles = $derived(TILES.filter((tile) => canAny(permissions, tile.perms)));
</script>

<svelte:head><title>Adminbereich - Intern</title></svelte:head>

<div class="space-y-8">
    <PageHeader
        title="Verwaltung"
        eyebrow="Adminbereich"
        subtitle="Zentrale Module für Zugänge, Rechte und Stammesverwaltung."
        back={{ href: "/intern/dashboard", label: "Zum Dashboard" }}
    />

    {#if visibleTiles.length === 0}
        <Card>
            <EmptyState
                icon="lock"
                title="Keine passenden Adminrechte"
                description="Dein Zugang hat auf keines der Verwaltungsmodule Zugriff. Wende dich an einen Administrator, wenn du Rechte benötigst."
            >
                {#snippet action()}
                    <Button href="/intern/dashboard" variant="primary" icon="arrow-left">
                        Zurück zum Dashboard
                    </Button>
                {/snippet}
            </EmptyState>
        </Card>
    {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {#each visibleTiles as tile (tile.href)}
                <Card>
                    {#snippet header()}
                        <div class="flex items-center gap-3">
                            <span
                                class="w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-xl bg-primary-soft text-primary-soft-fg border border-primary-soft-border"
                            >
                                <span class={`bi bi-${tile.icon} text-xl`} aria-hidden="true"></span>
                            </span>
                            <h2 class="text-lg font-semibold text-fg">{tile.name}</h2>
                        </div>
                    {/snippet}

                    <p class="text-sm text-fg-muted leading-relaxed">{tile.description}</p>

                    {#snippet footer()}
                        <Button href={tile.href} variant="secondary" size="sm" iconRight="arrow-right">
                            Öffnen
                        </Button>
                    {/snippet}
                </Card>
            {/each}
        </div>
    {/if}
</div>
