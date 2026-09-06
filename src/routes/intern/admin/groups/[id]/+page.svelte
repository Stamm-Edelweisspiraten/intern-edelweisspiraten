<script lang="ts">
    import {
        Alert,
        Badge,
        Button,
        Card,
        EmptyState,
        FormField,
        PageHeader,
        TextInput
    } from "$lib/components/ui";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    /** Die Action meldet bisher nur `success`; der Cast haelt die Ausgabe einheitlich. */
    const feedback = $derived(form as { error?: string; success?: unknown } | null);

    const editing = $derived(data.scope === "edit");
</script>

<svelte:head><title>{data.group?.name ?? "Gruppe"} - Adminbereich</title></svelte:head>

<div class="space-y-8">
    <PageHeader
        title={data.group ? (editing ? "Gruppe bearbeiten" : data.group.name) : "Gruppe nicht gefunden"}
        eyebrow="Adminbereich"
        subtitle={data.group ? "Stammdaten, Gruppenstunde und Antwortadresse." : undefined}
        back={{ href: "/intern/admin/groups", label: "Zur Übersicht" }}
    >
        {#snippet actions()}
            {#if data.group && !editing}
                <Button href="?scope=edit" variant="primary" icon="pencil">Bearbeiten</Button>
            {/if}
        {/snippet}
    </PageHeader>

    {#if feedback?.error}
        <Alert tone="danger" message={feedback.error} />
    {/if}
    {#if feedback?.success}
        <Alert tone="success" message="Die Gruppe wurde gespeichert." />
    {/if}

    {#if !data.group}
        <Card>
            <EmptyState
                icon="question-circle"
                title="Gruppe nicht gefunden"
                description="Zu dieser Kennung existiert keine Gruppe. Möglicherweise wurde sie gelöscht."
            >
                {#snippet action()}
                    <Button href="/intern/admin/groups" variant="primary" icon="arrow-left">
                        Zur Gruppenübersicht
                    </Button>
                {/snippet}
            </EmptyState>
        </Card>
    {:else}
        <Card title="Stammdaten">
            <form method="post" action="?/update" class="space-y-5">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField label="Name" required>
                        {#snippet children({ id })}
                            <TextInput
                                {id}
                                name="name"
                                value={data.group.name}
                                required
                                disabled={!editing}
                                placeholder="Meute Wölflinge"
                            />
                        {/snippet}
                    </FormField>

                    <FormField label="Typ" required>
                        {#snippet children({ id })}
                            <select
                                {id}
                                name="type"
                                required
                                disabled={!editing}
                                class="w-full px-4 py-3 rounded-xl text-sm bg-surface text-fg border border-border-strong shadow-sm disabled:opacity-60"
                            >
                                <option value="meute" selected={data.group.type === "meute"}>Meute</option>
                                <option value="sippe" selected={data.group.type === "sippe"}>Sippe</option>
                            </select>
                        {/snippet}
                    </FormField>

                    <FormField label="Gruppenstunden" required>
                        {#snippet children({ id })}
                            <TextInput
                                {id}
                                name="meeting_time"
                                value={data.group.meeting_time}
                                required
                                disabled={!editing}
                                placeholder="Dienstag, 17:30 Uhr"
                            />
                        {/snippet}
                    </FormField>

                    <FormField
                        label="Antwortadresse (Reply-To)"
                        hint="Pflichtangabe für den E-Mail-Versand an die Gruppe."
                        required
                    >
                        {#snippet children({ id, describedBy })}
                            <TextInput
                                {id}
                                {describedBy}
                                name="replyTo"
                                type="email"
                                value={data.group.replyTo}
                                required
                                disabled={!editing}
                                placeholder="meute@example.org"
                            />
                        {/snippet}
                    </FormField>
                </div>

                <FormField label="Beschreibung">
                    {#snippet children({ id })}
                        <textarea
                            {id}
                            name="description"
                            rows="4"
                            value={data.group.description ?? ""}
                            disabled={!editing}
                            class="w-full px-4 py-3 rounded-xl text-sm bg-surface text-fg border border-border-strong shadow-sm placeholder:text-fg-subtle disabled:opacity-60"
                            placeholder="Wer trifft sich hier, und was macht die Gruppe?"
                        ></textarea>
                    {/snippet}
                </FormField>

                {#if editing}
                    <div class="flex justify-end gap-3 flex-wrap">
                        <Button href={`/intern/admin/groups/${data.group.id}`} variant="secondary">
                            Abbrechen
                        </Button>
                        <Button type="submit" variant="primary" icon="check-lg">Speichern</Button>
                    </div>
                {/if}
            </form>
        </Card>

        <Card
            title="Rechte in dieser Gruppe"
            subtitle="Rollen, die hier gelten – direkt zugewiesen oder über ein Amt mit Gruppenbezug."
            meta={`${data.access.length} Einträge`}
        >
            {#if data.access.length === 0}
                <EmptyState
                    icon="shield-slash"
                    title="Keine gruppenbezogenen Rechte"
                    description="Niemand hat Rechte, die eigens für diese Gruppe vergeben wurden. Stammesweite Rechte gelten hier trotzdem und werden bewusst nicht aufgeführt."
                />
            {:else}
                <ul class="divide-y divide-border">
                    {#each data.access as entry, index (index)}
                        <li class="py-3 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
                            <div class="sm:w-56 shrink-0">
                                <p class="text-sm font-semibold text-fg">{entry.holder}</p>
                                <p class="text-xs text-fg-subtle">
                                    {#if entry.via === "position"}
                                        Amt: {entry.positionName}
                                    {:else}
                                        Direkt zugewiesen
                                    {/if}
                                </p>
                            </div>

                            <div class="min-w-0 space-y-1.5">
                                <Badge tone="primary" size="xs" label={entry.roleName} />
                                <p class="text-xs text-fg-muted">
                                    {entry.labels.join(" · ")}
                                </p>
                            </div>
                        </li>
                    {/each}
                </ul>

                <p class="text-xs text-fg-subtle mt-4">
                    Rollen ohne Gruppenbezug gelten für den ganzen Stamm und stehen deshalb
                    nicht in dieser Liste. Vergeben werden sie unter
                    <a class="underline" href="/intern/admin/user">Zugänge</a> und
                    <a class="underline" href="/intern/admin/position">Ämter</a>.
                </p>
            {/if}
        </Card>
    {/if}
</div>
