<script lang="ts">
    import { Alert, Button, Card, EmptyState, FormField, PageHeader, TextInput } from "$lib/components/ui";
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
    {/if}
</div>
