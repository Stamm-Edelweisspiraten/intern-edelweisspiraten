<script lang="ts">
    import { Alert, Button, Card, FormField, PageHeader, TextInput } from "$lib/components/ui";
    import type { ActionData } from "./$types";

    let { form }: { form: ActionData } = $props();
</script>

<svelte:head><title>Gruppe anlegen - Adminbereich</title></svelte:head>

<div class="max-w-2xl mx-auto space-y-8">
    <PageHeader
        title="Neue Gruppe"
        eyebrow="Adminbereich"
        subtitle="Meute oder Sippe mit Treffzeit und Beschreibung anlegen."
        back={{ href: "/intern/admin/groups" }}
    />

    {#if form?.error}<Alert tone="danger" message={form.error} />{/if}

    <Card>
        <form method="post" class="space-y-5">
            <FormField label="Name" required>
                {#snippet children({ id, describedBy })}
                    <TextInput {id} {describedBy} name="name" placeholder="Wölflingsmeute" required />
                {/snippet}
            </FormField>

            <FormField label="Typ">
                {#snippet children({ id })}
                    <select
                        {id}
                        name="type"
                        class="w-full px-4 py-3 rounded-xl text-sm bg-surface text-fg border border-border-strong shadow-sm"
                    >
                        <option value="meute">Meute</option>
                        <option value="sippe">Sippe</option>
                    </select>
                {/snippet}
            </FormField>

            <FormField label="Treffzeit" hint="Zum Beispiel „Montags 17:00 – 18:30 Uhr“.">
                {#snippet children({ id, describedBy })}
                    <TextInput {id} {describedBy} name="meeting_time" placeholder="Montags 17:00 – 18:30 Uhr" />
                {/snippet}
            </FormField>

            <FormField label="Beschreibung">
                {#snippet children({ id, describedBy })}
                    <TextInput {id} {describedBy} name="description" placeholder="Kurze Beschreibung der Gruppe" />
                {/snippet}
            </FormField>

            <FormField label="Antwortadresse" hint="Wird bei Gruppen-E-Mails als Absender vorgeschlagen.">
                {#snippet children({ id, describedBy })}
                    <TextInput {id} {describedBy} name="replyTo" type="email" placeholder="woelflinge@example.org" />
                {/snippet}
            </FormField>

            <div class="flex justify-end gap-3">
                <Button href="/intern/admin/groups" variant="secondary">Abbrechen</Button>
                <Button type="submit" variant="primary" icon="plus-circle">Gruppe anlegen</Button>
            </div>
        </form>
    </Card>
</div>
