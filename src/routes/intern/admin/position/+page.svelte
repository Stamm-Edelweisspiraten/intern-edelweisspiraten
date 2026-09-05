<script lang="ts">
    import {
        Alert,
        Badge,
        Button,
        Card,
        ConfirmDialog,
        EmptyState,
        FormField,
        PageHeader,
        SearchInput,
        TextInput
    } from "$lib/components/ui";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type Position = PageData["positions"][number];

    /**
     * Die Seite verschickte ihre Formulare bisher von Hand per fetch und
     * verwarf dabei die Antwort der Action. Jetzt laufen alle drei Aktionen
     * ueber normale Formulare -- damit funktionieren sie auch ohne JavaScript
     * und die Rueckmeldung aus fail() wird endlich sichtbar.
     */

    let type = $state<"amt" | "gruppenleiter">("amt");
    let memberSearch = $state("");
    let editingId = $state<string | null>(null);

    let deleteTarget = $state<Position | null>(null);
    let deleteOpen = $state(false);
    let deleteForm = $state<HTMLFormElement | null>(null);

    const filteredMembers = $derived(
        data.members.filter((member) => {
            const needle = memberSearch.trim().toLowerCase();
            if (!needle) return true;
            return `${member.name} ${member.email}`.toLowerCase().includes(needle);
        })
    );

    function groupName(groupId: string | undefined | null): string {
        if (!groupId) return "";
        return data.groups.find((group) => group.id === groupId)?.name ?? groupId;
    }

    function askDelete(position: Position) {
        deleteTarget = position;
        deleteOpen = true;
    }
</script>

<svelte:head><title>Ämter - Adminbereich</title></svelte:head>

<div class="space-y-8">
    <PageHeader
        title="Ämter verwalten"
        eyebrow="Adminbereich"
        subtitle="Ämter anlegen, Mitglieder zuordnen und pflegen."
        back={{ href: "/intern/admin" }}
    />

    {#if form?.error}
        <Alert tone="danger" message={form.error} />
    {/if}
    {#if form?.success}
        <Alert tone="success" message="Die Änderungen wurden gespeichert." />
    {/if}

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <Card title="Neues Amt" class="lg:col-span-1">
            <form method="post" action="?/create" class="space-y-4">
                <FormField label="Name" required>
                    {#snippet children({ id })}
                        <TextInput {id} name="name" required placeholder="z.B. Kassenwart" />
                    {/snippet}
                </FormField>

                <FormField label="E-Mail-Adresse" hint="Optional, z.B. eine Funktionsadresse.">
                    {#snippet children({ id, describedBy })}
                        <TextInput
                            {id}
                            {describedBy}
                            name="email"
                            type="email"
                            placeholder="amt@example.org"
                        />
                    {/snippet}
                </FormField>

                <fieldset class="space-y-2">
                    <legend class="block text-sm font-semibold text-fg-muted">Typ</legend>
                    <div class="flex items-center gap-4 flex-wrap">
                        <label class="flex items-center gap-2 text-sm text-fg">
                            <input
                                type="radio"
                                name="type"
                                value="amt"
                                bind:group={type}
                                class="border-border-strong"
                            />
                            Amt
                        </label>
                        <label class="flex items-center gap-2 text-sm text-fg">
                            <input
                                type="radio"
                                name="type"
                                value="gruppenleiter"
                                bind:group={type}
                                class="border-border-strong"
                            />
                            Gruppenleiter
                        </label>
                    </div>
                </fieldset>

                <FormField label="Gruppe" hint="Nur für Gruppenleiter erforderlich.">
                    {#snippet children({ id, describedBy })}
                        <select
                            {id}
                            aria-describedby={describedBy}
                            name="groupId"
                            disabled={type !== "gruppenleiter"}
                            class="w-full px-4 py-3 rounded-xl text-sm bg-surface text-fg border border-border-strong shadow-sm disabled:opacity-60"
                        >
                            <option value="">Keine Gruppe</option>
                            {#each data.groups as group (group.id)}
                                <option value={group.id}>{group.name}</option>
                            {/each}
                        </select>
                    {/snippet}
                </FormField>

                <fieldset class="space-y-2">
                    <legend class="block text-sm font-semibold text-fg-muted">
                        Mitglieder <span class="font-normal text-fg-subtle">(optional)</span>
                    </legend>
                    <SearchInput
                        bind:value={memberSearch}
                        placeholder="Mitglied suchen..."
                        label="Mitglied suchen"
                        class="sm:w-full"
                    />
                    <!--
                        Statt eines <select multiple>, das auf Touch-Geraeten
                        praktisch nicht bedienbar ist: eine scrollbare Liste
                        mit Checkboxen. Der Feldname bleibt memberIds.
                    -->
                    <div
                        class="max-h-64 overflow-y-auto space-y-1 border border-border rounded-xl p-2 bg-surface-muted"
                    >
                        {#each filteredMembers as member (member.id)}
                            <label
                                class="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-border cursor-pointer hover:bg-surface-muted transition"
                            >
                                <input
                                    type="checkbox"
                                    name="memberIds"
                                    value={member.id}
                                    class="rounded border-border-strong"
                                />
                                <span class="min-w-0">
                                    <span class="block text-sm text-fg truncate">{member.name}</span>
                                    {#if member.email}
                                        <span class="block text-xs text-fg-subtle truncate">{member.email}</span>
                                    {/if}
                                </span>
                            </label>
                        {:else}
                            <p class="text-sm text-fg-subtle px-3 py-4 text-center">
                                Kein passendes Mitglied gefunden.
                            </p>
                        {/each}
                    </div>
                </fieldset>

                <FormField label="Beschreibung">
                    {#snippet children({ id })}
                        <textarea
                            {id}
                            name="description"
                            rows="3"
                            class="w-full px-4 py-3 rounded-xl text-sm bg-surface text-fg border border-border-strong shadow-sm placeholder:text-fg-subtle"
                            placeholder="Aufgaben oder Hinweise"
                        ></textarea>
                    {/snippet}
                </FormField>

                <Button type="submit" variant="primary" full icon="plus-circle">Amt anlegen</Button>
            </form>
        </Card>

        <Card
            title="Ämter"
            meta={`${data.positions.length} Einträge`}
            class="lg:col-span-2"
        >
            {#if data.positions.length === 0}
                <EmptyState
                    icon="briefcase"
                    title="Noch keine Ämter angelegt"
                    description="Lege links ein Amt an, um Zuständigkeiten im Stamm abzubilden."
                />
            {:else}
                <ul class="divide-y divide-border">
                    {#each data.positions as position (position.id)}
                        <li class="py-4 space-y-3">
                            <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                <div class="min-w-0 space-y-1">
                                    <div class="flex items-center gap-2 flex-wrap">
                                        <Badge
                                            tone={position.type === "gruppenleiter" ? "info" : "primary"}
                                            size="xs"
                                            label={position.type === "gruppenleiter" ? "Gruppenleiter" : "Amt"}
                                        />
                                        {#if position.type === "gruppenleiter" && position.groupId}
                                            <span class="text-xs text-fg-subtle">
                                                Gruppe: {groupName(position.groupId)}
                                            </span>
                                        {/if}
                                    </div>
                                    <p class="text-lg font-semibold text-fg">{position.name}</p>
                                    {#if position.email}
                                        <p class="text-sm text-fg-muted">{position.email}</p>
                                    {/if}
                                    {#if position.description}
                                        <p class="text-sm text-fg-muted">{position.description}</p>
                                    {/if}
                                    <p class="text-sm text-fg-subtle">
                                        {#if position.members.length > 0}
                                            Zugeordnet: {position.members
                                                .map((member: { name?: string } | undefined) => member?.name)
                                                .filter(Boolean)
                                                .join(", ")}
                                        {:else}
                                            Kein Mitglied zugeordnet
                                        {/if}
                                    </p>
                                </div>

                                <div class="flex items-center gap-2 shrink-0">
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        icon="pencil"
                                        onclick={() =>
                                            (editingId = editingId === position.id ? null : position.id)}
                                    >
                                        {editingId === position.id ? "Abbrechen" : "Bearbeiten"}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        icon="trash"
                                        onclick={() => askDelete(position)}
                                    >
                                        Löschen
                                    </Button>
                                </div>
                            </div>

                            {#if editingId === position.id}
                                <form
                                    method="post"
                                    action="?/update"
                                    class="grid grid-cols-1 md:grid-cols-2 gap-4 bg-surface-muted border border-border rounded-xl p-4"
                                >
                                    <input type="hidden" name="id" value={position.id} />

                                    <FormField label="Name" required class="md:col-span-2">
                                        {#snippet children({ id })}
                                            <TextInput {id} name="name" value={position.name} required />
                                        {/snippet}
                                    </FormField>

                                    <FormField label="E-Mail-Adresse">
                                        {#snippet children({ id })}
                                            <TextInput {id} name="email" type="email" value={position.email ?? ""} />
                                        {/snippet}
                                    </FormField>

                                    <FormField label="Beschreibung">
                                        {#snippet children({ id })}
                                            <TextInput {id} name="description" value={position.description ?? ""} />
                                        {/snippet}
                                    </FormField>

                                    <fieldset class="md:col-span-2 space-y-2">
                                        <legend class="block text-sm font-semibold text-fg-muted">Typ</legend>
                                        <div class="flex items-center gap-4 flex-wrap">
                                            <label class="flex items-center gap-2 text-sm text-fg">
                                                <input
                                                    type="radio"
                                                    name="type"
                                                    value="amt"
                                                    checked={position.type !== "gruppenleiter"}
                                                    class="border-border-strong"
                                                />
                                                Amt
                                            </label>
                                            <label class="flex items-center gap-2 text-sm text-fg">
                                                <input
                                                    type="radio"
                                                    name="type"
                                                    value="gruppenleiter"
                                                    checked={position.type === "gruppenleiter"}
                                                    class="border-border-strong"
                                                />
                                                Gruppenleiter
                                            </label>
                                        </div>
                                    </fieldset>

                                    <FormField
                                        label="Gruppe"
                                        hint="Nur für Gruppenleiter erforderlich."
                                        class="md:col-span-2"
                                    >
                                        {#snippet children({ id, describedBy })}
                                            <select
                                                {id}
                                                aria-describedby={describedBy}
                                                name="groupId"
                                                class="w-full px-4 py-3 rounded-xl text-sm bg-surface text-fg border border-border-strong shadow-sm"
                                            >
                                                <option value="">Keine Gruppe</option>
                                                {#each data.groups as group (group.id)}
                                                    <option value={group.id} selected={position.groupId === group.id}>
                                                        {group.name}
                                                    </option>
                                                {/each}
                                            </select>
                                        {/snippet}
                                    </FormField>

                                    <fieldset class="md:col-span-2 space-y-2">
                                        <legend class="block text-sm font-semibold text-fg-muted">Mitglieder</legend>
                                        <div
                                            class="max-h-64 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1 border border-border rounded-xl p-2 bg-surface"
                                        >
                                            {#each data.members as member (member.id)}
                                                <label
                                                    class="flex items-center gap-2 px-3 py-2 rounded-lg border border-border cursor-pointer hover:bg-surface-muted transition"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        name="memberIds"
                                                        value={member.id}
                                                        checked={position.memberIds?.includes(member.id) ?? false}
                                                        class="rounded border-border-strong"
                                                    />
                                                    <span class="text-sm text-fg truncate">{member.name}</span>
                                                </label>
                                            {/each}
                                        </div>
                                    </fieldset>

                                    <div class="md:col-span-2 flex justify-end gap-3 flex-wrap">
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onclick={() => (editingId = null)}
                                        >
                                            Abbrechen
                                        </Button>
                                        <Button type="submit" variant="primary" size="sm" icon="check-lg">
                                            Speichern
                                        </Button>
                                    </div>
                                </form>
                            {/if}
                        </li>
                    {/each}
                </ul>
            {/if}
        </Card>
    </div>
</div>

<form method="post" action="?/delete" bind:this={deleteForm} class="hidden">
    <input type="hidden" name="id" value={deleteTarget?.id ?? ""} />
</form>

<ConfirmDialog
    bind:open={deleteOpen}
    title="Amt wirklich löschen?"
    message={`Das Amt „${deleteTarget?.name ?? ""}“ wird dauerhaft entfernt. Diese Aktion kann nicht rückgängig gemacht werden.`}
    confirmLabel="Endgültig löschen"
    onconfirm={() => deleteForm?.requestSubmit()}
    oncancel={() => (deleteTarget = null)}
/>
