<script lang="ts">
    import { page } from "$app/state";
    import {
        Alert,
        Button,
        Card,
        ConfirmDialog,
        DataTable,
        PageHeader,
        SearchInput
    } from "$lib/components/ui";
    import type { Column } from "$lib/components/ui";
    import { can } from "$lib/can";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type Group = PageData["groups"][number];

    /**
     * Die Action meldet bisher nur `success`. Der Cast haelt die Rueckmeldung
     * einheitlich, damit auch ein spaeter ergaenztes fail({ error }) sichtbar
     * wird statt wie bisher wirkungslos zu verpuffen.
     */
    const feedback = $derived(form as { error?: string; success?: unknown } | null);

    let search = $state("");
    let deleteTarget = $state<Group | null>(null);
    let deleteOpen = $state(false);
    let deleteForm = $state<HTMLFormElement | null>(null);

    const permissions = $derived(page.data.permissions ?? []);
    const canDelete = $derived(can(permissions, "groups.delete"));

    const filtered = $derived(
        (data.groups ?? []).filter((group) => {
            const needle = search.trim().toLowerCase();
            if (!needle) return true;
            return `${group.name} ${group.type} ${group.id} ${group.meeting_time ?? ""}`
                .toLowerCase()
                .includes(needle);
        })
    );

    const columns: Column<Group>[] = [
        { key: "name", label: "Name", value: (g) => g.name },
        { key: "type", label: "Typ", value: (g) => g.type },
        { key: "meeting_time", label: "Gruppenstunden", value: (g) => g.meeting_time }
    ];

    function askDelete(group: Group) {
        deleteTarget = group;
        deleteOpen = true;
    }
</script>

<svelte:head><title>Gruppenverwaltung - Adminbereich</title></svelte:head>

<div class="space-y-8">
    <PageHeader
        title="Gruppenverwaltung"
        eyebrow="Adminbereich"
        subtitle="Gruppen anlegen, suchen und öffnen."
        back={{ href: "/intern/admin" }}
    >
        {#snippet actions()}
            <Button href="/intern/admin/groups/create" variant="primary" icon="plus-circle">
                Neue Gruppe
            </Button>
        {/snippet}
    </PageHeader>

    {#if feedback?.error}
        <Alert tone="danger" message={feedback.error} />
    {/if}
    {#if feedback?.success}
        <Alert tone="success" message="Die Gruppe wurde gelöscht." />
    {/if}

    <Card title="Gruppen" meta={`${filtered.length} Einträge`} padding="none">
        {#snippet actions()}
            <SearchInput
                bind:value={search}
                placeholder="Name, Typ, ID oder Gruppenstunden"
                label="Gruppen suchen"
                count={filtered.length}
            />
        {/snippet}

        <DataTable
            {columns}
            rows={filtered}
            getKey={(g) => g.id}
            cardTitle={(g) => g.name}
            cardSubtitle={(g) => g.type}
            rowHref={(g) => `/intern/admin/groups/${g.id}`}
            empty="Keine Gruppen gefunden."
            caption="Alle Gruppen des Stammes"
        >
            {#snippet actions(group)}
                <Button
                    href={`/intern/admin/groups/${group.id}`}
                    variant="secondary"
                    size="sm"
                    icon="box-arrow-in-right"
                >
                    Öffnen
                </Button>
                {#if canDelete}
                    <Button
                        variant="ghost"
                        size="sm"
                        icon="trash"
                        onclick={() => askDelete(group)}
                    >
                        Löschen
                    </Button>
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
    title="Gruppe wirklich löschen?"
    message={`Die Gruppe „${deleteTarget?.name ?? ""}“ wird dauerhaft entfernt und bei allen Mitgliedern ausgetragen. Diese Aktion kann nicht rückgängig gemacht werden.`}
    confirmLabel="Endgültig löschen"
    onconfirm={() => deleteForm?.requestSubmit()}
    oncancel={() => (deleteTarget = null)}
/>
