<script lang="ts">
    import { enhance } from "$app/forms";
    import {
        Alert, Button, Card, FormField, PageHeader, Select, TextInput
    } from "$lib/components/ui";
    import { addToast } from "$lib/toastStore";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const STAENDE = [
        "Neuling-Wölfling",
        "Wölfling",
        "Neuling-Pfadfinder",
        "Jungpfadfinder",
        "Knappe",
        "Pfadfinder",
        "Späher",
        "Kreuzpfadfinder"
    ];

    const STATUS = ["aktiv", "passiv", "gekündigt"];

    let submitting = $state(false);

    let emails = $state([{ label: "", email: "" }]);
    let numbers = $state([{ label: "", number: "" }]);
    let selectedGroups = $state<string[]>([]);

    let isSecondMember = $state(false);

    /**
     * Die Beitragshaken gelten jetzt für ALLE Mitglieder. Vorher wurden sie
     * für reguläre Mitglieder zwangsweise abgewählt und von der Berechnung
     * ohnehin ignoriert, sodass jedes reguläre Mitglied den vollen Beitrag
     * zahlte — auch wenn etwas anderes eingetragen war.
     */
    let dues = $state({ stamm: true, gau: true, landesmark: true, bund: true });

    function addEmail() {
        emails = [...emails, { label: "", email: "" }];
    }
    function removeEmail(index: number) {
        emails = emails.filter((_, i) => i !== index);
    }

    function addNumber() {
        numbers = [...numbers, { label: "", number: "" }];
    }
    function removeNumber(index: number) {
        numbers = numbers.filter((_, i) => i !== index);
    }

    function addGroup() {
        selectedGroups = [...selectedGroups, data.groups?.[0]?.id ?? ""];
    }
    function removeGroup(index: number) {
        selectedGroups = selectedGroups.filter((_, i) => i !== index);
    }

    function resetState() {
        emails = [{ label: "", email: "" }];
        numbers = [{ label: "", number: "" }];
        selectedGroups = [];
        isSecondMember = false;
        dues = { stamm: true, gau: true, landesmark: true, bund: true };
    }

    const inputClass =
        "w-full px-3 py-2 rounded-control text-sm bg-surface text-fg border border-border-strong";
</script>

<svelte:head><title>Mitglied anlegen - Intern</title></svelte:head>

<div class="max-w-4xl mx-auto space-y-8">
    <PageHeader
        title="Neues Mitglied"
        eyebrow="Mitgliedverwaltung"
        subtitle="Stammdaten, Kontakt, Gruppen und Beiträge."
        back={{ href: "/intern/members" }}
    />

    {#if form?.error}
        <Alert tone="danger" message={form.error} />
    {/if}

    <!--
        Die Action heisst `createMember`; ohne `?/createMember` sucht
        SvelteKit eine Action namens "default" und antwortet mit 404. Das
        Formular schickte bisher ohne Angabe ab -- das Anlegen kam damit nie
        beim Server an.
    -->
    <form
        method="post"
        action="?/createMember"
        enctype="multipart/form-data"
        class="space-y-8"
        use:enhance={() => {
            submitting = true;
            return async ({ result, update }) => {
                submitting = false;

                if (result.type === "success") {
                    const name = (result.data as { memberName?: string } | undefined)?.memberName;
                    addToast(
                        name ? `${name} wurde angelegt.` : "Das Mitglied wurde angelegt.",
                        "success"
                    );
                    resetState();
                    await update();
                    return;
                }

                await update({ reset: false });
            };
        }}
    >
        <input type="hidden" name="groups" value={JSON.stringify(selectedGroups)} />

        <Card title="Person">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Vorname" required>
                    {#snippet children({ id, describedBy })}
                        <TextInput {id} {describedBy} name="firstname" required autocomplete="given-name" />
                    {/snippet}
                </FormField>

                <FormField label="Nachname" required>
                    {#snippet children({ id, describedBy })}
                        <TextInput {id} {describedBy} name="lastname" required autocomplete="family-name" />
                    {/snippet}
                </FormField>

                <FormField label="Fahrtenname" hint="Optional.">
                    {#snippet children({ id, describedBy })}
                        <TextInput {id} {describedBy} name="fahrtenname" />
                    {/snippet}
                </FormField>

                <FormField label="Geburtsdatum" required>
                    {#snippet children({ id, describedBy })}
                        <TextInput {id} {describedBy} name="birthday" type="date" required />
                    {/snippet}
                </FormField>
            </div>
        </Card>

        <Card title="Anschrift">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Straße und Hausnummer" required class="md:col-span-2">
                    {#snippet children({ id, describedBy })}
                        <TextInput {id} {describedBy} name="address_street" placeholder="Beispielweg 1" required />
                    {/snippet}
                </FormField>

                <FormField label="Postleitzahl" required>
                    {#snippet children({ id, describedBy })}
                        <TextInput {id} {describedBy} name="address_zip" placeholder="28195" required />
                    {/snippet}
                </FormField>

                <FormField label="Ort" required>
                    {#snippet children({ id, describedBy })}
                        <TextInput {id} {describedBy} name="address_city" placeholder="Bremen" required />
                    {/snippet}
                </FormField>
            </div>
        </Card>

        <Card title="Mitgliedschaft">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField label="Stand">
                    {#snippet children({ id })}
                        <Select
                            {id}
                            name="stand"
                            options={STAENDE.map((stand) => ({ value: stand, label: stand }))}
                        />
                    {/snippet}
                </FormField>

                <FormField label="Status">
                    {#snippet children({ id })}
                        <Select
                            {id}
                            name="status"
                            options={STATUS.map((status) => ({ value: status, label: status }))}
                        />
                    {/snippet}
                </FormField>

                <FormField label="Eintrittsdatum">
                    {#snippet children({ id })}
                        <TextInput {id} name="joined" type="date" />
                    {/snippet}
                </FormField>
            </div>
        </Card>

        <Card title="Beiträge" subtitle="Welche Beitragsanteile zahlt dieses Mitglied?">
            <div class="space-y-4">
                <label class="flex items-start gap-3 px-4 py-3 rounded-card border border-border cursor-pointer">
                    <input type="checkbox" name="is_second_member" bind:checked={isSecondMember} class="mt-1 rounded-control border-border-strong" />
                    <span>
                        <span class="block text-sm font-semibold text-fg">Zweitmitglied</span>
                        <span class="block text-xs text-fg-subtle">
                            Wird als Vermerk auf der Beitragsrechnung ausgewiesen.
                        </span>
                    </span>
                </label>

                <fieldset class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <legend class="text-sm font-semibold text-fg-muted mb-2">Beitragsanteile</legend>
                    {#each [["stamm", "Stamm"], ["gau", "Gau"], ["landesmark", "Landesmark"], ["bund", "Bund"]] as [key, label] (key)}
                        <label class="flex items-center gap-2 px-3 py-2 rounded-control border border-border cursor-pointer hover:bg-surface-muted transition">
                            <input
                                type="checkbox"
                                name={`dues_${key}`}
                                bind:checked={dues[key as keyof typeof dues]}
                                class="rounded-control border-border-strong"
                            />
                            <span class="text-sm text-fg">{label}</span>
                        </label>
                    {/each}
                </fieldset>
                <p class="text-xs text-fg-subtle">
                    Abgewählte Anteile werden dem Mitglied nicht berechnet.
                </p>
            </div>
        </Card>

        <Card title="Kontakt">
            <div class="space-y-6">
                <fieldset class="space-y-2">
                    <legend class="text-sm font-semibold text-fg-muted mb-2">E-Mail-Adressen</legend>
                    {#each emails as entry, index (index)}
                        <div class="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2 items-end">
                            <label class="text-xs text-fg-subtle">
                                Bezeichnung
                                <input bind:value={entry.label} name={`email_label_${index}`} placeholder="Mutter" class={`mt-1 ${inputClass}`} />
                            </label>
                            <label class="text-xs text-fg-subtle">
                                E-Mail
                                <input bind:value={entry.email} name={`email_email_${index}`} type="email" placeholder="name@example.org" class={`mt-1 ${inputClass}`} />
                            </label>
                            <Button variant="ghost" size="sm" icon="trash" ariaLabel="E-Mail entfernen" onclick={() => removeEmail(index)} />
                        </div>
                    {/each}
                    <Button variant="secondary" size="sm" icon="plus-lg" onclick={addEmail}>
                        E-Mail hinzufügen
                    </Button>
                </fieldset>

                <fieldset class="space-y-2">
                    <legend class="text-sm font-semibold text-fg-muted mb-2">Telefonnummern</legend>
                    {#each numbers as entry, index (index)}
                        <div class="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2 items-end">
                            <label class="text-xs text-fg-subtle">
                                Bezeichnung
                                <input bind:value={entry.label} name={`number_label_${index}`} placeholder="Mobil" class={`mt-1 ${inputClass}`} />
                            </label>
                            <label class="text-xs text-fg-subtle">
                                Nummer
                                <input bind:value={entry.number} name={`number_number_${index}`} type="tel" placeholder="0170 1234567" class={`mt-1 ${inputClass}`} />
                            </label>
                            <Button variant="ghost" size="sm" icon="trash" ariaLabel="Nummer entfernen" onclick={() => removeNumber(index)} />
                        </div>
                    {/each}
                    <Button variant="secondary" size="sm" icon="plus-lg" onclick={addNumber}>
                        Telefonnummer hinzufügen
                    </Button>
                </fieldset>
            </div>
        </Card>

        <Card title="Gruppen">
            <div class="space-y-2">
                {#each selectedGroups as groupId, index (index)}
                    <div class="flex gap-2 items-center">
                        <label class="sr-only" for={`group-${index}`}>Gruppe {index + 1}</label>
                        <div class="flex-1">
                            <Select
                                id={`group-${index}`}
                                bind:value={selectedGroups[index]}
                                options={(data.groups ?? []).map((group) => ({
                                    value: group.id,
                                    label: group.name
                                }))}
                            />
                        </div>
                        <Button variant="ghost" size="sm" icon="trash" ariaLabel="Gruppe entfernen" onclick={() => removeGroup(index)} />
                    </div>
                {/each}
                <Button variant="secondary" size="sm" icon="plus-lg" onclick={addGroup}>
                    Gruppe hinzufügen
                </Button>
            </div>
        </Card>

        <Card title="Einwilligungen und Unterlagen">
            <div class="space-y-4">
                <fieldset class="space-y-2">
                    <legend class="text-sm font-semibold text-fg-muted mb-2">Veröffentlichung von Bildern</legend>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {#each [["consent_social", "Soziale Medien"], ["consent_website", "Webseite"], ["consent_print", "Druckerzeugnisse"]] as [name, label] (name)}
                            <label class="flex items-center gap-2 px-3 py-2 rounded-control border border-border cursor-pointer hover:bg-surface-muted transition">
                                <input type="checkbox" {name} class="rounded-control border-border-strong" />
                                <span class="text-sm text-fg">{label}</span>
                            </label>
                        {/each}
                    </div>
                </fieldset>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField label="Einwilligungserklärung" hint="PDF, PNG oder JPEG.">
                        {#snippet children({ id })}
                            <input
                                {id}
                                type="file"
                                name="consent_file"
                                accept=".pdf,image/png,image/jpeg"
                                class="w-full text-sm text-fg-muted file:mr-3 file:px-4 file:py-2 file:rounded-control file:border-0 file:bg-primary-soft file:text-primary-soft-fg file:font-semibold"
                            />
                        {/snippet}
                    </FormField>

                    <FormField label="Aufnahmeantrag" hint="PDF, PNG oder JPEG.">
                        {#snippet children({ id })}
                            <input
                                {id}
                                type="file"
                                name="application_file"
                                accept=".pdf,image/png,image/jpeg"
                                class="w-full text-sm text-fg-muted file:mr-3 file:px-4 file:py-2 file:rounded-control file:border-0 file:bg-primary-soft file:text-primary-soft-fg file:font-semibold"
                            />
                        {/snippet}
                    </FormField>
                </div>
            </div>
        </Card>

        <div class="flex justify-end gap-3 flex-wrap">
            <Button href="/intern/members" variant="secondary">Abbrechen</Button>
            <Button type="submit" variant="primary" icon="person-plus" loading={submitting}>
                Mitglied anlegen
            </Button>
        </div>
    </form>
</div>
