<script lang="ts">
    import {
        Alert, Badge, Button, Card, ConfirmDialog, DataTable,
        PageHeader, SearchInput, StatTile
    } from "$lib/components/ui";
    import type { Column } from "$lib/components/ui";
    import { calculateAge, formatDate } from "$lib/format";
    import { can, canAny } from "$lib/can";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type Member = PageData["members"][number];

    /**
     * Diese Seite trug bis zuletzt `export const csr = false` -- Suche,
     * Filter, Mehrfachauswahl und Hinweise waren damit im Betrieb komplett
     * funktionslos. Mit den Runes hydriert die Seite wieder.
     */

    let search = $state("");
    let groupFilter = $state("");
    let statusFilter = $state("");
    let deleteTarget = $state<Member | null>(null);
    let deleteOpen = $state(false);
    let deleteForm = $state<HTMLFormElement | null>(null);

    const permissions = $derived(data.permissions ?? []);
    const canCreate = $derived(can(permissions, "members.create"));
    const canEdit = $derived(canAny(permissions, ["members.edit", "groupleader.members.edit"]));
    const canDelete = $derived(canAny(permissions, ["members.delete", "groupleader.members.delete"]));
    const canInvite = $derived(canAny(permissions, ["members.view", "groupleader.members.invitepdf"]));

    const groupNameById = $derived(
        new Map(data.groupNames.map((group) => [group.id, group.name]))
    );

    const statuses = $derived(
        Array.from(new Set(data.members.map((m) => m.status).filter(Boolean))).sort()
    );

    const filtered = $derived(
        data.members.filter((member) => {
            if (groupFilter && !member.groups.includes(groupFilter)) return false;
            if (statusFilter && member.status !== statusFilter) return false;

            const needle = search.trim().toLowerCase();
            if (!needle) return true;

            const haystack = [
                member.firstname,
                member.lastname,
                member.fahrtenname,
                member.stand,
                member.status,
                ...(member.emails ?? []).map((e: { email: string }) => e.email),
                ...member.groups.map((id: string) => groupNameById.get(id) ?? "")
            ]
                .join(" ")
                .toLowerCase();

            return haystack.includes(needle);
        })
    );

    const stats = $derived({
        total: data.members.length,
        active: data.members.filter((m) => m.status === "aktiv").length,
        minors: data.members.filter((m) => {
            const age = calculateAge(m.birthday);
            return age !== null && age < 18;
        }).length
    });

    function askDelete(member: Member) {
        deleteTarget = member;
        deleteOpen = true;
    }

    const STATUS_TONES: Record<string, "success" | "warning" | "neutral"> = {
        aktiv: "success",
        passiv: "warning"
    };
</script>

<svelte:head><title>Mitglieder - Intern</title></svelte:head>

{#snippet nameCell(member: Member)}
    <a href={`/intern/members/${member.id}`} class="font-semibold text-fg hover:text-primary transition">
        {member.firstname} {member.lastname}
    </a>
    {#if member.fahrtenname}
        <span class="block text-xs text-fg-subtle">„{member.fahrtenname}“</span>
    {/if}
{/snippet}

{#snippet groupsCell(member: Member)}
    {#if member.groups.length === 0}
        <span class="text-fg-subtle">–</span>
    {:else}
        <div class="flex flex-wrap gap-1">
            {#each member.groups as groupId (groupId)}
                <Badge tone="neutral" size="xs" label={groupNameById.get(groupId) ?? "Unbekannt"} />
            {/each}
        </div>
    {/if}
{/snippet}

{#snippet statusCell(member: Member)}
    <Badge tone={STATUS_TONES[member.status] ?? "neutral"} size="xs" label={member.status || "–"} />
{/snippet}

{#snippet ageCell(member: Member)}
    {@const age = calculateAge(member.birthday)}
    <span class="text-sm">{age !== null ? `${age} Jahre` : "–"}</span>
    <span class="block text-xs text-fg-subtle">{formatDate(member.birthday)}</span>
{/snippet}

<div class="space-y-8">
    <PageHeader
        title="Mitgliedverwaltung"
        eyebrow="Intern"
        subtitle="Alle Mitglieder des Stammes mit Gruppen, Stand und Kontaktdaten."
    >
        {#snippet actions()}
            <SearchInput bind:value={search} placeholder="Name, Gruppe, E-Mail..." label="Mitglieder durchsuchen" />
            {#if canCreate}
                <Button href="/intern/members/create" variant="primary" icon="person-plus">
                    Mitglied anlegen
                </Button>
            {/if}
        {/snippet}
    </PageHeader>

    {#if form?.error}<Alert tone="danger" message={form.error} />{/if}

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile label="Mitglieder" value={stats.total} tone="primary" icon="people" />
        <StatTile label="Aktiv" value={stats.active} tone="success" icon="person-check" />
        <StatTile label="Unter 18" value={stats.minors} tone="neutral" icon="person-hearts" />
    </div>

    <Card padding="none">
        {#snippet header()}
            <div class="flex flex-wrap gap-3 items-end">
                <label class="text-xs text-fg-subtle">
                    Gruppe
                    <select
                        bind:value={groupFilter}
                        class="mt-1 block px-3 py-2 rounded-lg text-sm bg-surface text-fg border border-border-strong"
                    >
                        <option value="">Alle Gruppen</option>
                        {#each data.groups as group (group.id)}
                            <option value={group.id}>{group.name}</option>
                        {/each}
                    </select>
                </label>

                <label class="text-xs text-fg-subtle">
                    Status
                    <select
                        bind:value={statusFilter}
                        class="mt-1 block px-3 py-2 rounded-lg text-sm bg-surface text-fg border border-border-strong"
                    >
                        <option value="">Alle</option>
                        {#each statuses as status (status)}
                            <option value={status}>{status}</option>
                        {/each}
                    </select>
                </label>

                {#if groupFilter || statusFilter || search}
                    <Button
                        variant="ghost"
                        size="sm"
                        icon="x-lg"
                        onclick={() => {
                            groupFilter = "";
                            statusFilter = "";
                            search = "";
                        }}
                    >
                        Filter zurücksetzen
                    </Button>
                {/if}
            </div>
        {/snippet}

        {#snippet actions()}
            <Badge tone="info" size="xs" label={`${filtered.length} von ${data.members.length}`} />
        {/snippet}

        <DataTable
            columns={[
                { key: "name", label: "Name", cell: nameCell },
                { key: "stand", label: "Stand", value: (m) => m.stand || "–" },
                { key: "groups", label: "Gruppen", cell: groupsCell },
                { key: "age", label: "Alter", cell: ageCell },
                { key: "status", label: "Status", cell: statusCell }
            ] satisfies Column<Member>[]}
            rows={filtered}
            getKey={(m) => m.id}
            cardTitle={(m) => `${m.firstname} ${m.lastname}`}
            cardSubtitle={(m) => m.stand || undefined}
            empty={search || groupFilter || statusFilter
                ? "Keine Mitglieder passen zu den Filtern."
                : "Noch keine Mitglieder erfasst."}
        >
            {#snippet actions(member)}
                <Button
                    href={`/intern/members/${member.id}`}
                    variant="secondary"
                    size="sm"
                    icon={canEdit ? "pencil" : "eye"}
                >
                    {canEdit ? "Bearbeiten" : "Ansehen"}
                </Button>

                {#if canInvite}
                    <Button
                        href={`/intern/members/${member.id}/invite.pdf`}
                        variant="ghost"
                        size="sm"
                        icon="file-earmark-pdf"
                        ariaLabel={`Einladung für ${member.firstname} ${member.lastname} herunterladen`}
                    />
                {/if}

                {#if canDelete}
                    <Button
                        variant="ghost"
                        size="sm"
                        icon="trash"
                        ariaLabel={`${member.firstname} ${member.lastname} löschen`}
                        onclick={() => askDelete(member)}
                    />
                {/if}
            {/snippet}
        </DataTable>
    </Card>
</div>

<form method="post" action="?/delete" bind:this={deleteForm} class="hidden">
    <input type="hidden" name="id" value={deleteTarget?.id ?? ""} />
</form>

<ConfirmDialog
    bind:open={deleteOpen}
    title="Mitglied löschen?"
    message={deleteTarget
        ? `${deleteTarget.firstname} ${deleteTarget.lastname} wird dauerhaft entfernt. Diese Aktion kann nicht rückgängig gemacht werden.`
        : ""}
    confirmLabel="Endgültig löschen"
    onconfirm={() => deleteForm?.requestSubmit()}
    oncancel={() => (deleteTarget = null)}
/>
