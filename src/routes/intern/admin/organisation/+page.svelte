<script lang="ts">
    import {
        Alert,
        Button,
        Card,
        FormField,
        PageHeader,
        TextInput
    } from "$lib/components/ui";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const org = $derived(data.organization);
    const logoHref = $derived(org.logoFileId ? `/intern/admin/organisation/logo` : null);
</script>

<svelte:head><title>Organisation – Administration</title></svelte:head>

<div class="space-y-8">
    <PageHeader
        title="Organisation"
        eyebrow="Administration"
        subtitle="Name, Logo und Kontaktdaten. Diese Angaben erscheinen in der Kopfzeile, in E-Mails und in den PDFs."
        back={{ href: "/intern/admin" }}
    />

    {#if form?.error}<Alert tone="danger" message={form.error} />{/if}
    {#if form?.success}<Alert tone="success" message={form.success} />{/if}

    <form method="post" action="?/save" enctype="multipart/form-data" class="space-y-8">
        <Card title="Name">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Vollständiger Name" required hint="Erscheint in Kopfzeile und PDFs.">
                    {#snippet children({ id })}
                        <TextInput
                            {id}
                            name="name"
                            value={org.name}
                            placeholder="Stamm Musterstadt"
                            disabled={!data.canUpdate}
                            required
                        />
                    {/snippet}
                </FormField>
                <FormField label="Kurzform" hint="Für enge Stellen, z. B. den Browsertitel.">
                    {#snippet children({ id })}
                        <TextInput
                            {id}
                            name="shortName"
                            value={org.shortName}
                            disabled={!data.canUpdate}
                        />
                    {/snippet}
                </FormField>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <FormField label="Ort">
                    {#snippet children({ id })}
                        <TextInput {id} name="city" value={org.city} disabled={!data.canUpdate} />
                    {/snippet}
                </FormField>
                <FormField label="Kontakt-E-Mail">
                    {#snippet children({ id })}
                        <TextInput
                            {id}
                            name="contactEmail"
                            type="email"
                            value={org.contactEmail}
                            disabled={!data.canUpdate}
                        />
                    {/snippet}
                </FormField>
            </div>
        </Card>

        <Card title="Verweise" subtitle="Erscheinen in der Fußzeile.">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Website">
                    {#snippet children({ id })}
                        <TextInput
                            {id}
                            name="website"
                            value={org.website}
                            placeholder="https://…"
                            disabled={!data.canUpdate}
                        />
                    {/snippet}
                </FormField>
                <FormField label="Instagram">
                    {#snippet children({ id })}
                        <TextInput
                            {id}
                            name="instagramUrl"
                            value={org.instagramUrl}
                            placeholder="https://instagram.com/…"
                            disabled={!data.canUpdate}
                        />
                    {/snippet}
                </FormField>
                <FormField label="Impressum">
                    {#snippet children({ id })}
                        <TextInput
                            {id}
                            name="imprintUrl"
                            value={org.imprintUrl}
                            placeholder="https://…/impressum"
                            disabled={!data.canUpdate}
                        />
                    {/snippet}
                </FormField>
                <FormField label="Datenschutzerklärung">
                    {#snippet children({ id })}
                        <TextInput
                            {id}
                            name="privacyUrl"
                            value={org.privacyUrl}
                            placeholder="https://…/datenschutz"
                            disabled={!data.canUpdate}
                        />
                    {/snippet}
                </FormField>
            </div>
        </Card>

        <Card title="Erscheinungsbild">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Logo" hint="PNG, JPEG, SVG oder WebP.">
                    {#snippet children({ id })}
                        <input
                            {id}
                            type="file"
                            name="logo"
                            accept="image/png,image/jpeg,image/svg+xml,image/webp"
                            disabled={!data.canUpdate}
                            class="w-full text-sm text-fg-muted file:mr-4 file:px-4 file:py-2 file:rounded-control file:border file:border-border file:bg-surface-muted file:text-fg file:text-sm file:font-semibold"
                        />
                    {/snippet}
                </FormField>

                <FormField
                    label="Primärfarbe"
                    hint="Hex-Wert wie #2563eb. Leer lassen für das Standardblau."
                >
                    {#snippet children({ id })}
                        <TextInput
                            {id}
                            name="primaryColor"
                            value={org.primaryColor}
                            placeholder="#2563eb"
                            disabled={!data.canUpdate}
                        />
                    {/snippet}
                </FormField>
            </div>

            {#if logoHref}
                <div class="mt-4 flex items-center gap-4 flex-wrap">
                    <img
                        src={logoHref}
                        alt="Aktuelles Logo"
                        class="h-16 w-auto border border-border rounded-card bg-surface p-2"
                    />
                    <label class="flex items-center gap-2 text-sm text-fg cursor-pointer">
                        <input
                            type="checkbox"
                            name="removeLogo"
                            value="1"
                            class="border-border-strong"
                            disabled={!data.canUpdate}
                        />
                        Logo entfernen
                    </label>
                </div>
            {/if}
        </Card>

        {#if data.canUpdate}
            <div class="flex justify-end">
                <Button type="submit" variant="primary" icon="check-lg">Speichern</Button>
            </div>
        {/if}
    </form>
</div>
