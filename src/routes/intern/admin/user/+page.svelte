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

    type User = PageData["users"][number];

    /** Die Action leitet bei Erfolg um; der Cast macht ein fail() trotzdem sichtbar. */
    const feedback = $derived(form as { error?: string; success?: unknown } | null);

    let search = $state("");
    let deleteTarget = $state<User | null>(null);
    let deleteOpen = $state(false);
    let deleteForm = $state<HTMLFormElement | null>(null);

    const permissions = $derived(page.data.permissions ?? []);
    const canDelete = $derived(can(permissions, "user.delete"));

    function memberName(memberId: string | null | undefined): string {
        if (!memberId) return "";
        return data.members.find((member) => member.id === memberId)?.name ?? memberId;
    }

    const filtered = $derived(
        (data.users ?? []).filter((user) => {
            const needle = search.trim().toLowerCase();
            if (!needle) return true;
            return `${user.name} ${user.email} ${user.id} ${memberName(user.memberId)}`
                .toLowerCase()
                .includes(needle);
        })
    );

    const columns: Column<User>[] = [
        { key: "name", label: "Name", value: (u) => u.name },
        { key: "email", label: "E-Mail-Adresse", value: (u) => u.email },
        { key: "member", label: "Verknüpftes Mitglied", value: (u) => memberName(u.memberId) }
    ];

    function askDelete(user: User) {
        deleteTarget = user;
        deleteOpen = true;
    }
</script>

<svelte:head><title>Benutzerverwaltung - Adminbereich</title></svelte:head>

<div class="space-y-8">
    <PageHeader
        title="Benutzerverwaltung"
        eyebrow="Adminbereich"
        subtitle="Zugänge suchen, ansehen und verwalten."
        back={{ href: "/intern/admin" }}
    >
        {#snippet actions()}
            <Button href="/intern/admin/user/create" variant="primary" icon="person-plus">
                Neuer Benutzer
            </Button>
        {/snippet}
    </PageHeader>

    {#if feedback?.error}
        <Alert tone="danger" message={feedback.error} />
    {/if}
    {#if feedback?.success}
        <Alert tone="success" message="Der Zugang wurde gelöscht." />
    {/if}

    <Card title="Benutzer" meta={`${filtered.length} Einträge`} padding="none">
        {#snippet actions()}
            <SearchInput
                bind:value={search}
                placeholder="Name, E-Mail, ID oder Mitglied"
                label="Benutzer suchen"
                count={filtered.length}
            />
        {/snippet}

        <DataTable
            {columns}
            rows={filtered}
            getKey={(u) => u.id}
            cardTitle={(u) => u.name}
            cardSubtitle={(u) => u.email}
            rowHref={(u) => `/intern/admin/user/${u.id}`}
            empty="Keine Benutzer gefunden."
            caption="Alle Zugänge zum internen Bereich"
        >
            {#snippet actions(user)}
                <Button
                    href={`/intern/admin/user/${user.id}`}
                    variant="secondary"
                    size="sm"
                    icon="eye"
                >
                    Öffnen
                </Button>
                {#if canDelete}
                    <Button variant="ghost" size="sm" icon="trash" onclick={() => askDelete(user)}>
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
    title="Zugang wirklich löschen?"
    message={`Der Zugang von ${deleteTarget?.name ?? ""} wird dauerhaft entfernt. Mitgliederdaten bleiben erhalten.`}
    confirmLabel="Endgültig löschen"
    onconfirm={() => deleteForm?.requestSubmit()}
    oncancel={() => (deleteTarget = null)}
/>
