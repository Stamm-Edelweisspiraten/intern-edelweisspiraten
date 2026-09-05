<script lang="ts">
    import { Badge, Button, Card, DataTable, PageHeader, StatTile } from "$lib/components/ui";
    import type { Column } from "$lib/components/ui";
    import { fullName } from "$lib/format";
    import type { PageData } from "./$types";

    let { data }: { data: PageData } = $props();

    type Member = PageData["members"][number];

    const columns: Column<Member>[] = [
        { key: "name", label: "Name", value: (m) => fullName(m) },
        { key: "emails", label: "E-Mail-Adressen", cell: emailCell }
    ];
</script>

{#snippet emailCell(member: Member)}
    {#if member.emails?.length}
        <div class="flex flex-wrap gap-1.5">
            {#each member.emails as entry (entry.email)}
                <Badge tone="info" size="xs" icon="envelope" label={entry.email} />
            {/each}
        </div>
    {:else}
        <span class="text-fg-subtle">Keine E-Mail hinterlegt</span>
    {/if}
{/snippet}

<svelte:head><title>{data.group.name} - Gruppen</title></svelte:head>

<div class="space-y-8">
    <PageHeader
        title={data.group.name}
        eyebrow="Gruppe"
        subtitle={data.group.description || "Keine Beschreibung hinterlegt."}
        back={{ href: "/intern/groups" }}
    >
        {#snippet badge()}
            <Badge tone="primary" label={data.group.type} />
            <Badge tone="warning" icon="clock" label={data.group.meeting_time || "Kein Termin"} />
        {/snippet}

        {#snippet actions()}
            <Button
                href={`/intern/groups/${data.group.id}/members.pdf`}
                variant="secondary"
                icon="filetype-pdf"
            >
                PDF-Export
            </Button>
            <Button href={`/intern/email?group=${data.group.id}`} variant="primary" icon="envelope">
                E-Mail an Mitglieder
            </Button>
        {/snippet}
    </PageHeader>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatTile label="Mitglieder" value={data.members.length} icon="people" tone="primary" />
        <StatTile
            label="Gruppenstunde"
            value={data.group.meeting_time || "k.A."}
            icon="calendar-event"
        />
        <StatTile label="Typ" value={data.group.type} icon="diagram-3" />
    </div>

    <Card title="Mitglieder" meta={`${data.members.length} Personen`} padding="none">
        <DataTable
            {columns}
            rows={data.members}
            getKey={(m) => m.id}
            cardTitle={(m) => fullName(m)}
            rowHref={(m) => `/intern/members/${m.id}`}
            empty="Keine Mitglieder in dieser Gruppe."
            caption={`Mitglieder der Gruppe ${data.group.name}`}
        >
            {#snippet actions(member)}
                <Button
                    href={`/intern/members/${member.id}`}
                    variant="secondary"
                    size="sm"
                    icon="eye"
                >
                    Details
                </Button>
            {/snippet}
        </DataTable>
    </Card>
</div>
