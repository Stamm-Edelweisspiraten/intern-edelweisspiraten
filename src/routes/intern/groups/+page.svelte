<script lang="ts">
    import { page } from "$app/state";
    import { Badge, Button, Card, EmptyState, PageHeader, SearchInput } from "$lib/components/ui";
    import { can } from "$lib/can";
    import type { PageData } from "./$types";

    let { data }: { data: PageData } = $props();

    type Group = PageData["groups"][number];

    /**
     * Die Suche lief bisher ins Leere: die Seite hatte `export const csr = false`
     * gesetzt, wodurch im Betrieb gar kein JavaScript geladen wurde.
     */
    let search = $state("");

    const allowed = $derived(new Set(data.allowedGroups ?? []));
    const permissions = $derived(page.data.permissions ?? []);

    function canOpen(group: Group): boolean {
        return data.canAll || allowed.has(group.id);
    }

    const filtered = $derived(
        data.groups.filter((group) => {
            const needle = search.trim().toLowerCase();
            if (!needle) return true;
            return `${group.name} ${group.type} ${group.description ?? ""} ${group.meeting_time ?? ""}`
                .toLowerCase()
                .includes(needle);
        })
    );
</script>

<svelte:head><title>Gruppen - Intern</title></svelte:head>

<div class="space-y-8">
    <PageHeader
        title="Gruppenverwaltung"
        eyebrow="Gruppen"
        subtitle="Übersicht aller Gruppen, Gruppenstunden und Beschreibungen."
        back={{ href: "/intern/dashboard", label: "Zurück" }}
    >
        {#snippet badge()}
            <Badge tone="primary" label={`${data.groups.length} Gruppen`} />
        {/snippet}

        {#snippet actions()}
            <SearchInput
                bind:value={search}
                placeholder="Name, Typ, Beschreibung..."
                label="Gruppen suchen"
                count={filtered.length}
            />
            {#if can(permissions, "admin.view")}
                <Button href="/intern/admin" variant="primary" icon="speedometer2">Adminbereich</Button>
            {/if}
        {/snippet}
    </PageHeader>

    {#if filtered.length === 0}
        <Card>
            <EmptyState
                icon="diagram-3"
                title="Keine Gruppen gefunden"
                description={search.trim()
                    ? "Für diesen Suchbegriff gibt es keine passende Gruppe."
                    : "Es wurde noch keine Gruppe angelegt."}
            />
        </Card>
    {:else}
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {#each filtered as group (group.id)}
                <Card class={canOpen(group) ? "" : "opacity-70"}>
                    {#snippet header()}
                        <div class="flex items-center gap-2 flex-wrap">
                            <Badge tone="info" size="xs" label={group.type} />
                            <span class="text-xs text-fg-subtle">
                                {group.meeting_time || "Kein Termin"}
                            </span>
                        </div>
                        <h2 class="text-xl font-bold text-fg mt-2">{group.name}</h2>
                    {/snippet}

                    <p class="text-sm text-fg-muted line-clamp-3">
                        {group.description || "Keine Beschreibung hinterlegt."}
                    </p>

                    {#snippet footer()}
                        {#if canOpen(group)}
                            <Button
                                href={`/intern/groups/${group.id}`}
                                variant="secondary"
                                size="sm"
                                icon="box-arrow-in-right"
                            >
                                Öffnen
                            </Button>
                        {:else}
                            <span class="text-xs text-fg-subtle">Keine Berechtigung für Details.</span>
                        {/if}
                    {/snippet}
                </Card>
            {/each}
        </div>
    {/if}
</div>
