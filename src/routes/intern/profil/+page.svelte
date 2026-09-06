<script lang="ts">
    import { Badge, Button, Card, EmptyState, PageHeader, StatTile } from "$lib/components/ui";
    import { calculateAge, formatDate, fullName } from "$lib/format";
    import type { PageData } from "./$types";

    let { data }: { data: PageData } = $props();

    const userinfo = $derived(data.userinfo ?? { email: "", name: "", groups: [] });
    const roles = $derived(userinfo.groups ?? []);

    const ACCOUNT_TYPES: Record<string, string> = {
        parent: "Erwachsen / Eltern",
        child: "Kind"
    };
</script>

<svelte:head><title>Profil - Intern</title></svelte:head>

<div class="space-y-8">
    <PageHeader
        title="Dein Zugang"
        eyebrow="Mein Profil"
        subtitle="Basisdaten, verknüpfte Mitglieder und Rollen."
    >
        {#snippet badge()}
            <Badge tone="primary" icon="envelope" label={userinfo.email || "keine E-Mail"} />
        {/snippet}

        {#snippet actions()}
            <Button href="/intern/profil/sicherheit" variant="primary" icon="shield-lock">
                Sicherheit
            </Button>
        {/snippet}
    </PageHeader>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile
            label="Name"
            value={userinfo.name || "–"}
            icon="person-circle"
            hint={ACCOUNT_TYPES[data.dbUser?.type ?? ""] ?? "Kontoart unbekannt"}
        />
        <StatTile
            label="Verknüpfte Mitglieder"
            value={data.members.length}
            icon="people"
            tone="primary"
            hint="Bestimmt, welche Daten du siehst."
        />
        <StatTile
            label="Zugang angelegt"
            value={data.dbUser?.createdAt ? formatDate(data.dbUser.createdAt, "–") : "–"}
            icon="calendar-check"
        />
    </div>

    <Card title="Verknüpfte Mitglieder" meta={`${data.members.length} Einträge`}>
        {#if data.members.length === 0}
            <EmptyState
                icon="person-badge"
                title="Keine Mitglieder verknüpft"
                description="Deinem Zugang ist noch kein Mitglied zugeordnet. Ein Administrator kann die Zuordnung ergänzen."
            />
        {:else}
            <ul class="divide-y divide-border">
                {#each data.members as member, index (index)}
                    <li class="py-4 space-y-2">
                        <p class="text-base font-semibold text-fg">{fullName(member)}</p>
                        <div class="flex flex-wrap gap-2">
                            {#if member.stand}
                                <Badge tone="neutral" size="xs" label={`Stand ${member.stand}`} />
                            {/if}
                            {#if member.status}
                                <Badge tone="info" size="xs" label={member.status} />
                            {/if}
                            {#if calculateAge(member.birthday) !== null}
                                <Badge tone="neutral" size="xs" label={`${calculateAge(member.birthday)} Jahre`} />
                            {/if}
                        </div>
                    </li>
                {/each}
            </ul>
        {/if}
    </Card>

    <Card title="Rollen und Zugang" meta={`${roles.length} Rollen`}>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-1">
                <p class="text-xs font-semibold text-fg-subtle uppercase tracking-wide">E-Mail-Adresse</p>
                <p class="text-sm font-medium text-fg">{userinfo.email || "–"}</p>
            </div>
            <div class="space-y-2">
                <p class="text-xs font-semibold text-fg-subtle uppercase tracking-wide">Rollen</p>
                {#if roles.length > 0}
                    <div class="flex flex-wrap gap-2">
                        {#each roles as role (role)}
                            <Badge tone="primary" size="xs" label={role} />
                        {/each}
                    </div>
                {:else}
                    <p class="text-sm text-fg-subtle">Keine Rollen zugewiesen.</p>
                {/if}
            </div>
        </div>
    </Card>
</div>
