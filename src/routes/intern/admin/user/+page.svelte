<script lang="ts">
    import { page } from "$app/state";
    import {
        Alert,
        Badge,
        Button,
        Card,
        ConfirmDialog,
        DataTable,
        PageHeader,
        SearchInput
    } from "$lib/components/ui";
    import type { Column } from "$lib/components/ui";
    import { can } from "$lib/can";
    import { readHint } from "$lib/hints";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type User = PageData["users"][number];

    /** Die Action leitet bei Erfolg um; der Cast macht ein fail() trotzdem sichtbar. */
    const feedback = $derived(form as { error?: string } | null);

    /**
     * Rueckmeldung aus `?hinweis=`.
     *
     * Ein 303 setzt `form` auf null -- der Erfolg des Anlegens war deshalb
     * hier gar nicht zu sehen: die Seite lud, zeigte nichts, und der zweite
     * Versuch scheiterte an der bereits vergebenen Adresse.
     */
    const hint = $derived(readHint(page.url.searchParams.get("hinweis")));


    let search = $state("");
    let deleteTarget = $state<User | null>(null);
    let deleteOpen = $state(false);
    let deleteForm = $state<HTMLFormElement | null>(null);

    const permissions = $derived(page.data.permissions ?? []);
    const canDelete = $derived(can(permissions, "user.delete"));

    /** Ein Zugang kann mit mehreren Mitgliedern verknuepft sein. */
    function memberNames(memberIds: string[] | null | undefined): string {
        if (!memberIds || memberIds.length === 0) return "";
        return memberIds
            .map((id) => data.members.find((member) => member.id === id)?.name ?? id)
            .join(", ");
    }

    const filtered = $derived(
        (data.users ?? []).filter((user) => {
            const needle = search.trim().toLowerCase();
            if (!needle) return true;
            return `${user.name} ${user.email} ${user.id} ${memberNames(user.memberIds)}`
                .toLowerCase()
                .includes(needle);
        })
    );

    const STATUS_TONES = {
        active: "success",
        invited: "warning",
        disabled: "danger"
    } as const;

    const STATUS_LABELS = {
        active: "Aktiv",
        invited: "Eingeladen",
        disabled: "Deaktiviert"
    } as const;

    function askDelete(user: User) {
        deleteTarget = user;
        deleteOpen = true;
    }
</script>

<svelte:head><title>Benutzerverwaltung - Adminbereich</title></svelte:head>

{#snippet statusCell(user: User)}
    <Badge tone={STATUS_TONES[user.status]} size="xs" label={STATUS_LABELS[user.status]} />
{/snippet}

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

    {#if hint}
        <Alert tone={hint.tone} message={hint.message} />
    {/if}
    {#if feedback?.error}
        <Alert tone="danger" message={feedback.error} />
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
            columns={[
                { key: "name", label: "Name", value: (u) => u.name },
                { key: "email", label: "E-Mail-Adresse", value: (u) => u.email },
                { key: "status", label: "Status", cell: statusCell },
                {
                    key: "member",
                    label: "Verknüpfte Mitglieder",
                    value: (u) => memberNames(u.memberIds)
                }
            ] satisfies Column<User>[]}
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
