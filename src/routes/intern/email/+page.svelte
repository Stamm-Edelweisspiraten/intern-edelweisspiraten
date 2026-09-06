<script lang="ts">
    import { enhance } from "$app/forms";
    import {
        Alert, Badge, Button, Card, FormField,
        PageHeader, RichTextEditor, StatTile, TextInput
    } from "$lib/components/ui";
    import { addToast } from "$lib/toastStore";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    /**
     * Diese Seite trug bis zuletzt `export const csr = false` -- der gesamte
     * Editor und der Versand waren im Betrieb damit funktionslos. Der Editor
     * lädt Quill außerdem nicht mehr von einem fremden CDN, sondern aus dem
     * Projekt.
     */

    let subject = $state("");
    let bodyHtml = $state("");
    let replyTo = $state(data.replyToDefault ?? "");
    let sending = $state(false);
    let files = $state<File[]>([]);

    const recipients = $derived(
        Array.from(
            new Set(
                data.members
                    .flatMap((member) => member.emails ?? [])
                    .map((entry: { email: string }) => entry.email)
                    .filter(Boolean)
            )
        )
    );

    const withoutEmail = $derived(
        data.members.filter((member) => (member.emails ?? []).length === 0)
    );

    const canSend = $derived(
        subject.trim().length > 0 && bodyHtml.trim().length > 0 && recipients.length > 0 && !sending
    );

    function onFilesSelected(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        files = [...files, ...Array.from(input.files ?? [])];
        input.value = "";
    }

    function removeFile(index: number) {
        files = files.filter((_, i) => i !== index);
    }

    function formatSize(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }

    const title = $derived(
        data.mode === "group" ? (data.group?.name ?? "Gruppe") : "Ausgewählte Mitglieder"
    );
</script>

<svelte:head><title>E-Mail schreiben - Intern</title></svelte:head>

<div class="space-y-8">
    <PageHeader
        {title}
        eyebrow="E-Mail"
        subtitle={data.mode === "group"
            ? `${data.group?.description || "Keine Beschreibung"} · Treffen: ${data.group?.meeting_time || "keine Angabe"}`
            : "Nachricht an die ausgewählten Mitglieder."}
        back={{ href: "/intern/members" }}
    >
        {#snippet badge()}
            <Badge tone="primary" label={data.mode === "group" ? "Gruppe" : "Eigene Auswahl"} />
        {/snippet}

        {#snippet actions()}
            {#if data.mode === "group" && data.group}
                <Button href={`/intern/groups/${data.group.id}`} variant="secondary" icon="people">
                    Gruppe öffnen
                </Button>
            {/if}
        {/snippet}
    </PageHeader>

    {#if form?.error}
        <Alert tone="danger" message={form.error} />
    {/if}

    <!--
        Der Erfolgsfall blieb bisher stumm: die Aktion gab {success, sent}
        zurueck, angezeigt wurde nur form.error. Ein gelungener Versand sah
        damit genauso aus wie gar keine Reaktion.
    -->
    {#if form?.warning}
        <Alert tone="warning" title="Teilweise versendet" message={form.warning} />
    {:else if form?.success}
        <Alert
            tone="success"
            message={`${form.sent} ${form.sent === 1 ? "Nachricht wurde" : "Nachrichten wurden"} versendet.`}
        />
    {/if}

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile label="Mitglieder" value={data.members.length} tone="primary" icon="people" />
        <StatTile label="E-Mail-Adressen" value={recipients.length} tone="success" icon="envelope" />
        <StatTile
            label="Ohne Adresse"
            value={withoutEmail.length}
            tone={withoutEmail.length > 0 ? "warning" : "neutral"}
            icon="envelope-slash"
        />
    </div>

    {#if recipients.length === 0}
        <Alert
            tone="warning"
            title="Keine Empfänger"
            message="Für die gewählten Mitglieder ist keine E-Mail-Adresse hinterlegt."
        />
    {/if}

    <form
        method="post"
        action="?/sendMail"
        enctype="multipart/form-data"
        class="space-y-8"
        use:enhance={({ formData }) => {
            sending = true;
            // Dateien und den Editorinhalt ergänzen -- beides steht nicht in
            // einem gewöhnlichen Formularfeld.
            formData.set("bodyHtml", bodyHtml);
            files.forEach((file) => formData.append("attachments", file));

            return async ({ result, update }) => {
                sending = false;

                if (result.type === "success") {
                    const sent = (result.data as { sent?: number } | undefined)?.sent ?? 0;
                    addToast(`Nachricht an ${sent} Empfänger gesendet.`, "success");
                    subject = "";
                    bodyHtml = "";
                    files = [];
                } else if (result.type === "failure") {
                    addToast("Der Versand ist fehlgeschlagen.", "error");
                }

                await update({ reset: false });
            };
        }}
    >
        {#if data.group?.id}
            <input type="hidden" name="groupId" value={data.group.id} />
        {/if}
        {#if data.mode === "members"}
            <input type="hidden" name="memberIds" value={data.members.map((m) => m.id).join(",")} />
        {/if}

        <Card title="Nachricht">
            <div class="space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField label="Betreff" required>
                        {#snippet children({ id, describedBy })}
                            <TextInput
                                {id}
                                {describedBy}
                                name="subject"
                                bind:value={subject}
                                placeholder="Einladung zum Stammesabend"
                                required
                            />
                        {/snippet}
                    </FormField>

                    <FormField label="Antwortadresse" hint="Antworten der Empfänger gehen an diese Adresse.">
                        {#snippet children({ id, describedBy })}
                            <select
                                {id}
                                aria-describedby={describedBy}
                                name="replyTo"
                                bind:value={replyTo}
                                class="w-full px-4 py-3 rounded-xl text-sm bg-surface text-fg border border-border-strong shadow-sm"
                            >
                                {#each data.replyToOptions as option (option.email)}
                                    <option value={option.email}>{option.label} ({option.email})</option>
                                {/each}
                            </select>
                        {/snippet}
                    </FormField>
                </div>

                <FormField label="Text" required>
                    {#snippet children({ id, describedBy })}
                        <RichTextEditor {id} {describedBy} bind:value={bodyHtml} placeholder="Schreibe hier deine Nachricht ..." />
                    {/snippet}
                </FormField>
            </div>
        </Card>

        <Card title="Anhänge" subtitle="Optional. Die Dateien werden an jede Nachricht angehängt.">
            <div class="space-y-3">
                <label
                    class="flex items-center justify-center gap-2 px-4 py-6 rounded-xl border border-dashed border-border-strong text-sm text-fg-muted hover:bg-surface-muted transition cursor-pointer"
                >
                    <span class="bi bi-paperclip" aria-hidden="true"></span>
                    Dateien auswählen
                    <input type="file" multiple class="sr-only" onchange={onFilesSelected} />
                </label>

                {#if files.length > 0}
                    <ul class="space-y-2">
                        {#each files as file, index (file.name + index)}
                            <li class="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-border bg-surface">
                                <span class="min-w-0">
                                    <span class="block text-sm text-fg truncate">{file.name}</span>
                                    <span class="block text-xs text-fg-subtle">{formatSize(file.size)}</span>
                                </span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    icon="x-lg"
                                    ariaLabel={`${file.name} entfernen`}
                                    onclick={() => removeFile(index)}
                                />
                            </li>
                        {/each}
                    </ul>
                {/if}
            </div>
        </Card>

        <Card title="Empfänger" meta={`${recipients.length} Adressen`}>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {#each data.members as member (member.id)}
                    <div class="border border-border rounded-xl p-3 space-y-2">
                        <p class="text-sm font-semibold text-fg flex items-center gap-2">
                            <span class="bi bi-person-circle text-fg-subtle" aria-hidden="true"></span>
                            {member.firstname} {member.lastname}
                        </p>
                        {#if (member.emails ?? []).length > 0}
                            <div class="flex flex-wrap gap-1">
                                {#each member.emails as entry (entry.email)}
                                    <Badge tone="primary" size="xs" icon="envelope" label={entry.email} />
                                {/each}
                            </div>
                        {:else}
                            <Badge tone="warning" size="xs" label="Keine E-Mail-Adresse" />
                        {/if}
                    </div>
                {/each}
            </div>
        </Card>

        <div class="flex justify-end gap-3 flex-wrap">
            <Button href="/intern/members" variant="secondary">Abbrechen</Button>
            <Button type="submit" variant="primary" icon="send" loading={sending} disabled={!canSend}>
                An {recipients.length} Empfänger senden
            </Button>
        </div>
    </form>
</div>
